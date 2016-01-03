"use strict";
var _ = require("underscore");

var i = require("./input");
var cjson = require("./cjson");

class Table {
  static fromInputTable(it) {
    var ot = new Table();
    ot.name = it.name;
    ot.description = it.description;
    ot.owner = it.owner;
    ot.columns = it.columns;
    ot.cells = it.cells.map(row => fromInputRow(row));
    return ot;
  }
  static permFromInputTable(it) {
    var ot = new Table();
    ot.name = "[[READ]]" + it.name;
    ot.description = "[[READ]]" + it.description;
    ot.owner = it.owner;
    ot.columns = it.columns;
    ot.cells = it.cells.map(row => _.mapObject(row, (orig, colName) => {
      if (colName === "_owner")
        return orig;
      var cellP = it.perms.read[colName];
      var rowP = it.perms.read.row;
      return new Cell(i.combinePerms(cellP, rowP));
    }));
    return ot; 
  }
  censor(ws, user) {
    var copy = this.deepClone();
    _(copy.cells).each((row, rowIx) => _(row).each((cell,colName) => {
      if (colName !== "_owner") {
        if (cell.state === "unevaluated")
          if (ws.opts.debug)
            cell.string = !cell.data.error ? cell.data.ast.toString() : cell.data.toString();
          else
            cell.string = "[[unevaluated]]";
        else if (cell.state === "error")
          cell.string = ws.opts.debug ? cell.data.toString() : "[[error]]";
        else
          if (ws.canRead(user, this.name, rowIx, colName)) {
            debugger;
            cell.string = cell.data.toCensoredString(ws, user);
          }
          else
            cell.string = "[[censored]]";
      }
    }));
    return copy;
  }
  static get _json() { return "OutputTable"; }
}
cjson.register(Table);
exports.Table = Table;

var fromInputRow = function(row) {
  return _.mapObject(row, function(c, k) {
    if (k === "_owner")
      return c;
    return new Cell(c);
  });
};


class Cell {
  constructor(ic) {
    // unevaluated => evaluating => evaluated (error)
    this.state = "unevaluated";
    this.data = ic;
  }
}