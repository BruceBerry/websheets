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
      return env[this.name].deepClone();
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
    var l,r, result;
    // first do short-circuit ops, to avoid resolving of l
    if (this.op === "&&") {
      l = l.eval(ws, user, env).resolve(ws, user);
      if (l.value === false)
        return l;
      if (typeof l.value !== "boolean" || typeof r.value !== "boolean")
        throw `Unsupported boolean values ${l.toString()} or ${r.toString()}`;
      return r.eval(ws, user, env).resolve(ws, user).addDeps(l);
    } else if (this.op === "||") {
      l = l.eval(ws, user, env).resolve(ws, user);
      if (l.value === true)
        return l;
      return r.eval(ws, user, env).resolve(ws, user).addDeps(l);
    } else if (this.op === "==" || this.op === "!=") {
      // hack, just use the string representation
      l = l.eval(ws, user, env);
      r = r.eval(ws, user, env);
      result = new ScalarValue(l.toString() === r.toString()).addDeps(l, r);
      if (this.op === "!=")
        result.value = !result.value;
      return result;
    }
    l = this.l.eval(ws, user, env).resolve(ws, user);
    r = this.r.eval(ws, user, env).resolve(ws, user);
    if ((l.isList() && r.isList) || l.isTuple() && r.isTuple()) {
      if (this.op === "+")
        return l.merge(r);
      else if (this.op === "in" || this.op === "not in") {
        result = _.find(r.map || r.values, function(el) {
          return el.toString() === l.toString();
        });
        if (this.op === "not in")
          result = !result;
        return new ScalarValue(result).addDeps(l, r.allDeps());
      }
    }
    // no other list/tuple ops remain
    if (l.isList() || r.isList())
      throw `Unsupported operand ${this.op} for ${l.toString()} or ${r.toString()}`;
    var newVal = eval("l.value"+this.op+"r.value");
    // TODO: we might need to force conversion of boolean operators
    if (typeof newVal === "number" && isNaN(newVal))
      throw `Not a number`;
    if (newVal === undefined)
      throw "Undefined";
    return new ScalarValue(newVal).addDeps(l,r);
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
  eval(ws, user, env) {
    var arg = this.arg.eval(ws, user, env).resolve(ws, user);
    if (this.op === "-" && typeof arg.value === "number") {
      arg.value = -arg.value;
      return arg;
    } else if (this.op === "!" && typeof arg.value === "boolean") {
      arg.value = !arg.value;
      return arg;
    } else
      throw `Unsupported operand ${this.op} for ${this.arg.toString()}`;
  }
};

