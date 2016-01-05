/*
My own simplified version of typed-json.

Prototypes are registered automatically only if you called `stringify` on an
instance of the same class before. If you `parse` first, then you need to
explicitly register the constructor with `register`.

*/

var cache = exports.cache = {};

var tag = function(obj) {
  if (typeof obj === "object" && obj && obj.constructor && obj.constructor.name) {
    var name = obj.constructor._json || obj.constructor.name;
    if (name === "Object")
      return;
    cache[name] = obj.__proto__;
    obj._type = name;
  }
};
var replacer = function(k, v) {
  if (k !== "") {
    tag(v);
  }
  return v;
};
var stringify = exports.stringify = function(obj) {
  tag(obj);
  return JSON.stringify(obj, replacer);
};

Date.prototype.toJSON = function() { return {_type: "Date", s: this.valueOf() }; };

var parse = exports.parse = function(str) { return JSON.parse(str, reviver); };
var reviver = function(k, v) {
  if (v && v._type) {
    // console.log("Reviving", v._type, cache[v._type]);
    if (v._type === "Date") {
      // can't just assign the prototype
      return new Date(v.s);
    }
    var p = cache[v._type];
    if (!p)
      throw v._type + " prototype is not registered";
    delete v._type;
    var obj = Object.create(p);
    Object.assign(obj, v);
    return obj;
  } else
    return v;
};

var register = exports.register = function(klass) {
  var name = klass._json || klass.name
  var proto = klass.prototype;
  cache[name] = proto;
}