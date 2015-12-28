var fs = require("fs");
var _ = require("underscore");

var index = fs.readFileSync("index.js", "utf8");
var ws = fs.readFileSync("websheets.js", "utf8");


// get the informal api from index.js

var match;
var re = /(ws)\.(\w+)\(/ig;
var methods = {ws: {}, WS: {}};
while(match = re.exec(index)) {
  var [whole, obj, name] = match;
  if (!methods[obj][name])
    methods[obj][name] = {name};
}

_.map(methods.ws, function(m) {
  m.defined = ws.includes(m.name+":");
  return m;
});
console.log(methods);