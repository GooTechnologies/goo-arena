'use strict';
var Vector3 = require('./vector3.js');

function GameCore() {

	this.constants = {
		moveSpeed: 8,
		turnSpeed: -0.001,
		forward: new Vector3(0, 0, -1),
		left: new Vector3(-1, 0, 0),
		hitRadius: 1,
		spawnLimit: 20,
		aimHeight: 2,
		spawnTime: 5000,
		numOccluders: 6,
		occluderRadiusMin: 4,
		occluderRadiusMax: 12,
		occluderSpawnLimit: 40,
		walls: 50,
		startHealth: 10
	};

	this.kills = [];
	this.shots = [];
	this.hits = [];
	this.spawnedPlayers = [];

	this.players = {};
	this.playersOld = {};

	this.handledDeltas = {};
	this.deltaQueues = {};

	this.occluders = [];
	this.generateOccluders();

}

GameCore.prototype.resetActions = function() {
	this.spawnedPlayers = [];
	this.kills = [];
	this.hits = [];
	this.shots = [];
};


GameCore.prototype.updatePlayers = function(tickLength) {
	var p;
	var that = this;

	Object.keys(this.players).forEach(function(v) {
		p = that.players[v];
		if (p.alive === false) {
			if (p.timeToSpawn > 0) {
				p.timeToSpawn -= tickLength;
			} else {
				that.spawnPlayer(v);
				that.spawnedPlayers.push(p);
			}
		} else {
			that.applyDeltaQueue(v);
		}

	});

};

GameCore.prototype.setPlayerValue = function(id, key, value) {
	this.players[id][key] = value;
};

GameCore.prototype.pushDelta = function(id, delta) {
	if (this.players[id].alive) {
		this.deltaQueues[id].push(delta);
	}
};

GameCore.prototype.applyDeltaQueue = function(id) {
	var that = this;
	this.deltaQueues[id].forEach(function(v) {
		that.applyDelta(id, v);
		that.handledDeltas[id]++;
	});
	this.deltaQueues[id] = [];
};


GameCore.prototype.updateInterpolationState = function() {
	var that = this;
	this.playersOld = {};
	Object.keys(this.players).forEach(function(v) {
		that.playersOld[v] = that.copyForInterpolation(v);
	});
};

// Find a non-occluded player spot
// TODO check for player-player collisions
GameCore.prototype.freeSpot = function() {
	var that = this;
	var position, d;
	var clear = false;
	while (!clear) {
		clear = true;
		position = new Vector3(
			this.getRandomArbitrary(-this.constants.spawnLimit, this.constants.spawnLimit),
			0, 
			this.getRandomArbitrary(-this.constants.spawnLimit, this.constants.spawnLimit)
		);
		this.occluders.forEach(function(v) {
			d = Vector3.sub(position, v.position);
			if (d.mag() < that.hitRadius + v.radius + 2) {
				clear = false;
			}
		});	
	}
	return position;
};


GameCore.prototype.newPlayer = function(id) {
	this.players[id] = {
		id: id,
		name: 'Goon #' + this.getRandomInt(1, 999),
		kills: 0,
		deaths: 0,
		alive: false,
		timeToSpawn: 3000, // Give the client some time to init and set name
		position: this.freeSpot(),
		rotation: [0, 0],
		latency: 50, // Guess
		health: this.constants.startHealth,
		color: [
			this.getRandomArbitrary(0, 1),
			this.getRandomArbitrary(0, 1), 
			this.getRandomArbitrary(0, 1)
		]
	};
	this.handledDeltas[id] = 0;
	this.deltaQueues[id] = [];
	return this.players[id];
};


GameCore.prototype.removePlayer = function(id) {
	delete this.players[id];
};


GameCore.prototype.generateOccluders = function() {
	for (var i = 0; i < this.constants.numOccluders; i++) {
		var occluder = {
			radius: this.getRandomArbitrary(this.constants.occluderRadiusMin, this.constants.occluderRadiusMax),
			position: new Vector3(
				this.getRandomArbitrary(-this.constants.occluderSpawnLimit, this.constants.occluderSpawnLimit), 
				-2,
				this.getRandomArbitrary(-this.constants.occluderSpawnLimit, this.constants.occluderSpawnLimit)
			)
		};
		this.occluders.push(occluder);
	}
};


GameCore.prototype.spawnPlayer = function(id) {
	var player = this.players[id];
	player.position = this.freeSpot();
	player.alive = true;
	player.timeToSpawn = -1;
	player.health = this.constants.startHealth;
	delete this.playersOld[id];
};

GameCore.prototype.killPlayer = function(id) {
	var player = this.players[id];
	player.alive = false;
	player.timeToSpawn = this.constants.spawnTime;
	player.health = 0;
};

// Apply a movement delta, handle collisions
// TODO validate the delta against some max allowed speed
// to prevent modified clients to supply cheat deltas
GameCore.prototype.applyDelta = function(id, delta) {
	var d, that;
	var player = this.players[id];
	that = this;

	// Apply!
	player.position.x += delta[0];
	player.position.y += delta[1];
	player.position.z += delta[2];

	// Simple wall collision, revert the delta causing the wall collision
	if (player.position.x + this.constants.hitRadius > this.constants.walls ||
		player.position.x - this.constants.hitRadius < -this.constants.walls) {
		player.position.x -= delta[0];
	}
	if (player.position.z + this.constants.hitRadius > this.constants.walls ||
		player.position.z - this.constants.hitRadius < -this.constants.walls) {
		player.position.z -= delta[2];
	}

	// Player and occluder sphere-sphere intersection, move the player
	// away if it collides.
	// TODO nicer collision handling

	// Simple player collision
	Object.keys(this.players).forEach(function(v) {
		d = Vector3.sub(player.position, that.players[v].position);
		if (v != player.id && d.mag() < that.constants.hitRadius * 2) {
			d.normalize();
			d.scale(0.2);
			d.y = 0;
			player.position.add(d);
		}
	});

	// Simple occluder collision
	this.occluders.forEach(function(v) {
		d = Vector3.sub(player.position, v.position);
		if (d.mag() < that.constants.hitRadius + v.radius) {
			d.normalize();
			d.scale(0.2);
			d.y = 0;
			player.position.add(d);
		}
	});

	//console.log('After delta', player.position);

};

