"use strict";

var wf = require("./wf");
var json = require("./json");

// not intended to be general-purpose
Object.defineProperty(Object.prototype, "deepClone", { value:
  function() {
    if (Array.isArray(this)) {
      var arr = [];
      this.forEach(x => arr.push(x ? x.deepClone() : x));
      return arr;
    } else if (typeof this === "object") {
      var obj = Object.create(this.__proto__);
      Object.keys(this).forEach(k => { obj[k] = this[k] ? this[k].deepClone() : this[k] });
      return obj;
    } else
      return this;
  }
});


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
    if (i < 0 || i > this.cells.length)
      throw "Invalid index";
    this.cells.splice(i, 0, this.perms.init.deepClone()); // TODO: deep cloning?
  }
  delRow(i) {
    if (i < 0 || i >= this.cells.length)
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
      this.error = null;
    } catch(e) {
      this.ast = null;
      this.error = e;
    }
  }
}
exports.Expr = Expr;

// var t = new Table({name: "hi", description: "qqq", owner: "me", columns: ["a", "b"]});
// var jt = json.stringify(t.deepClone());
// // console.log(jt);
// var rt = json.parse(jt);
// console.log(rt);