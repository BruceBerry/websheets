var _ = require("underscore");

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
    }
  };
  return hotcrp(api, ...args);
};

/*


*/