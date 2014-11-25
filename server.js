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
console.log('Websocket server created');

var sockets = {};
var players = {};
var handled_deltas = {};
var delta_queues = {};

var hits = [];
var kills = [];

var socket_id_counter = 0;
var num_connections = 0;
var server_time = 0;
var tick_rate = 66;
var t1 = new Date().getTime();
var t2 = new Date().getTime();

var game_loop = function() {

	Object.keys(players).forEach(function(v) {
		if (players[v].status === 'not_ready') {
			console.log('Sending init request to', v);
			send_to_one(v, 's_ready_to_init', { player: players[v] });
		} else if (players[v].status === 'ready' && players[v].health > 0) {
			var last = apply_delta_queue(v);
			// TODO validate deltas
			send_to_one(v, 's_handled_deltas', handled_deltas[v]);
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

	setTimeout(game_loop, tick_rate);
};

var handle_delta = function(socket_id, delta) {
	delta_queues[socket_id].push(delta);
};

var apply_delta_queue = function(socket_id) {
	delta_queues[socket_id].forEach(function(v) {
		core.applyDelta(players[socket_id], v);
		handled_deltas[socket_id]++;
	});
	delta_queues[socket_id] = [];
};

var update_mouse_state = function(socket_id, mouse_state) {
	if (players[socket_id].status !== 'ready') return;
	players[socket_id].mouseState = mouse_state;
};

var fire = function(socket_id, source, direction) {
	var hit_target = null;
	var impact_point = null;
	var hit_data = core.fire(players, socket_id, source, direction);
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
		case 'c_initialized':
			console.log('Player', socket_id, 'is ready to roll');
			players[socket_id].status = 'ready';
			break;
		case 'c_delta':
			handle_delta(socket_id, data);
			break;
		case 'c_mouse_state':
			//update_mouse_state(socket_id, data);
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

var send_to_one = function(socket_id, message, data) {
	if (sockets[socket_id] && sockets[socket_id].readyState === 1) {
		sockets[socket_id].send(JSON.stringify({message: message, data: data}));
	}
};

var send_to_all = function(message, data) {
	Object.keys(sockets).forEach(function(v) {
		send_to_one(v, message, data);
	});	
};

game_loop();
