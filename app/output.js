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
  censor(ws, user) {
    var copy = this.deepClone();
    _(copy.cells).each(row => _(row).each((c,k) => {
      if (k !== "_owner") {
        debugger;
        // TODO: in production, this function should censor out
        // all unevaluated code
        if (c.state === "unevaluated" && !c.data.error)
          c.string = c.data.ast.toString();
        else
          c.string = c.data.toString();
        debugger;
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
}


class Cell {
  constructor(ic) {
    this.state = "unevaluated";
    this.data = ic;
  }
}