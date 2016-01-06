var _ = require("underscore");
var fs = require("fs");
var Mailgun = require('mailgun').Mailgun;

var ast = require("./ast");

var mg;
try {
  mg = new Mailgun(fs.readFileSync(".mailgun", "utf-8"));
} catch (e) {
  console.log("You need a mailgun API key to send emails. Switching to logging mode.");
}

/*
1) tables are not resolved automatically, you need to do it if necessary
2) you also need to do your own dependency management
3) if you do I/O, do access control before.
*/
module.exports = {
  id: function(ws, user, env, x) { return x; },
  concat: function(ws, user, ...args) {
    args = _.map(args, arg => {
      if (arg.isList())
        return arg;
      arg = arg.resolve(ws, user);
      if (!arg.isList())
        throw `Cannot concat ${arg.toString()}`;
      return arg;
    });
    return new ast.ListValue(_.flatten(_.pluck(args, "values")));
  },
  avg: function(ws, user, env, ...args) {
    if (args.length === 1 && args[0].isList()) // array input
      args = args[0].values;
    var sum = this.sum(ws, user, ...args);
    var len = args.length;
    return new ast.ScalarValue(sum/len).addDeps(args);
  },
  sum: function(ws, user, env, ...args) {
    if (args.length === 1 && args[0].isList()) // array input
      args = args[0].values;
    var result = _.reduce(args, (acc, arg) => {
      arg.resolve(ws, user);
      if (typeof arg.value !== "number")
        throw `Cannot sum ${arg.toString()}`;
      return acc + arg.value;
    }, 0);
    return new ast.ScalarValue(result).addDeps(args);
  },
  MAIL: function(ws, user, env, ...args) {
    var [recipient, subject, text] = _.map(args, v => v.toCensoredJSValue(ws, user));
    _.each([recipient, subject, text], v => {
      if (typeof v !== "string") throw `${v.toString()} is not a string`;
    });
    if (recipient === ast.Value.censor)
      throw "Cannot read recipient";
    var sender = "websheets@sandbox49351fdc926b4effb0a597a38a15bf33.mailgun.org";
    if (mg && ws.opts.sendMail)
      mg.sync.sendText(sender, recipient, subject, text);
    else
      console.log(`NEW MAIL\nFrom: ${sender}\nTo: ${recipient}\nSubject: ${subject}\n\n${text}\n`);
    return new ast.ScalarValue(null).addDeps(args);
  },
  ASSERT: function(ws, user, env, cond, msg, v) {
    cond = cond.resolve(ws, user);
    msg = msg.resolve(ws, user);
    if (typeof cond.value !== "boolean" && typeof msg.value !== "string")
      throw "Assert called with wrong types";
    if (cond.value === false)
      throw msg.value;
    return v ? v.addDeps(cond, msg) : new ast.ScalarValue(null).addDeps(cond, msg);
  },
  DEBUG: function(ws, user, env, x) {
    debugger;
    return x;
  },
  FIX: function(ws, user, env, v) {
    // remove the re-calculate effect of its dependencies, forcing a value to
    // never be re-evaluated. this is not privileged.
    v = v.resolve(ws, user);
    v.visitAll(n => {
      _.each(n.deps, d => { d.recalculate = false; });
    });
    return v;
  },
  TRUST: function(ws, user, env, v) {
    // remove the canRead effect of its dependencies, basically re-publishing
    // the object as yours. must be able to read all its dependencies to assume
    // ownership, either as the user evaluating it or as the cell
    // owner.
    try {
      var {name: {tableName: value},
           row: {rowIndex: value},
           col: {colName: value},
           owner: {owner: value}
          } = env;
    } catch (e) {
      throw `Cannot use TRUST in a non-cell context`; 
    }
    return v.addDeps(new ast.DeclDep(owner, name, row, col));
  },
  AFTER: function(ws, user, env, v) {
    var d = new Date(v.value);
    if (isNaN(d.getYear()))
      throw `Invalid date format: ${v.toString()}`;
    if (d > new Date())
      return new ast.ScalarValue(false).addDeps(new ast.TimeDep(d));
    return new ast.ScalarValue(true);
  },
  TRIGGER: function(ws, user, env, v) {
    var owner;
    var d = new Date(v.value);
    if (isNaN(d.getYear()))
      throw `Invalid date format: ${v.toString()}`;
    try {
      owner = env.owner.value;
    } catch (e) {
      throw `Cannot use TRIGGER in a non-cell context`;
    }
    if (d > new Date())
      return new ast.ScalarValue(false).addDeps(new ast.TriggerDep(d, owner));
    return new ast.ScalarValue(true);
  }
};