exports.List = class List extends Node {
  constructor(elements, location) {
    super("List", location);
    this.elements = elements;
  }
  toString() { return `[${this.elements.map(k=>k.toString()).join(", ")}]`; }
  children() { return this.elements; }
  eval(ws, user, env) {
    return new ListValue(_.map(this.elements, e => e.eval(ws, user, env)));
  }
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
  eval(ws, user, env) {
    return new TupleValue(_.mapObject(this.map, e => e.eval(ws, user,env)));
  }
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
  eval(ws, user, env) {
    var cond = this.cond.eval(ws, user, env).resolve(ws, user);
    // TODO: error w/ expr or value?
    if (typeof cond.value !== "boolean")
      throw "Unsupported if condition for " + cond.toString();
    if (cond.value === "true")
      return this.then.eval(ws, user, env).addDeps(cond);
    else
      return this.else.eval(ws, user, env).addDeps(cond);
  }
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
  eval(ws, user, env) {
    var l = this.l.eval(ws, user, env);
    var selectRow = function(l, row) {
      // [a,b].1 => b
      if (!l.isList())
        throw `Select row ${row} not supported for ${l.toString()}`;
      if (row >= l.values.length)
        throw `List index ${row} out of bounds`;
      return l.values[row];
    };
    var selectCol = function(l, col) {
      // {a:1,b:2}.b => 2
      if (l.isTuple()) {
        if (!l.map.hasOwnProperty(col))
          throw `Column ${col} does not exist`;
        return l.map[col];
      }
      // [{a:1, b:2},{a:1, b:3}].b => [2,3]
      l = l.resolve(ws, user);
      if (l.isList() && _.every(l.values, i => i.isTuple() && i.map.hasOwnProperty(col)))
        return new ListValue(_.map(l.values, i => i.map[col]));
      throw `Select col ${col} not supported for ${l.toString()}`;
    };
    if (l.isTable()) {
      // see if you can do it lazily first
      try {
        return this.sType === "col" ? l.setCol(this.ixCol) : l.setRow(this.ixCol);
      } catch(e) {
        if (e.msg.startsWith("SETERROR:")) { // awful hack, fix errors later
          l = l.resolve(ws, user);
          return this.sType === "col" ? selectCol(l, this.ixCol) : selectRow(l, this.ixCol);
        } else
          throw e;
      }
    } else
      return this.sType === "col" ? selectCol(l, this.ixCol) : selectRow(l, this.ixCol);
  }
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
  eval(ws, user, env) {
    var l = this.l.eval(ws, user, env);
    var projectRows = function(l, rows) {
      // [a,b,c]{1,2} => [b,c]
      if (!l.isList())
        throw `Project rows [${rows}] not supported for ${l.toString()}`;
      _.each(rows, r => {
        if (r >= l.values.length)
          throw `List index ${r} out of bounds`;
      });
      return new ListValue(_.filter(l.values, (v, i) => _(rows).contains(i)));
    };
    var projectCols = function(l, cols) {
      // {a:1,b:2,c:3}{a,c} => {a:1,c:3}
      if (l.isTuple()) {
        _.every(cols, c =>l.map.hasOwnProperty(col))
        
          throw `Column ${col} does not exist`;
        return new TupleValue(_.pick(l.map, cols));
      }
      // [{a:1,b:2},{a:1,b:3}]{b} => [{b:2}, {b:3}]
      l = l.resolve(ws, user);
      if (l.isList() && _.every(l.values, i => i.isTuple())) {
        var result = _(l.values).map(v => {
          _(cols).each(c => {
            if (!v.map.hasOwnProperty(c))
              throw `Column ${c} does not exist in ${v.toString()}`;
          });
          return new TupleValue(_.pick(v.map, cols));
        });
        return new ListValue(result);        
      }
      throw `Select cols [${cols}] not supported for ${l.toString()}`;
    };
    if (l.isTable()) {
      try {
        return this.sType === "col" ? l.setCol(this.ixCols) : l.setRow(this.ixCols);
      } catch(e) {
        if (e.msg.startsWith("SETERROR:")) { // awful hack, fix errors later
          l = l.resolve(ws, user);
          return this.sType === "col" ? projectCols(l, this.ixCols) : projectRows(l, this.ixCols);
        } else
          throw e;
      }
    } else
      return this.sType === "col" ? projectCols(l, this.ixCols) : projectRows(l, this.ixCols);    
  }
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
  toString() { throw "abstract class"; }
  visitAll(f) {
    if (f(this) !== false)
      this.children().forEach(n => n.visitAll(f));
  }
  children() { return []; }
  isList() { return false; }
  isTuple() { return false; }
  isTable() { return false; }
  addDeps(...args) {
    if (args.length === 0)
      return this;
    var arg = args.pop();
    if (Array.isArray(arg)) {
      args.concat(arg);
    } else {
      this.deps.concat(arg.deps);
    }
    return this.addDeps(...args);
  }
}

class ScalarValue extends Value {
  constructor(value, deps) {
    super("Scalar", deps);
    this.value = value;
  }
  toString() { return this.value.toString(); }
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
      throw `SETERROR: Cannot set ${col} for ${this.toString()}`;
    if (Array.isArray(col))
      _.some(col, c => {
        if (!_(ws.input[this.name].columns).contains(c))
          throw `SETERROR: Column ${this.name}.${c} does not exist`;
      });
    else
      if (!_(ws.input[this.name].columns).contains(col))
        throw `SETERROR: Column ${this.name}.${col} does not exist`;
    this.col = col;
    return this;
  }
  setRow(ws, row) {
    if (this.row !== "*")
      throw `SETERROR: Cannot set ${row} for ${this.toString()}`;
    if (Array.isArray(row))
      _.some(row, r => {
        if (r >= ws.input[this.name].cells.length)  
          throw `SETERROR: Row ${this.name}.${r} does not exist`;
      });
    else
      if (row >= ws.input[this.name].cells.length)
        throw `SETERROR: Row ${this.name}.${row} does not exist`;
    this.row = row;
    return this;
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
  isTable() { return true; }
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
  toString() { return "{" + _.map(this.map, (v,k)=>k+":"+v.toString()).join(", ") + "}"; }
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