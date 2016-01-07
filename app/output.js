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
    ot.cells = it.cells.map(row => fromInputPerm(it));
    return ot;
  }
  addRow(ws, row, isPerm) {
    // called from trigger
    // at this point, the input table has one more row than this one
    var orow;
    if (isPerm)
      orow = fromInputPerm(ws.input[this.name]);
    else
      orow = fromInputRow(ws.input[this.name].cells[row]);
    this.cells.splice(row, 0, orow);
  }
  deleteRow(row) {
    this.cells.splice(row, 1);
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

// doesn't actually need the row
// we don't propagate the owner,
// do we need it?
var fromInputPerm = function(it) {
  return _.object(_(it.columns).map(c => {
    var cellP = it.perms.read[c];
    var rowP = it.perms.read.row;
    var cell = new Cell(i.combinePerms(cellP, rowP));
    return [c, cell];
  }));
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