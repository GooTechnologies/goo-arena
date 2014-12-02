'use strict';
var WebSocketServer = require('ws').Server;
var http = require('http');
var express = require('express');
var app = express();
var port = process.env.PORT || 5000;

var GameCore = require('./core.js');
var core = new GameCore();
console.log('Loaded core');

app.use(express.static(__dirname + "/"));

var server = http.createServer(app);
server.listen(port);
console.log('Listening on port', port);

var wss = new WebSocketServer({server: server});
console.log('Server created');

// Stores connections
// With the same IDs as players
var sockets = {};

// Keep track of average tick length for interpolation when shot is fired
var recent_ticks = [tick_rate, tick_rate, tick_rate, tick_rate, tick_rate];
var average_tick_rate = tick_rate;

// Some server state 
var socket_id_counter = 0;
var tick_rate = 50;
var tick_length = tick_rate;
var update_time = new Date().getTime()
var ping_rate = 3000;
var ping_time = new Date().getTime();


// The mighty game loop
var game_loop = function() {

	core.updateInterpolationState();
	core.updatePlayers(tick_length);

	core.spawnedPlayers.forEach(function(v) {
		send_to_all('s_player_spawned', v);
	});
	
	send_to_all('s_players', { 
		players: core.players,
		shots: core.shots,
		hits: core.hits,
		kills: core.kills,
		server_time: new Date().getTime()
	 });

	core.resetActions();

	tick_length = new Date().getTime() - update_time;

	// Keep an eye on latency
	if (new Date().getTime() - ping_time > ping_rate) {
		send_to_all('s_ping');
		ping_time = new Date().getTime();
	}

	calculate_average_tick_length(tick_length);
	update_time = new Date().getTime();
	
	setTimeout(game_loop, tick_rate);
};


// Keep an eye on how fast the server is working
var calculate_average_tick_length = function(last_tick_length) {
	recent_ticks.shift();
	recent_ticks.push(last_tick_length);
	average_tick_rate = 0;
	recent_ticks.forEach(function(v) {
		average_tick_rate += v;
	});
	average_tick_rate /= recent_ticks.length;
};


// A user has fired. See if someone got hit, using positions from the past.
var fire = function(socket_id, source, direction) {
	var hit_data = core.fire(update_time, average_tick_rate, socket_id, source, direction);
	// Send hit confirmation ASAP
	if (hit_data.target_id > -1) {
		send_to_one(socket_id, 's_hit_target', hit_data );
	}
};


var handle_message = function(socket_id, message, data, seq) {
	switch (message) {
		case 'c_pong':
			core.setPlayerValue(socket_id, 'latency', (new Date().getTime() - ping_time)/2);
			break;
		case 'c_delta':
			core.pushDelta(socket_id, data);
			break;
		case 'c_fire':
			fire(socket_id, data.source, data.direction);
			break;
		case 'c_name':
			core.setPlayerValue(socket_id, 'name', data);
			break;
		default:
			console.error('Unknown message:', message);
			break;
	}
};


wss.on('connection', function(ws) {
	var socket_id, player, init_data;

	socket_id = socket_id_counter++;
	sockets[socket_id] = ws;
	player = core.newPlayer(socket_id);

	console.log('---------------------------------------------------');
	console.log('New player:', socket_id, player);
	console.log('---------------------------------------------------');

	ws.onmessage = function(messageString) {
		var message, data, seq;
		message = JSON.parse(messageString.data).message;
		data = JSON.parse(messageString.data).data;
		seq = JSON.parse(messageString.data).seq;
		handle_message(socket_id, message, data, seq);
	};

	ws.on('open', function() {
		console.log('Server OPEN');
		ws.send('s_server_open');
	});

	ws.on('error', function(error) {
		console.error('Server ERROR', error);
	});

	ws.on('close', function() {
		console.log('---------------------------------------------------');
		console.log('Disconnected:', socket_id, core.players[socket_id].name, socket_id);
		console.log('---------------------------------------------------');
		delete sockets[socket_id];
		core.removePlayer(socket_id);
		send_to_all('s_player_disconnected', socket_id);
	});

	var init_data = {
		player: player,
		constants: core.constants,
		occluders: core.occluders,
	};

	send_to_one(socket_id, 's_init', init_data);
	send_to_all('s_player_connected', player);

});


// Send a message to a specific player
var send_to_one = function(socket_id, message, data) {
	if (sockets[socket_id] && sockets[socket_id].readyState === 1) {
		sockets[socket_id].send(JSON.stringify({ socket_id: socket_id, message: message, data: data}));
	}
};


// Send a message to all players
var send_to_all = function(message, data) {
	Object.keys(sockets).forEach(function(v) {
		send_to_one(v, message, data);
	});	
};


console.log('Starting game loop');
game_loop();
