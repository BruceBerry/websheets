var ast = require("./ast");
var _ = require("underscore");

/*
1) tables are not resolved automatically, you need to do it if necessary
2) you also need to do your own dependency management
*/
module.exports = {
  id: function(ws, user, x) { return x; },
  concat: function(ws, user, ...args) {
    args = _.map(args, arg => {
      if (arg.isList())
        return arg;
      if (arg.isTable())
        arg = arg.resolve(ws, user);
      if (!arg.isList())
        throw `Cannot concat ${arg.toString()}`;
      return arg;
    });
    return new ast.ListValue(_.flatten(_.pluck(args, "values")));
  },
  avg: function(ws, user, ...args) {
    if (args.length === 1 && args[0].isList()) // array input
      args = args[0].values;
    var sum = this.sum(ws, user, ...args);
    var len = args.length;
    return new ast.ScalarValue(sum/len).addDeps(args);
  },
  sum: function(ws, user, ...args) {
    if (args.length === 1 && args[0].isList()) // array input
      args = args[0].values;
    var result = _.reduce(args, (acc, arg) => {
      if (arg.isTable())
        arg.resolve(ws, user);
      if (!typeof arg.value === "number")
        throw `Cannot sum ${arg.toString()}`;
      return acc + arg.value;
    }, 0);
    return new ast.ScalarValue(result).addDeps(args);
  },
  TRUST: function(ws, user, v) {
    throw "Declassification not implemented";
  },
  after: function(ws, user, v) {
    // support unix epoch & Date friendly format
    throw "Time triggers not supported";
  }
}