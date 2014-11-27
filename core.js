var Vector3 = require('./vector3.js');

// The core constants. The ultimate truth.
function GameCore() {
  this.moveSpeed = 5;
  this.turnSpeed = -0.001;
  this.forward = new Vector3([0, 0, -1]);
  this.left = new Vector3([-1, 0, 0]);
  this.hitRadius = 1;
  this.spawnLimit = 15;
  this.aimHeight = 2;
  this.startHealth = 30;
  this.spawnTime = 5000;
};

GameCore.prototype.newPlayer = function(id) {
  return {
    id: id,
    name: 'Goon #' + this.getRandomInt(1, 999),
    kills: 0,
    deaths: 0,
    alive: false,
    timeToSpawn: 3000, // Give the client some time to init
    position: new Vector3([
      this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit), 
      0, 
      this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit)
    ]),
    rotation: [0, 0],
    latency: 150,
    health: this.startHealth,
    color: [this.getRandomArbitrary(0, 1),
      this.getRandomArbitrary(0, 1), this.getRandomArbitrary(0, 1)]
  };
};

GameCore.prototype.spawnPlayer = function(player) {
  player.alive = true;
  player.timeToSpawn = -1;
  player.position =  new Vector3([
    this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit), 
    0, 
    this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit)
  ]);
  player.health = this.startHealth;
}

GameCore.prototype.killPlayer = function(player) {
  player.alive = false;
  player.timeToSpawn = this.spawnTime;
  player.health = 0;
};

GameCore.prototype.applyDelta = function(player, delta) {
  // TODO validate deltas against max speed and rate
  player.position.x += delta[0];
  player.position.y += delta[1];
  player.position.z += delta[2];
};

// Do the hit interpolation and calculations
GameCore.prototype.fire = function(players, state_old, update_time, average_tick_rate, latency, socket_id, source, direction) {
  var r, e, t, d, c, A, B, C, emc, discSq, disc, t, t1, t2, target, point, interpolatedPlayers;
  interpolatedPlayers = this.interpolatePlayers(players, state_old, update_time, average_tick_rate, latency);

  /*
  console.log('Fire!');
  console.log('I am at', source);
  console.log('My interpolated opponents');
  Object.keys(interpolatedPlayers).forEach(function(v) {
    console.log(v, interpolatedPlayers[v].position);
  });
  */

  // Hit data to return
  point = null;
  target_id = -1;

  r = this.hitRadius;
  d = new Vector3(direction);
  d.normalize();
  e = new Vector3(source);
  e.add(new Vector3([0, this.aimHeight, 0]));
  A = Vector3.dot(d, d);

  // Check against all (interpolated) player positions and hit sphere
  Object.keys(interpolatedPlayers).forEach(function(v) {
    if (v != socket_id) {
      c = interpolatedPlayers[v].position.clone();
      emc = Vector3.sub(e, c);
      B = Vector3.dot(Vector3.scale(d, 2), emc);
      C = Vector3.dot(emc, emc) - r*r;
      discSq = B*B - 4*A*C;
      if (discSq >= 0) {
        disc = Math.sqrt(discSq);
        t1 = (disc-B)/(2*A);
        t2 = (-disc-B)/(2*A);
        t = (t1 < t2) ? t1 : t2;
        if (t > 0) {
          point = Vector3.add(e, (Vector3.scale(d, t))).toArray();
          target_id = v;
        }
      }
    }
  });

  // Did we hit anything? If we did, remove some health on target
	if (target_id > 0 && players[target_id].alive === true) {
		players[target_id].health--;
	} else {
    target_id = -1;
  }

  // Send back the hit data
  return { target_id: target_id, point: point };
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
GameCore.prototype.copyForInterpolation = function(player) {
  return {
    position: player.position.clone(),
    rotation: player.rotation.slice()
  }
};

GameCore.prototype.interpolatePlayers = function(players, state_old, update_time, average_tick_rate, latency) {
  var that = this;
  var t = (new Date().getTime()-update_time-latency)/average_tick_rate;
  var interpolatedPlayers = {};
  Object.keys(players).forEach(function(v) {
    if (state_old[v]) {
      interpolatedPlayers[v] = that.interpolatePlayer(players[v], state_old[v], t);
    } else {
      interpolatedPlayers[v] = that.copyForInterpolation(players[v]);
    }
  });
  return interpolatedPlayers;
};

GameCore.prototype.interpolatePlayer = function(playerOld, playerOlder, t) {
  return {
    position: new Vector3([
      this.lerp(playerOlder.position.x, playerOld.position.x, t),
      this.lerp(playerOlder.position.y, playerOld.position.y, t),
      this.lerp(playerOlder.position.z, playerOld.position.z, t),
    ]),
    rotation: [
      this.lerp(playerOlder.rotation[0], playerOlder.rotation[1], t),
      this.lerp(playerOlder.rotation[1], playerOlder.rotation[1], t)
    ]
  };
};

GameCore.prototype.lerp = function(a, b, t) {
  return a*(1-t) + b*t;
};

module.exports = GameCore;
