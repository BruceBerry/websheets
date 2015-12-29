"use strict";

var wf = require("./wf");

class Table {
  constructor({name, description, owner, columns}) {
    this.name = name;
    this.description = description;
    this.owner = owner;
    this.columns = columns;
    this.perms = allowAll(name, columns);
    this.cells = [];
  }
  addRow(i) {
    if (i === undefined)
      i = this.cells.length;
    if (i > this.cells.length)
      throw "Invalid index";
    this.cells.splice(i, 0, this.perms.init); // TODO: deep cloning?
  }
  delRow(i) {
    if (i >= this.cells.length)
      throw "Invalid index";
    this.cells.splice(i, 1);
  }
}
exports.Table = Table;

function allowAll(tname, columns) {
  var ret = {};
  ["read", "write", "init"].forEach(function(p) {
    ret[p] = {};
    columns.forEach(function(c) {
      ret[p][c] = allow(tname, c, p);
    });
    if (p !== "init")
      ret[p].row = allow(tname, "row", p);
  });
  ret.add = allow(tname, "row", "add");
  ret.del = allow(tname, "row", "del");
  return ret;
}

function allow(tname, cname, type) {
  return new Expr("", `${tname}.${cname}.${type}`);
}

class Expr {
  constructor(src, cell) {
    this.src = src;
    this.cell = cell;
    try {
      this.ast = wf.parseCell(src, cell);
    } catch(e) {
      this.ast = null;
    }
  }
}
exports.Expr = Expr;

// console.log(new exports.Table({name: "hi", description: "qqq", owner: "me", columns: ["a", "b"]}).perms.read);
