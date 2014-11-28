var Vector3 = require('./vector3.js');

// The core constants. The ultimate truth.
function GameCore() {

  this.moveSpeed = 8;
  this.turnSpeed = -0.001;
  this.forward = new Vector3([0, 0, -1]);
  this.left = new Vector3([-1, 0, 0]);
  this.hitRadius = 1;
  this.spawnLimit = 15;
  this.aimHeight = 2;
  this.startHealth = 30;
  this.spawnTime = 5000;

  this.numOccluders = 10;
  this.occluderRadiusMin = 4;
  this.occluderRadiusMax = 12;
  this.occluderSpawnLimit = 40;

  this.walls = 50;

};

GameCore.prototype.newPlayer = function(id, occluders) {

  var that = this;

  var position;
  var clear = false;
  while (!clear) {
    //console.log('Trying to find a clear spot');
    clear = true;
    position = new Vector3([this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit), 0, this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit)]);
    occluders.forEach(function(v) {
      var d = Vector3.sub(position, v.position);
      if (d.mag() < that.hitRadius+v.radius+2) {
        clear = false;
      }
    });
  }

  return {
    id: id,
    name: 'Goon #' + this.getRandomInt(1, 999),
    kills: 0,
    deaths: 0,
    alive: false,
    timeToSpawn: 4000, // Give the client some time to init and set name
    position: position,
    rotation: [0, 0],
    latency: 150,
    health: this.startHealth,
    color: [this.getRandomArbitrary(0, 1),
      this.getRandomArbitrary(0, 1), this.getRandomArbitrary(0, 1)]
  };
};

GameCore.prototype.generateOccluders = function() {
  var occluders = [];
  for (var i=0; i<this.numOccluders; i++) {
    var occluder = {
      radius: this.getRandomArbitrary(this.occluderRadiusMin, this.occluderRadiusMax),
      position: new Vector3([
        this.getRandomArbitrary(-this.occluderSpawnLimit, this.occluderSpawnLimit), 
        -2, 
        this.getRandomArbitrary(-this.occluderSpawnLimit, this.occluderSpawnLimit)
      ])
    };
    occluders.push(occluder);
  } 
  return occluders;
};

GameCore.prototype.spawnPlayer = function(player, occluders) {
  var that = this;

  var position;
  var clear = false;
  while (!clear) {
    //console.log('Trying to find a clear spot');
    clear = true;
    position = new Vector3([this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit), 0, this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit)]);
    occluders.forEach(function(v) {
      var d = Vector3.sub(position, v.position);
      if (d.mag() < that.hitRadius+v.radius+2) {
        clear = false;
      }
    });
  }

  player.alive = true;
  player.timeToSpawn = -1;
  player.position =  position;
  player.health = this.startHealth;
}

GameCore.prototype.killPlayer = function(player) {
  player.alive = false;
  player.timeToSpawn = this.spawnTime;
  player.health = 0;
};

GameCore.prototype.applyDelta = function(player, delta, players, occluders) {
  var p, d, that;
  that = this;

  // Apply!
  player.position.x += delta[0];
  player.position.y += delta[1];
  player.position.z += delta[2];

   // Simple wall collision
  if (player.position.x+this.hitRadius > this.walls || player.position.x-this.hitRadius < -this.walls) {
    //console.log('Wall collision');
    player.position.x -= delta[0];
  }
  if (player.position.z+this.hitRadius > this.walls || player.position.z-this.hitRadius < -this.walls) {
    //console.log('Wall collision');
    player.position.z -= delta[2];
  }

  // Simple player collision
  Object.keys(players).forEach(function(v) {
    d = Vector3.sub(player.position, players[v].position);
    if (v != player.id && d.mag() < that.hitRadius*2) {
      //console.log('Player collision');
      d.normalize();
      d.scale(0.3);
      d.y = 0;
      player.position.add(d);
    }
  });

  // Simple occluder collision
  occluders.forEach(function(v) {
    d = Vector3.sub(player.position, v.position);
    if (d.mag() < that.hitRadius + v.radius) {
      //console.log('Occluder collision');
      d.normalize();
      d.scale(0.3);
      d.y = 0;
      player.position.add(d);
    }
  });

};

// Do the hit interpolation and calculations
GameCore.prototype.fire = function(players, state_old, update_time, average_tick_rate, latency, socket_id, source, direction, occluders) {
  var r, e, t, d, c, A, B, C, emc, discSq, disc, t, t1, t2, target, point, playerT, sphereHit, target_id, that;
  that = this;
  interpolatedPlayers = this.interpolatePlayers(players, state_old, update_time, average_tick_rate, latency);

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

  playerT = 99999;

  Object.keys(interpolatedPlayers).forEach(function(v) {
    if (v != socket_id && players[v].health > 0) {
      c = interpolatedPlayers[v].position.clone();
      sphereHit = that.raySphereIntersect(A, e, d, c, r);
      if (sphereHit !== null) {
        if (sphereHit.t < playerT) {
          //console.log('Hit a player! Maybe.');
          playerT = sphereHit.t;
          point = sphereHit.point;
          target_id = v;
        }
      }
    }
  });

  // Did we hit any occluders closer to the closest player?
  for (var i=0; i<occluders.length; i++) {
    var occluder = occluders[i];
    c = occluder.position.clone();
    r = occluder.radius;
    sphereHit = that.raySphereIntersect(A, e, d, c, r);
    if (sphereHit !== null && sphereHit.t < playerT) {
      //console.log('Occluder hit before player');
      target_id = -1;
      break;
    }
  }

  // Did we hit anything? If we did, remove some health on target
	if (target_id > 0) {
		players[target_id].health--;
	} 

  // Send back the hit data
  return { target_id: target_id, point: point };
};

// == Intersect =========================================================

GameCore.prototype.raySphereIntersect = function(A, e, d, c, r) {
  var emc, B, C, discSq, t1, t2, t, point;
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
      return { t: t, point: point };
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
