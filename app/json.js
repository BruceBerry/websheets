var cache = {};
var tag = function(obj) {
  if (typeof obj === "object" && obj && obj.constructor && obj.constructor.name) {
    cache[obj.constructor.name] = obj.__proto__;
    obj._type = obj.constructor.name;
  }
};
var stringify = exports.stringify = function(obj) {
  tag(obj);
  return JSON.stringify(obj, replacer);
};
function replacer(k, v) {
  if (k !== "") {
    tag(v);
  }
  return v;
}


var parse = exports.parse = function(str) { return JSON.parse(str, reviver); }
var reviver = function(k, v) {
  if (v && v._type) {
    console.log("Reviving", v._type, cache[v._type]);
    debugger;
    var p = cache[v._type];
    delete v._type;
    var obj = Object.create(p);
    Object.assign(obj, v);
    return obj;
  } else
    return v;
}