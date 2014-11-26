var WebSocketServer = require('ws').Server
var http = require('http')
var express = require('express')
var app = express()
var port = process.env.PORT || 5000

var coreModule = require('./core.js');
var core = new coreModule.GameCore();
console.log('Loaded core');

app.use(express.static(__dirname + "/"))

var server = http.createServer(app);
server.listen(port);
console.log('Listening on port', port);

var wss = new WebSocketServer({server: server});
console.log('Server created')

var sockets = {};

// Real time players
var players = {};

// Keep track of last state
var state_old = {};

// Keep track of average tick length for interpolation when shot is fired
var recent_ticks = [tick_rate, tick_rate, tick_rate, tick_rate, tick_rate];
var average_tick_rate = tick_rate;

var handled_deltas = {};
var delta_queues = {};

var hits = [];
var kills = [];

var socket_id_counter = 0;
var num_connections = 0;
var server_time = 0;
var tick_rate = 50;
var update_time = new Date().getTime();

var pings = {};
var ping_rate = 1000;
var ping_time = new Date().getTime();

// The mighty game loop
var game_loop = function() {

	// state_older 	<-- state_old
	// state_old   	<-- players
	update_interpolation_state();

	// players  	<-- (new state)
	Object.keys(players).forEach(function(v) {
		if (players[v].status === 'not_ready') {
			console.log('Sending init request to', v);
			pings[v] = new Date().getTime();
			send_to_one(v, 's_ready_to_init', { player: players[v] });
		} else if (players[v].status === 'ready' && players[v].health > 0) {
			apply_delta_queue(v);
		}
	});
	send_to_all('s_players', { 
		players: players, 
		hits: hits,
		kills: kills,
		server_time: new Date().getTime()
	 });
	kills = [];
	hits = [];

	if (new Date().getTime() - ping_time > ping_rate) {
		ping_time = new Date().getTime();
		send_to_all('s_ping');
	}

	calculate_average_tick_length(new Date().getTime() - update_time);
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

// Update interpolation states old and older
var update_interpolation_state = function() {
	state_older = {};
	Object.keys(state_old).forEach(function(v) {
		state_older[v] = core.copyForInterpolation(state_old[v]);
	});
	state_old = {};
	Object.keys(players).forEach(function(v) {
		state_old[v] = core.copyForInterpolation(players[v]);
	});
};

// Push a delta to the queue for processing next update iteration
var handle_delta = function(socket_id, delta) {
	delta_queues[socket_id].push(delta);
};

// Apply a queue of deltas, reset the queue afterwards
var apply_delta_queue = function(socket_id) {
	delta_queues[socket_id].forEach(function(v) {
		core.applyDelta(players[socket_id], v);
		handled_deltas[socket_id]++;
	});
	delta_queues[socket_id] = [];
};

// A user has fired. See if someone got hit, using positions from the past.
var fire = function(socket_id, source, direction) {

	// TODO validate shooter position
	var hit_data = core.fire(players, state_old, update_time, average_tick_rate, players[socket_id].latency, socket_id, source, direction);
	if (hit_data.target_id > -1) {
		hits.push({shooter: socket_id, victim: hit_data.target_id, point: hit_data.point});
		if (players[hit_data.target_id].health === 0) {
			kills.push({shooter: socket_id, victim: hit_data.target_id});	
			players[hit_data.target_id].health = -1;
		}
		send_to_one(socket_id, 's_hit_target', hit_data );
	}
};

var handle_message = function(socket_id, message, data, seq) {
	
	switch (message) {
		case 'c_pong':
			console.log('pong', (new Date().getTime() - ping_time)/2);
			players[socket_id].latency = (new Date().getTime() - ping_time)/2;
			break;
		case 'c_initialized':
			if (!players[socket_id].latency) players[socket_id].latency = (new Date().getTime() - pings[socket_id])/2;
			players[socket_id].status = 'ready';
			break;
		case 'c_delta':
			handle_delta(socket_id, data);
			break;
		case 'c_fire':
			fire(socket_id, data.source, data.direction);
			break;
		default:
			console.error('Unknown message:', message);
			break;
	}
};

wss.on('connection', function(ws) {
	var socket_id;

	num_connections++;
	socket_id = socket_id_counter++;
	sockets[socket_id] = ws;
	players[socket_id] = core.newPlayer(socket_id);
	handled_deltas[socket_id] = 0;
	delta_queues[socket_id] = [];

	console.log('---------------------------------------------------');
	console.log('New connection:', socket_id);
	console.log('New player:', players[socket_id]);
	console.log('Num connections', num_connections);
	console.log('Connected sockets:');
	Object.keys(sockets).forEach(function(v) {
		console.log(v);
	});
	console.log('---------------------------------------------------');

	ws.onmessage = function(messageString) {
		var message, data, seq;
		message = JSON.parse(messageString.data).message;
		data = JSON.parse(messageString.data).data;
		seq = JSON.parse(messageString.data).seq;
		handle_message(socket_id, message, data, seq);
	};

	ws.on('error', function(error) {
		console.error('ERROR', error);
	});

	ws.on('close', function() {
		console.log('---------------------------------------------------');
		console.log('Disconnected', socket_id);
		delete sockets[socket_id];
		delete players[socket_id];
		num_connections--;
		send_to_all('s_removed_player', {id: socket_id});
		console.log('Num connections', num_connections);
		console.log('Connected sockets:');
		Object.keys(sockets).forEach(function(v) {
			console.log(v);
		});
		console.log('---------------------------------------------------');
	});

});

// Send a message to a specific player
var send_to_one = function(socket_id, message, data) {
	if (sockets[socket_id] && sockets[socket_id].readyState === 1) {
		sockets[socket_id].send(JSON.stringify({message: message, data: data}));
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
