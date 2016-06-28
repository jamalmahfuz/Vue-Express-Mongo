'use strict';

let logger 			= require('./logger');
let config 			= require("../config");
let secrets 		= require("./secrets");

let	path 			= require('path');
let	fs 				= require('fs');
let	http 			= require('http');
let _ 				= require("lodash");

let	cookieParser 	= require('cookie-parser');
let	passport 		= require('passport');
let	socketio 		= require('socket.io');
let	session 		= require('express-session');
let	MongoStore 		= require('connect-mongo')(session);

let socketHandlers  = require('../applogic/socketHandlers');

let self = {

	/*
		IO namespaces
	 */
	namespaces: {},

	/**
	 * Init Socket.IO module and looad socket handlers 
	 * from applogic
	 * 
	 * @param  {Object} app Express App
	 * @param  {Object} db  MongoDB connection
	 */
	init(app, db) {

		// Create a new HTTP server
		let server = http.createServer(app);

		// Create a MongoDB storage object
		var mongoStore = new MongoStore({
			mongooseConnection: db.connection,
			collection: config.sessions.collection,
			autoReconnect: true
		});

		// Create a new Socket.io server
		var IO = socketio(server);

		// Add common handler to the root namespace
		self.initNameSpace("/", IO, mongoStore);
		IO.on('connection', function (socket) {
			socket.on("welcome", function(msg) {
				logger.info("Incoming welcome message from " + socket.request.user.username + ":", msg);
			});
		});

		// Initialize every socket handler
		socketHandlers.handlers.forEach((handler) => {
			let Handler = require(path.resolve(handler));

			if (!Handler || !Handler.namespace) return;

			let io = self.namespaces[Handler.namespace];
			if (io == null) {
				io = IO.of(Handler.namespace);
				self.initNameSpace(Handler.namespace, io, mongoStore);
				
				if (_.isFunction(Handler.init))
					Handler.init(io);
			}
		});

		app.io = self;

		return server;
	},

	/**
	 * Initialize IO namespace. Apply authentication middleware
	 * 
	 * @param  {String} ns         Name of namespace
	 * @param  {Object} io         IO instance
	 * @param  {Object} mongoStore Mongo Session store
	 */
	initNameSpace(ns, io, mongoStore) {
		
		// Intercept Socket.io's handshake request
		io.use(function (socket, next) {
			// Use the 'cookie-parser' module to parse the request cookies
			cookieParser(secrets.sessionSecret)(socket.request, {}, function (err) {
				// Get the session id from the request cookies
				var sessionId = socket.request.signedCookies ? socket.request.signedCookies[config.sessions.name] : undefined;

				if (!sessionId) {
					logger.warn('sessionId was not found in socket.request');
					return next(new Error('sessionId was not found in socket.request'), false);
				}

				// Use the mongoStorage instance to get the Express session information
				mongoStore.get(sessionId, function (err, session) {
					if (err) return next(err, false);
					if (!session) return next(new Error('session was not found for ' + sessionId), false);

					// Set the Socket.io session information
					socket.request.session = session;

					// Set the socketID to session
					session.socket = socket.id;
					mongoStore.set(sessionId, session);

					// Use Passport to populate the user details
					passport.initialize()(socket.request, {}, function () {
						passport.session()(socket.request, {}, function () {
							if (socket.request.user) {
								next(null, true);
							} else {
								logger.warn('Websocket user is not authenticated!');
								next(new Error('User is not authenticated'), false);
							}
						});
					});
				});
			});
		});

		// Add an event listener to the 'connection' event
		io.on('connection', function (socket) {
			logger.debug("WS client connected to namespace " + (io.name || "root") + "! User: " + socket.request.user.username);

			socket.on('disconnect', function() {
				logger.debug("WS client disconnected from namespace " + (io.name || "root") + "!");
			});
		});

		self.namespaces[ns] = io;
	}

};

module.exports = self;