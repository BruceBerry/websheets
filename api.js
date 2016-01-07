var fs = require("fs");
var _ = require("underscore");

var index = fs.readFileSync("server.js", "utf8");
var ws = fs.readFileSync("app/websheets.js", "utf8");


// get the informal api from index.js

var match;
var re = /(ws|WebSheet)\.(\w+)\(/g;
var methods = {ws: {}, WebSheet: {}};
while(match = re.exec(index)) {
  var [whole, obj, name] = match;
  if (!methods[obj][name])
    methods[obj][name] = {name};
}

_.map(methods.ws, function(m) {
  m.defined = ws.includes("  " + m.name + "(");
  return m;
});

console.log("### WebSheet methods:");
_.each(methods.ws, function(m) {
  console.log(m.name + "\t\t" + m.defined);
});

console.log("\n### JSON Api");
re = /app\.(\w+)\("([\/\w\-:]+)"/ig;
while(match = re.exec(index)) {
  if (match[1] === "use") continue;
  console.log(match[1].toUpperCase() + "\t" + match[2]);
}