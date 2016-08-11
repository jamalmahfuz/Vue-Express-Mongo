"use strict";

let ROOT 			= "../../../";

let logger 			= require(ROOT + "core/logger");
let config 			= require(ROOT + "config");
let moduleConfig	= require("./module.json");

module.exports = {

	namespace: moduleConfig.namespace,
	//role: "admin",

	init(io) {
		io.on("connection", (socket) => {

			// Handle imcoming websocket messages
			// 
			// For example:
			// 
			// 	socket.on("message", function(payload) {
			// 		console.log(payload + " received from " + socket.request.user.username);
			// 	}
			// 	
			
		});		
	}
};