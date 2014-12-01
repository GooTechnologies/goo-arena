function Vector3(x, y, z) {
	this.x = (x !== NaN) ? x : 0;
	this.y = (y !== NaN) ? y : 0;
	this.z = (z !== NaN) ? z : 0;
}

Vector3.add = function(lhs, rhs) {
	return new Vector3(lhs.x + rhs.x, lhs.y + rhs.y, lhs.z + rhs.z);
};

Vector3.sub = function(lhs, rhs) {
	return new Vector3(lhs.x - rhs.x, lhs.y - rhs.y, lhs.z - rhs.z);
};

Vector3.scale = function(lhs, s) {
	return new Vector3(lhs.x * s, lhs.y * s, lhs.z * s);
};

Vector3.dot = function(lhs, rhs) {
	return lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
};

Vector3.normalize = function(v) {
	var m = v.mag();
	return new Vector3(v.x / m, v.y / m, v.z / m);
};

Vector3.prototype.toArray = function() {
	return [this.x, this.y, this.z];
};

Vector3.prototype.mag = function() {
	return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
};

Vector3.prototype.clone = function() {
	return new Vector3(this.x, this.y, this.z);
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

module.exports = Vector3;