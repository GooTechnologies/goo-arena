var GameCoreModule = (function() {

  function GameCore() {
    this.moveSpeed = 50;
    this.turnSpeed = -0.001;
    this.forward = [0, 0, -1];
    this.left = [-1, 0, 0];
    this.hitRadius = 1;
    this.spawnLimit = 30;
    this.aimHeight = 2;
  };

  GameCore.prototype.newPlayer = function(id) {
    return {
      id: id,
      status: 'not_ready',
      localForward: this.forward.slice(),
      localAim: this.forward.slice(),
      localLeft: this.left.slice(),
      position: [this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit), 
                 0, 
                 this.getRandomArbitrary(-this.spawnLimit, this.spawnLimit)],
      rotation: [0, 0],
      moveState: {
        fwd: false,
        bwd: false,
        left: false,
        right: false
      },
      mouseState: [0, 0],
      hitRadius: this.hitRadius
    }
  };

  GameCore.prototype.rotateVectorY = function(v, angle) {
    var x = v[0];
    var z = v[2];
    v[0] = x*Math.cos(angle) + z*Math.sin(angle);
    v[2] = -x*Math.sin(angle) + z*Math.cos(angle);
  };

  GameCore.prototype.rotateVectorX = function(v, angle) {
    var y = v[1];
    var z = v[2];
    v[1] = y*Math.cos(angle) - z*Math.sin(angle);
    v[2] = y*Math.sin(angle) + z*Math.cos(angle);
  };

  GameCore.prototype.setLocalLeft = function (player, tpf) {
    player.localLeft = this.left.slice();
    this.rotateVectorY(player.localLeft, player.rotation[1]);
    this.scaleVector(player.localLeft, this.moveSpeed*tpf);
  }

  GameCore.prototype.setLocalForward = function(player, tpf) {
    player.localForward = this.forward.slice();
    this.rotateVectorY(player.localForward, player.rotation[1]);
    this.scaleVector(player.localForward, this.moveSpeed*tpf);
  };

  GameCore.prototype.setLocalAim = function(player, tpf) {
    player.localAim = this.forward.slice();
    this.rotateVectorX(player.localAim, player.rotation[0]);
    this.rotateVectorY(player.localAim, player.rotation[1]);
  };

  GameCore.prototype.updatePlayer = function(player, tpf) {
    player.rotation[0] = player.mouseState[1]*this.turnSpeed;
    player.rotation[1] = player.mouseState[0]*this.turnSpeed;
    this.setLocalForward(player, tpf);
    this.setLocalLeft(player, tpf);
    this.setLocalAim(player, tpf);
    if (player.moveState.fwd === true) {
      this.addVector(player.position, player.localForward);
    }
    if (player.moveState.bwd === true) {
      this.subVector(player.position, player.localForward);
    }
    if (player.moveState.left === true) {
      this.addVector(player.position, player.localLeft);
    }
    if (player.moveState.right === true) {
      this.subVector(player.position, player.localLeft);
    }
  };

  GameCore.prototype.fire = function(players, shooter_id) {
    var shooter, r, e, t, d, c, A, B, C, emc, discSq, disc, t, t1, t2, target, point;
    console.log('Fire');
    point = [0, 0, 0];
    target_id = -1;
    shooter = players[shooter_id];
    r = this.hitRadius;
    // Ray equation in parametric form: p(t) = e + td
    // e - origin
    // t - unknown
    // d - direction
    // A = d.d
    // B = 2.d.(e-c)
    // C = (e-c).(e-c) - r*r
    
    // TODO not only around Y
    d = new Vector3(players[shooter_id].localAim);
    d.normalize();
    console.log('Dir', d.x, d.y, d.z);
    e = new Vector3(players[shooter_id].position);
    e.add(new Vector3([0, this.aimHeight, 0]));
    A = Vector3.dot(d, d);
    Object.keys(players).forEach(function(v) {
      if (v != shooter_id) {
        c = new Vector3(players[v].position);
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
    return { target_id: target_id, point: point };
  };

  GameCore.prototype.addVector = function(lhs, rhs) {
    lhs[0] += rhs[0];
    lhs[1] += rhs[1];
    lhs[2] += rhs[2];
  };

  GameCore.prototype.subVector = function(lhs, rhs) {
    lhs[0] -= rhs[0];
    lhs[1] -= rhs[1];
    lhs[2] -= rhs[2];
  };

  GameCore.prototype.scaleVector = function(lhs, s) {
    lhs[0] *= s;
    lhs[1] *= s;
    lhs[2] *= s;
  };

  GameCore.prototype.magnitude = function(v) {
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  };

  GameCore.prototype.normalizeVector = function(v) {
    var m = this.magnitude(v);
    v[0] = v[0]/m;
    v[1] = v[1]/m;
    v[2] = v[2]/m;
  };

  GameCore.prototype.dot = function(lhs, rhs) {
    return lhs[0]*rhs[0] + lhs[1]*rhs[1] + lhs[2]*rhs[2];
  };

  GameCore.prototype.getRandomInt = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  GameCore.prototype.getRandomArbitrary = function(min, max) {
    return Math.random() * (max - min) + min;
  };

  // =====================================================================

  function Vector3(v) {
    this.x = (v !== undefined && v[0] !== NaN) ? v[0] : 0;
    this.y = (v !== undefined && v[1] !== NaN) ? v[1] : 0;
    this.z = (v !== undefined && v[2] !== NaN) ? v[2] : 0;
  }

  Vector3.add = function(lhs, rhs) {
    return new Vector3([lhs.x+rhs.x, lhs.y+rhs.y, lhs.z+rhs.z]);
  };

  Vector3.sub = function(lhs, rhs) {
    return new Vector3([lhs.x-rhs.x, lhs.y-rhs.y, lhs.z-rhs.z]);
  };

  Vector3.scale = function(lhs, s) {
    return new Vector3([lhs.x*s, lhs.y*s, lhs.z*s]);
  };

  Vector3.dot = function(lhs, rhs) {
    return lhs.x*rhs.x + lhs.y*rhs.y + lhs.z*rhs.z;
  };

  Vector3.normalize = function(v) {
    var m = v.mag();
    return new Vector3([v.x/m, v.y/m, v.z/m]);
  };

  Vector3.prototype.toArray = function() {
    return [this.x, this.y, this.z];
  };

  Vector3.prototype.mag = function() {
    return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
  };

  Vector3.prototype.clone = function() {
    return new Vector3([this.x, this.y, this.z]);
  };

  Vector3.prototype.add = function(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  };

  Vector3.prototype.sub = function(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  };

  Vector3.prototype.scale = function(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  };

  Vector3.prototype.normalize = function() {
    var m = this.mag();
    this.x /= m;
    this.y /= m;
    this.z /= m;
    return this;
  };

  return GameCore;

})();

if (module) {
  module.exports.GameCore = GameCoreModule;
}