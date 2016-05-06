var _ = require("underscore");
var Reflect = require("harmony-reflect")

// ast passed to avoid circular dep
exports.execScript = function(ws, user, env, ast, src, ...args) {
  var api = {
    es(s) {
      return ws.evalString(user, s).toCensoredJSValue(ws, user);
    },
    toJS(obj) {
      return obj.toCensoredJSValue(ws, user);
    },
    delRow(t, ix) {
      ws.deleteRow(user, t, ix);
      return ws.input[t].cells.length;
    },
    addRow(t, ix) {
      ws.addRow(user, t, ix);
      return ws.input[t].cells.length-1;
    },
    writeCell(t, ix, c, src) {
      ws.writeCell(user, t, ix, c, src);
    },
    findIndex(l, f) {
      return _.findIndex(l, f);
    },
    sortBy(l, f) {
      return _.sortBy(l, f);
    },
    imm(x) {
      return new ast.ScalarValue(x);
    },
    log(...args) {
      console.log(...args);
    }
  };
  // TODO: this API sucks, it forces evaluation of everything unnecessarily
  // TODO: this string based API could be sensitive to injection attacks, it would be nice to have stronger typing
  // TODO: at the very least, support escaping in strings
  var proxy = new Proxy({}, {       
    has: function(target, n){
      if (n === "api" || n === "args")
        return true;
      throw "no peeking: " + n;
    },
    set: function (target, n, value, receiver){
      throw "no setting: " + n;
    },
    get: function(target, n, receiver){
      if (n === "api")
        return api;
      if (n === "args")
        return args;
      throw "no getting: " + n;
    }
  });
  // TODO: initSES (freeze primordials, patch stuff)
  // TODO: well-formed strict expression check
  return eval(`
    (function(api, ...args) {
      with (proxy) {
        return (function() {
          "use strict";
          ${src}
        }).call(null);
      }
    })(api, ...args);
  `);
};
