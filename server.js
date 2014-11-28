var WebSocketServer = require('ws').Server
var http = require('http')
var express = require('express')
var app = express()
var port = process.env.PORT || 5000

var GameCore = require('./core.js');
var core = new GameCore();
console.log('Loaded core');

app.use(express.static(__dirname + "/"))

var server = http.createServer(app);
server.listen(port);
console.log('Listening on port', port);

var wss = new WebSocketServer({server: server});
console.log('Server created')

// Stores connections
var sockets = {};

// Stuff we can't shoot
var occluders = core.generateOccluders();
console.log('Occluders', occluders);

// Player state (same ID as sockets)
var players = {};

// Previous player state (only what's neccessary for interpolation)
var state_old = {};

// There could be several of these per udpate frame, no need to send instantly
var shots = [];
var hits = [];
var kills = [];

// Keep track of average tick length for interpolation when shot is fired
var recent_ticks = [tick_rate, tick_rate, tick_rate, tick_rate, tick_rate];
var average_tick_rate = tick_rate;

// Inputs from the client
var handled_deltas = {};
var delta_queues = {};

// Some server state 
var socket_id_counter = 0;
var num_connections = 0;
var server_time = 0;
var tick_rate = 50;
var tick_length = tick_rate;
var update_time = new Date().getTime();
var pings = {};
var ping_rate = 1000;
var ping_time = new Date().getTime();


// The mighty game loop
var game_loop = function() {

	// state_older 	<-- state_old
	// state_old   	<-- players
	// players  	<-- (new state)
	update_interpolation_state();
	update_players();
	
	// Send the updated players
	send_to_all('s_players', { 
		players: players,
		shots: shots,
		hits: hits,
		kills: kills,
		server_time: new Date().getTime()
	 });

	// Reset
	shots = [];
	kills = [];
	hits = [];

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

var update_players = function() {
	Object.keys(players).forEach(function(v) {

		if (players[v].timeToSpawn > 0 && players[v].alive === false) {
			// Player is dead and waiting to spawn
			players[v].timeToSpawn -= tick_length;
		} 

		if (players[v].timeToSpawn <= 0 && players[v].alive === false) {
			// Player has waited long enough
			core.spawnPlayer(players[v], occluders);
			console.log('Player', v, 'spawned');
			send_to_all('s_player_spawned', players[v]);
		} 

		if (players[v].timeToSpawn <= 0 && players[v].alive === true) {
			// Player is alive and active
			apply_delta_queue(v);
		}

	});	
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
		core.applyDelta(players[socket_id], v, players, occluders);
		handled_deltas[socket_id]++;
	});
	delta_queues[socket_id] = [];
};

// A user has fired. See if someone got hit, using positions from the past.
var fire = function(socket_id, source, direction) {
	//console.log('Fire!');

	if (players[socket_id].alive === false) {
		console.log(players[socket_id].name, 'can\'t shoot because of death! :(');
		return;
	}

	shots.push({ shooter: socket_id, source: source });
	// TODO validate shooter position
	var hit_data = core.fire(players, state_old, update_time, average_tick_rate, players[socket_id].latency, socket_id, source, direction, occluders);
	if (hit_data.target_id > -1) {
		hits.push( { shooter: socket_id, victim: hit_data.target_id, point: hit_data.point } );
		console.log(players[hit_data.target_id].name, 'got hit by', players[socket_id].name, '!');
		if (players[hit_data.target_id].health === 0) {

			players[hit_data.target_id].deaths++;
			players[socket_id].kills++;

			send_to_all('s_player_killed', { shooter: socket_id, victim: hit_data.target_id });
			console.log(players[hit_data.target_id].name, 'got killed by', players[socket_id].name, '!');
			// Add to list of recent kills
			kills.push( { shooter: socket_id, victim: hit_data.target_id } );
			// Reset	
			core.killPlayer(players[hit_data.target_id]);
		}
		// Instantly send shot confirmation to the shooter for fast feedback
		// Don't wait for the next server update, snappy shots is important!
		send_to_one(socket_id, 's_hit_target', hit_data );
	}
};

var handle_message = function(socket_id, message, data, seq) {
	switch (message) {
		case 'c_pong':
			players[socket_id].latency = (new Date().getTime() - ping_time)/2;
			break;
		case 'c_delta':
			handle_delta(socket_id, data);
			break;
		case 'c_fire':
			fire(socket_id, data.source, data.direction);
			break;
		case 'c_name':
			players[socket_id].name = data;
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
	players[socket_id] = core.newPlayer(socket_id, occluders);
	handled_deltas[socket_id] = 0;
	delta_queues[socket_id] = [];

	console.log('---------------------------------------------------');
	console.log('New player:', socket_id, players[socket_id].name);
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
		console.log('Disconnected:', socket_id, players[socket_id].name);
		console.log('---------------------------------------------------');
		delete sockets[socket_id];
		delete players[socket_id];
		num_connections--;
		send_to_all('s_player_disconnected', socket_id);
	});

	var init_data = {
		player: players[socket_id],
		core: core,
		occluders: occluders
	}

	send_to_one(socket_id, 's_init', init_data);
	send_to_all('s_player_connected', players[socket_id]);

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
