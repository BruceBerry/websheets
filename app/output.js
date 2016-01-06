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
    ot.name = it.name;
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
  addRow(ws, ix) {

  }
  censor(ws, user) {
    var copy = this.deepClone();
    _(copy.cells).map((row, rowIx) =>
      _(row).mapObject((cell,colName) => {
        if (colName === "_owner")
          return;
        return cell.censor(ws, user, this.name, rowIx, colName);
      })
    );
    return copy;
  }
  static get _json() { return "OutputTable"; }
}
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
  censor(ws, user, name, row, col) {
    if (this.state === "unevaluated") {
      delete this.data.ast;
      if (ws.opts.debug)
        this.string = !this.data.error ? this.data.ast.toString() : this.data.toString();
      else
        this.string = "[[unevaluated]]";
    } else if (this.state === "error")
      this.string = ws.opts.debug ? this.data.toString() : "[[error]]";
    else
      if (ws.canRead(user, name, row, col))
        this.string = this.data.toCensoredString(ws, user);
      else {
        delete this.data;
        this.string = "[[censored]]";
        this.censored = true;
      }
    return this;
  }
}
exports.Cell = Cell;

_.each(exports, v => cjson.register(v));