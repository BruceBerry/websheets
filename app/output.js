"use strict";
var i = require("./input");
var cjson = require("./cjson");

class Table {
  constructor(guard) {
    if (guard != 12345)
      throw "Use static method";
  }
  static fromInputTable(it) {
    var ot = new Table(12345);
    ot.name = it.name;
    ot.description = it.description;
    ot.owner = it.owner;
    ot.columns = it.columns;
    ot.cells = it.cells.map(function(row) {
      return fromInputRow(row);
    });
  }
  static get _json() { return "OutputTable"; }
}
cjson.register(Table);
exports.Table = Table;

var fromInputRow = function(row) {
  return _.mapObject(row, function(icell) {
    return new Cell(cell);
  });
}


class Cell {
  constructor(ic) {
    this.state = "unevaluated";
    this.data = ic;
  }
}