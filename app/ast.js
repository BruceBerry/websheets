"use strict";
var _ = require("underscore");
var cjson = require("./cjson");

/* inspired by estree */

exports.Loc = class SourceLocation {
  constructor(jloc) { // jison location
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
  eval(ws, user, env) { throw "Abstract class"; }
}

exports.Literal = class Literal extends Node {
  constructor(data, location) {
    super("Literal", location);
    this.value = data;
  }
  toString() { return this.value.toString(); }
  eval(ws, user, env) { return new ScalarValue(this.value); }
};

exports.Identifier = class Identifier extends Node {
  constructor(id, location) {
    super("Identifier", location);
    this.name = id;
  }
  toString() { return this.name; }
  eval(ws, user, env) {
    if (env.hasOwnProperty(this.name))
      return env[this.name];
    else if (ws.input.hasOwnProperty(this.name))
      return new TableValue(this.name);
    else
      throw "Undefined Identifier " + this.name;
  }
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
  eval(ws, user, env) {
    var l,r;
    // first do short-circuit ops, to avoid resolving of l
    if (this.op === "&&") {
      l = l.eval(ws, user, env).resolve(ws, user);
      if (l.value === false)
        return l;
      if (typeof l.value !== "boolean" || typeof r.value !== "boolean")
        throw `Unsupported boolean values ${l.toString()} or ${r.toString()}`;
      return r.eval(ws, user, env).resolve(ws, user);
    } else if (this.op === "||") {
      l = l.eval(ws, user, env).resolve(ws, user);
      if (l.value === true)
        return l;
      return r.eval(ws, user, env).resolve(ws, user);
    } else if (this.op === "==" || this.op === "!=") {
      // hack, just use the string representation
      l = l.eval(ws, user, env).toString();
      r = r.eval(ws, user, env).toString();
      return this.op === "==" ? new ScalarValue(l === r) : new ScalarValue(l !== r);
    }
    l = this.l.eval(ws, user, env).resolve(ws, user);
    r = this.r.eval(ws, user, env).resolve(ws, user);
    if (this.op === "+" &&
      ((l.isList() && r.isList) || l.isTuple() && r.isTuple())) {
      return l.merge(r);
    }
    // no other list/tuple ops remain
    if (l.isList() || r.isList())
      throw `Unsupported operand ${this.op} for ${l.toString()} or ${r.toString()}`;
    var newVal = eval("l.value"+this.op+"r.value");
    if (typeof newVal === "number" && isNaN(newVal))
      throw `Not a number`;
    if (newVal === undefined)
      throw "Undefined";
    return new ScalarValue(newVal);
  }
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

/***************************************************/

class Value {
  constructor(type, deps=[]) {
    this.type = type;
    this.deps = deps;
  }
  resolve(ws) {
    return this;
  }
  toString() { this.value.toString(); }
  visitAll(f) {
    if (f(this) !== false)
      this.children().forEach(n => n.visitAll(f));
  }
  children() { return []; }
  isList() { return false; }
  isTuple() { return false; }
}

class ScalarValue extends Value {
  constructor(value, deps) {
    super("Scalar", deps);
    this.value = value;
  }
}
exports.ScalarValue = ScalarValue;

class TableValue extends Value {
  constructor(name, row="*", col="*", deps=[]) {
    super("Table", deps);
    this.name = name;
    this.row = row;
    this.col = col;
  }
  setCol(ws, col) {
    if (this.col !== "*")
      throw `Cannot set ${col} for ${this.toString()}`;
    this.col = col;
  }
  setRow(ws, row) {
    if (this.row !== "*")
      throw `Cannot set ${row} for ${this.toString()}`;
    this.row = row;
  }
  _expand(ws) {
    if (this.row === "*")
      this.row = range(0, ws.input[this.name].cells.length);
    if (this.col === "*")
      this.col = ws.input[this.name].columns.slice(0);
  }
  resolve(ws, user) {
    this._expand(ws);
    if (typeof this.row === "number") {
      // a.1
      if (typeof this.col === "string") {
        // a.1.b => fetch
        var cell = ws.output[this.name].cells[this.row][this.col];
        if (cell.state === "evaluating")
          throw `Loop`;
        else if (cell.state === "evaluated")
          return cell.data;
        else if (cell.state === "error")
          throw cell.data;
        else if (cell.state === "unevaluated") {
          cell.state = "evaluating";
          var env = ws.mkCellEnv(this.name, this.row, this.col);
          // TODO: catch the right type of exception to stop propagating it
          cell.data = cell.data.eval(ws, user, env);
          cell.state = "evaluated";
          return cell.data;
        }
      } else {
        // a.1.{b,c} => resolve({b: a.1.b, c: a.1.c})
        var obj = _.object(_.map(this.col, function(col) {
          var v = new TableValue(this.name, this.row, col);
          return [col, v];
        }));
        return (new TupleValue(obj)).resolve(ws, user);
      }
    } else {
      // a.{1,2} => resolve([a.1, a.2])
      var rows = this.row.map(ix => new TableValue(this.name, ix, this.col));
      return (new ListValue(rows)).resolve(ws, user);
    }
  }
  toString() { return `{{${this.name}.${this.row}.${this.col}}}`; }
  children() { return this.resolve().children(); }
}
exports.TableValue = TableValue;

class ListValue extends Value {
  constructor(list, deps) {
    super("List", deps);
    this.values = list;
  }
  children() { return this.values; }
  toString() { return "[" + this.values.map(x => x.toString()).join(", ") + "]"; }
  isList() { return true; }
  merge(l) { return new ListValue(this.values.concat(l.values)); }
}
exports.ListValue = ListValue;

class TupleValue extends Value {
  constructor(map, deps) {
    super("Tuple", deps);
    this.map = map;
  }
  children() { _.values(this.map); }
  isTuple() { return true; }
  merge(t) { return new TupleValue(Object.assign(t.map.deepClone(), this.map.deepClone())); }
}
exports.TupleValue = TupleValue;

_.each(exports, v => cjson.register(v));

var range = function(start, end) {
  var a = [];
  for (var i = 0, v = start; i++, v++; i < end)
    a[i] = v;
  return a;
};