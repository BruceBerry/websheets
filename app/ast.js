"use strict";
var _ = require("underscore");
var cjson = require("./cjson");

/* inspired by estree */

exports.Loc = class SourceLocation {
  constructor(jloc) { // jison location
    debugger;
    this.cell = "undefined";
    this.start = jloc.first_column;
    this.end = jloc.last_column;
  }
  toString() {
    return `${this.cell}:${this.start}-${this.end}`;
  }
};

class Node {
  constructor(type, location) {
    this.type = type;
    this.loc = location;
  }
  // stop automatic visiting by returning false
  visitAll(f) {
    if (f(this) !== false)
      this.children().forEach(n => n.visitAll(f));
  }
  visit(f) {
    if (f[this.type])
     if (f[this.type](this) === false)
      return;
    this.children().forEach(n => n.visit(f));
  }
  toString() { throw "Abstract class"; }
  children() { return []; }
  eval(user, ws) { throw "Abstract class"; }
}

exports.Literal = class Literal extends Node {
  constructor(data, location) {
    super("Literal", location);
    this.value = data;
  }
  toString() { return this.value.toString(); }
};

exports.Identifier = class Identifier extends Node {
  constructor(id, location) {
    super("Identifier", location);
    this.name = id;
  }
  toString() { return this.name; }
};

exports.Binary = class Binary extends Node {
  constructor(op, l, r, location) {
    super("Binary", location);
    this.op = op;
    this.l = l;
    this.r = r;
  }
  toString() { return `(${this.l} ${this.op} ${this.r})`; }
  children() { return [this.l, this.r]; }
};

exports.Unary = class Unary extends Node {
  constructor(op, arg, location) {
    super("Unary", location);
    this.op = op;
    this.arg = arg;
  }
  toString() { return `(${this.op}${this.arg})`; }
  children() { return [this.arg]; }
};

exports.List = class List extends Node {
  constructor(elements, location) {
    super("List", location);
    this.elements = elements;
  }
  toString() { return `[${this.elements.map(k=>k.toString()).join(", ")}]`; }
  children() { return this.elements; }
};

exports.Tuple = class Tuple extends Node {
  constructor(map, location) {
    super("Tuple", location);
    // trick to put them back in the correct order
    this.map = {};
    var keys = Object.keys(map).reverse();
    keys.forEach(k => this.map[k] = map[k]);
  }
  toString() { return `{${_.map(this.map, (v,k)=>k+":"+v.toString()).join(", ")}}`; }
  children() { return _.values(this.map); }
};

exports.IfThenElse = class IfThenElse extends Node {
  constructor(cond, t, e, location) {
    super("IfThenElse", location);
    this.cond = cond;
    this.then = t;
    this.else = e;
  } 
  toString() { return `if (${this.cond.toString()}) then (${this.t.toString()}) else (${this.e.toString()})`; }
  children() { return [this.cond, this.then, this.else]; }
};

exports.Select = class Select extends Node {
  constructor(l, r, location) {
    super("Select", location);
    this.l = l;
    this.ixCol = r;
    this.sType = typeof this.ixCol === "string" ? "col" : "row";
  }
  toString() { return `(${this.l.toString()}.${this.ixCol.toString()})`; }
  children() { return [this.l]; }
};

exports.Project = class Project extends Node {
  constructor(l, r, location) {
    super("Project", location);
    this.l = l;
    this.ixCols = r;
    this.sType = typeof this.ixCols[0] === "string" ? "col" : "row";
  }
  toString() { return `(${this.l.toString()}{${this.ixCols.map(p=>p.toString()).join(", ")}})`; }
  children() { return [this.l]; }
};

exports.Generate = class Generate extends Node {
  constructor(expr, srcs, cond, location) {
    super("Generate", location);
    this.expr = expr;
    this.srcs = srcs;
    this.cond = cond;
  }
  toString() { return `{${this.expr.toString()} for ${_.map(this.srcs, (v,k) => k + ' in ' + v.toString()).join(", ")} when ${this.cond.toString()}}`; }
  children() { return [this.expr, this.srcs, this.cond]; }
};

exports.Filter = class Filter extends Node {
  constructor(l, filter, location) {
    super("Filter", location);
    this.l = l;
    this.filter = filter;
  }
  toString() { return `(${this.l.toString()}[${this.filter.toString()}])`; }
  children() { return [this.l, this.filter]; }
};

exports.Call = class Call extends Node {
  constructor(n, args, location) {
    super("Call", location);
    this.name = n;
    this.args = args;
  }
  toString() { return `${this.name}(${this.args.map(k=>k.toString()).join(", ")})`; }
  children() { return this.args; }
};

_.each(exports, v => cjson.register(v));