// Do the hit interpolation and calculations
// TODO validate source position - could the player reasonably fire from that spot?
GameCore.prototype.fire = function(update_time, average_tick_rate, id, source, direction) {
	var r, e, d, c, A, point, playerT, sphereHit, target_id, occluder, interpolatedPlayers;
	var that = this;

	// Hit data to return
	point = null;
	target_id = -1;

	if (this.players[id].alive === true) {

		this.shots.push({
			shooter: id,
			source: new Vector3(source[0], source[1], source[2]),
			direction: new Vector3(direction[0], direction[1], direction[2])
		});

		// Get the interpolated player we're shooting at, using the shooter's point of view (latency)
		interpolatedPlayers = this.interpolatePlayers(update_time, average_tick_rate, this.players[id].latency);

		// Radius of target sphere
		r = this.constants.hitRadius;
		// Direction of shot
		d = new Vector3(direction[0], direction[1], direction[2]);
		d.normalize();
		// Origin of shot
		e = new Vector3(source[0], source[1], source[2]);
		e.add(new Vector3(0, this.constants.aimHeight, 0));

		A = Vector3.dot(d, d);

		// Check against all (interpolated) player positions and hit spheres
		playerT = 99999;

		Object.keys(interpolatedPlayers).forEach(function(v) {
			//console.log('Checking against', that.players[v]);
			if (v != id && that.players[v].health > 0) {
				c = interpolatedPlayers[v].position.clone();
				//console.log('At position', c);
				sphereHit = that.raySphereIntersect(A, e, d, c, r);
				if (sphereHit !== null) {
					if (sphereHit.t < playerT) {
						playerT = sphereHit.t;
						point = sphereHit.point;
						target_id = v;
					}
				}
			}
		});

		// Did we hit any occluders closer to the closest player?
		for (var i=0; i<this.occluders.length; i++) {
			occluder = this.occluders[i];
			c = occluder.position.clone();
			r = occluder.radius;
			sphereHit = that.raySphereIntersect(A, e, d, c, r);
			if (sphereHit !== null && sphereHit.t < playerT) {
				target_id = -1;
				break;
			}
		}

		// Did we hit anything? If we did, remove some health on target
		if (target_id > -1) {
			this.players[target_id].health--;
			this.hits.push({
				shooter: id,
				victim: target_id,
				point: point
			});
			// Did we kill it?
			if (this.players[target_id].health <= 0) {
				this.players[target_id].deaths++;
				this.players[id].kills++;
				this.kills.push({
					shooter: id,
					victim: target_id,
					point: this.players[target_id].position
				});
				this.killPlayer(target_id);
			}
		}
	}

	// Send back the hit data
	return {
		target_id: target_id,
		point: point
	};
};

// == Intersect =========================================================

GameCore.prototype.raySphereIntersect = function(A, e, d, c, r) {

	var emc, B, C, discSq, t1, t2, t, point, disc;
	emc = Vector3.sub(e, c);
	B = Vector3.dot(Vector3.scale(d, 2), emc);
	C = Vector3.dot(emc, emc) - r * r;
	discSq = B * B - 4 * A * C;
	if (discSq >= 0) {
		disc = Math.sqrt(discSq);
		t1 = (disc - B) / (2 * A);
		t2 = (-disc - B) / (2 * A);
		t = (t1 < t2) ? t1 : t2;
		if (t > 0) {
			point = Vector3.add(e, (Vector3.scale(d, t))).toArray();
			return {
				t: t,
				point: point
			};
		}
	}
	return null;
};

// == Random  ===========================================================

GameCore.prototype.getRandomInt = function(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
};

GameCore.prototype.getRandomArbitrary = function(min, max) {
	return Math.random() * (max - min) + min;
};

// == Interpolation  ====================================================

// Copy what's needed for interpolation
GameCore.prototype.copyForInterpolation = function(id) {
	return {
		position: this.players[id].position.clone(),
		rotation: this.players[id].rotation.slice()
	};
};

GameCore.prototype.interpolatePlayers = function(update_time, average_tick_rate, latency) {
	var that = this;
	var t = (new Date().getTime() - update_time - latency) / average_tick_rate;
	var interpolatedPlayers = {};
	Object.keys(this.players).forEach(function(v) {
		if (that.playersOld[v]) {
			interpolatedPlayers[v] = that.interpolatePlayer(that.players[v], that.playersOld[v], t);
		} else {
			interpolatedPlayers[v] = that.copyForInterpolation(v);
		}
	});
	return interpolatedPlayers;
};

GameCore.prototype.interpolatePlayer = function(playerOld, playerOlder, t) {
	return {
		position: new Vector3(
			this.lerp(playerOlder.position.x, playerOld.position.x, t),
			this.lerp(playerOlder.position.y, playerOld.position.y, t),
			this.lerp(playerOlder.position.z, playerOld.position.z, t)
		),
		rotation: [
			this.lerp(playerOlder.rotation[0], playerOlder.rotation[1], t),
			this.lerp(playerOlder.rotation[1], playerOlder.rotation[1], t)
		]
	};
};

GameCore.prototype.lerp = function(a, b, t) {
	return a * (1 - t) + b * t;
};

module.exports = GameCore;