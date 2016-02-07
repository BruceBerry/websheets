"use strict";

var _ = require("underscore");

var wf = require("./wf");
var cjson = require("./cjson");
var ast = require("./ast");

class Table {
  constructor(name, description, owner, columns, meta) {
    this.name = name;
    this.description = description;
    this.owner = owner;
    this.columns = columns;
    this.meta = meta;
    this.perms = allowAll(name, columns);
    this.cells = [];
  }
  addRow(user, i) {
    if (i === undefined)
      i = this.cells.length;
    if (i < 0 || i > this.cells.length)
      throw "Invalid index";
    var newRow = this.perms.init.deepClone();
    newRow = _.mapObject(newRow, (e, name) => {
      var newCell = `${this.name}.${i}.${name}`;
      if (e.cell) {
        e.cell = newCell;
        e.ast.visitAll(n => { n.loc.cell = newCell; });
        e._owner = user;
      }
      return e;
    });
    newRow._owner = user;
    this.cells.splice(i, 0, newRow);
  }
  deleteRow(i) {
    if (i < 0 || i >= this.cells.length)
      throw "Invalid index";
    this.cells.splice(i, 1);
  }
  writeCell(row, col, src, user) {
    if (this.columns.indexOf(col) === -1)
      throw "Invalid Column";
    if (row < 0 || row >= this.cells.length)
      throw "Invalid Row";
    var oldCell = this.cells[row][col];
    var cell = this.cells[row][col] = new Expr(src, oldCell.cell);
    cell._owner = user;
  }
  static get _json() { return "InputTable"; }
  export(ws, user) {
    // removes ast info
    return {
      name: this.name,
      description: this.description,
      owner: this.owner,
      columns: this.columns,
      meta: this.meta,
      perms: _.mapObject(this.perms,
        p => _.mapObject(p,
          c => {
            var nc = c.deepClone();
            delete nc.ast;
            return nc;
          }
        )
      ),
      cells: _.map(this.cells,
        (r, rIx) => _.mapObject(r,
          (c, colName) => {
            if (colName === "_owner")
              return c;
            var nc = c.deepClone();
            delete nc.ast;
            delete nc.oldData;
            if (!ws.opts.debug && !ws.canRead(user, this.name, rIx, colName)) { 
              nc.src = "[[censored]]";
              nc.censored = true;
            }
            return nc;
          }
        )
      )
    };
  }
}
cjson.register(Table);
exports.Table = Table;

function allowAll(tname, columns) {
  var ret = {};
  ["read", "write", "init"].forEach(function(p) {
    ret[p] = {};
    columns.forEach(function(c) {
      ret[p][c] = allow(tname, p, c);
    });
    if (p !== "init")
      ret[p].row = allow(tname, p, "row");
  });
  ret.add = {row: allow(tname, "add", "row") };
  ret.del = {row: allow(tname, "del", "row") };
  return ret;
}

function allow(tname, type, cname) {
  return new Expr("", `${tname}.${type}.${cname}`);
}

class Expr {
  constructor(src, cell, ast) {
    this.src = src;
    this.cell = cell;
    try {
      this.error = null;
      this.ast = ast || wf.parseCell(src, cell);
    } catch(e) {
      this.ast = null;
      this.error = e;
    }
  }
}
cjson.register(Expr);
exports.Expr = Expr;

// null => true
var defaultPerm = function(p) {
  if (p.src !== "")
    return p;
  return new Expr("true", p.cell);
};
exports.defaultPerm = defaultPerm;

// short circuit eval if one of them is true
exports.combinePerms = function(p1, p2) {
  p1 = defaultPerm(p1);
  p2 = defaultPerm(p2);
  if (p1.src === "true" || p2.error)
    return p2.deepClone();
  if (p2.src === "true" || p1.error)
    return p1.deepClone();
  return new Expr(p1.src + " && " + p2.src, p1.cell, new ast.Binary("&&", p1.ast, p2.ast, ast.Loc.fakeLoc()));
};

// not intended to be general-purpose, works for the types involved in ws
Object.defineProperty(Object.prototype, "deepClone", { value:
  function() {
    if (Array.isArray(this)) {
      var arr = [];
      this.forEach(x => arr.push(x ? x.deepClone() : x));
      return arr;
    } else if (this instanceof Date) {
      return new Date(this.getTime());
    } else if (typeof this === "object") {
      var obj = Object.create(this.__proto__);
      Object.keys(this).forEach(k => { obj[k] = this[k] ? this[k].deepClone() : this[k]; });
      return obj;
    } else
      return this;
  }
});
