"use strict";
var _ = require("underscore");
var cjson = require("./cjson");

var o = require("./output");

/* inspired by estree */

// TODO: maybe list and tuples should inherit all the deps of their children
// and only toCensoredString should know about ignoring the top-level deps

class Loc {
  constructor(jloc) { // jison location
    this.cell = "undefined";
    this.start = jloc.first_column;
    this.end = jloc.last_column;
  }
  toString() {
    return `${this.cell}:${this.start}-${this.end}`;
  }
  static fakeLoc() {
    return new Loc({first_column: -1, last_column: -1});
  }
}
exports.Loc = Loc;

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

class Literal extends Node {
  constructor(data, location) {
    super("Literal", location);
    this.value = data;
  }
  toString() {
    if (this.value === null)
      return "null";
    if (typeof this.value === "string")
      return `"${this.value}"`;
    return this.value.toString(); }
  eval(ws, user, env) { return new ScalarValue(this.value); }
}
exports.Literal = Literal;

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
    // only falsy values are false, 0, null and "". lists and tuples are true
    if (this.op === "&&") {
      l = this.l.eval(ws, user, env).resolve(ws, user);
      if (l.value === false || l.value === 0 || l.value === null || l.value === "")
        return l;
      r = this.r.eval(ws, user, env).resolve(ws, user).addDeps(l);
      return r;
    } else if (this.op === "||") {
      l = this.l.eval(ws, user, env).resolve(ws, user);
      if (l.value !== false && l.value !== 0 && l.value !== null && l.value !== "")
        return l;
      return this.r.eval(ws, user, env).resolve(ws, user).addDeps(l);
    } else if (this.op === "==" || this.op === "!=") {
      // hack, just use the string representation
      // TODO: if you ever have time, make this lazier
      l = this.l.eval(ws, user, env).resolve(ws, user);
      r = this.r.eval(ws, user, env).resolve(ws, user);
      result = new ScalarValue(l.toString() === r.toString()).addDeps(l, r);
      if (this.op === "!=")
        result.value = !result.value;
      return result;
    }
    l = this.l.eval(ws, user, env).resolve(ws, user);
    r = this.r.eval(ws, user, env).resolve(ws, user);
    if ((l.isList() && r.isList()) || (l.isTuple() && r.isTuple()))
      if (this.op === "+")
        return l.merge(r);
    // for tuples, it is done on values, not keys
    if ((this.op === "in" || this.op === "not in") && (r.isList() || r.isTuple())) {
      result = _.some(r.map || r.values, function(el) {
        return el.toString() === l.toString();
      });
      if (this.op === "not in")
        result = !result;
      // is r.children() too strict?
      return new ScalarValue(result).addDeps(l, r.children());
    }
    // no other list/tuple ops remain
    if (l.isList() || r.isList())
      throw `Unsupported operand ${this.op} for ${l.toString()} or ${r.toString()}`;
    var newVal = eval("l.value"+this.op+"r.value");
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
    if (typeof cond.value !== "boolean")
      throw `Unsupported if condition for ${cond.toString()}`;
    if (cond.value === "true")
      return this.then.eval(ws, user, env).addDeps(cond);
    else
      return this.else.eval(ws, user, env).addDeps(cond);
  }
};

// TODO: add a depth argument to resolve so you don't need to go too deep if not necessary
// (e.g. i only need to know if the table ref is a list of tuples, then depth=2)
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
        return this.sType === "col" ? l.setCol(ws, this.ixCol) : l.setRow(ws, this.ixCol);
      } catch(e) {
        if (e.msg && e.msg.startsWith("SETERROR:")) { // awful hack, fix errors later
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
        _.each(cols, c => {
          if (!l.map.hasOwnProperty(c))
            throw `Column ${c} does not exist`;
        });
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
        return this.sType === "col" ? l.setCol(ws, this.ixCols) : l.setRow(ws, this.ixCols);
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
    this.cond = cond || new Literal(true);
  }
  toString() { return `{${this.expr.toString()} for ${_.map(this.srcs, (v,k) => k + ' in ' + v.toString()).join(", ")} when ${this.cond.toString()}}`; }
  children() { return [this.expr, ..._.values(this.srcs), this.cond]; }
  eval(ws, user, env) {
    // (expr for a in b, c in d when e)
    var srcs = _.mapObject(this.srcs, src => {
      src = src.eval(ws, user, env);
      if (src.isTable() && src.rows === "*") {
        return _.range(0, ws.input[src.name].cells.length).map(i => new TableValue(src.name, i, src.col));
      } else {
        src = src.resolve(ws, user);
        if (src.isList())
          return src.values;
        else
          throw "for only works with tables or lists";
      }
    });
    var bindings = cartesian(srcs);
    var result = _.reduce(bindings, (acc, binding) => {
      var rowEnv = Object.assign(binding.deepClone(), env.deepClone());
      var cond = this.cond.eval(ws, user, rowEnv);
      if (cond.value === false)
        return acc;
      if (typeof cond.value !== "boolean")
        throw `Condition ${this.cond} should return a boolean value`;
      rowEnv = Object.assign(binding, env);
      acc.push(this.expr.eval(ws, user, rowEnv).addDeps(cond));
      return acc;
    }, []);
    return new ListValue(result);
  }
};

// {a: [v1,v2,..], b: [v3,v4..]} => [{a: v1, b: v3}, {a:v2, b:v4}]
var cartesian = function(obj) {
  return _.reduce(obj, (acc, values, key) => {
    if (acc.length === 0) {
      // {} => [{a:v1}, {a:v2}]
      return _.map(values, v => {var o = {}; o[key] = v; return o; });
    } else {
      // [{a:v1}, {a:v2}] => [{a:v1,b:v3}, {a:v1,b:v4}, ...]
      acc = _.map(acc, prev => {
        // {a:v1}, b, [v3,v4] => [{a:v1, b:v3}, {a:v1, b:v4}]
        return _.map(values, v => {
          var n = prev.deepClone();
          n[key] = v;
          return n;
        });
      });
      return _.flatten(acc);
    }
  }, []);
};

exports.Filter = class Filter extends Node {
  constructor(l, filter, location) {
    super("Filter", location);
    this.l = l;
    this.filter = filter;
  }
  toString() { return `(${this.l.toString()}[${this.filter.toString()}])`; }
  children() { return [this.l, this.filter]; }
  eval(ws, user, env) {
    var result;
    var l = this.l.eval(ws, user, env);
    if (l.isTable() && l.row === "*" && l.col === "*") {
      var table = ws.input[l.name];
      var tableRows = _.range(0, table.cells.length).map(i => new TableValue(l.name, i));
      result = _(tableRows).reduce((acc, row) => {
        var rowEnv = _.object(table.columns.map(c => [c, row.deepClone().setCol(ws, c)]));
        var rowResult = this.filter.eval(ws, user, Object.assign(rowEnv, env));
        if (rowResult.value === true) {
          // TODO: override addDeps for tuple and list to push deps to the leaves
          _(row).each(c => c.addDeps(rowResult));
          acc.push(row);
        } else if (rowResult.value !== false)
          throw `${this.filter.toString()} does not return a boolean value`;
        return acc;
      }, []);
      return new ListValue(result);
    }
    l = l.resolve(ws, user);
    if (l.isList() && _(l.values).every(v => v.isTuple())) {
      result = _(l.values).reduce((acc, row) => {
        var rowEnv = row.map.deepClone();
        var rowResult = this.filter.eval(ws, user, Object.assign(rowEnv, env));
        if (rowResult.value === true) {
          _(row).each(c => c.addDeps(rowResult));
          acc.push(row);
        } else if (rowResult.value !== false)
          throw `${this.filter.toString()} does not return a boolean value`;
        return acc;
      }, []);
      return new ListValue(result);
    }
    throw `Filter operation unsupported for ${l.toString()}`;
  }
};

exports.Call = class Call extends Node {
  constructor(n, args, location) {
    super("Call", location);
    this.name = n;
    this.args = args;
  }
  toString() { return `${this.name}(${this.args.map(k=>k.toString()).join(", ")})`; }
  children() { return this.args; }
  eval(ws, user, env) {
    var args = _.map(this.args, arg => arg.eval(ws, user, env));
    if (ws.functions[this.name]) {
      // id, concat, avg, sum, trust, after
      return ws.functions[this.name](ws, user, ...args);
      // builtin functions do not automatically inherit argument deps.
    } else if (ws.scripts[this.name]) {
      var script = ws.scripts[this.name];
      // * output: all args (including nested deps) and all cells fetched through
      // the json api become output deps
      // * login: auto login for this user in the json api (set cookie for js api,
      //  whitelist host for bash)
      // * side effects: all cells written through the json api have input deps.
      // with the json api are deps
      // TODO: the api currently does not expose value-only, we need that.
      // it seems like here we do
      if (script.type === "js") {
        throw "JS support not implemented";
      } else if (script.type === "bash") {
        throw "OS support not implemented";
      }
    } else
      throw `Undefined function ${this.name}`;
  }
};

/***************************************************/

class Value {
  constructor(type, deps=[]) {
    this.type = type;
    this.deps = deps;
  }
  resolve(ws, user) {
    return this;
  }
  toString() { throw "abstract class"; }
  toCensoredString(ws, user) { throw "abstract class"; }
  toJSValue(ws, user) { throw "abstract class"; } // pass ws and user b/c we need resolution
  toCensoredJSValue(ws, user) { throw "abstract class"; }
  visitAll(f) {
    if (f(this) !== false)
      this.children().forEach(n => n.visitAll(f));
  }
  children() { return []; }
  isList() { return false; }
  isTuple() { return false; }
  isTable() { return false; }
  addDeps(...args) {
    args = _.flatten(args);
    _(args).each(arg => {
      if (arg instanceof Dep)
        this.deps.push(arg);
      else
        this.deps = this.deps.concat(arg.deps);
    });
    return this;
  }
  asPerm() { throw `Permissions must return boolean values, not ${this.toString()}`; }
}
Value.censor = "##";
exports.Value = Value;

class ScalarValue extends Value {
  constructor(value, deps) {
    super("Scalar", deps);
    if (value === undefined) {
      throw "Undefined";
    }
    this.value = value;
  }
  toString() {
    if (this.value === null)
      return "null";
    if (typeof this.value === "string")
      return `"${this.value}"`;
    return this.value.toString();
  }
  toCensoredString(ws, user) {
    if (_.every(this.deps, d => d.canRead(ws, user)))
      return this.toString();
    else
      return '"' + Value.censor + '"';
  }
  toJSValue(ws, user) { return this.value; }
  toCensoredJSValue(ws, user) {
    if (_.every(this.deps, d => d.canRead(ws, user)))
      return this.value;
  }
  asPerm() {
    if (typeof this.value !== "boolean")
      throw `Permissions must return boolean values, not ${this.toString()}`;
    return this.value;
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
      this.row = _.range(0, ws.input[this.name].cells.length);
    if (this.col === "*")
      this.col = ws.input[this.name].columns.slice(0);
  }
  resolve(ws, user) {
    this._expand(ws);
    if (typeof this.row === "number") {
      // a.1
      if (typeof this.col === "string") {
        // a.1.b => fetch
        // this is the core branch
        if (!ws.output.values[this.name])
          ws.output.values[this.name] = o.Table.fromInputTable(ws.input[this.name]);
        var cell = ws.output.values[this.name].cells[this.row][this.col];
        if (cell.state === "evaluating")
          throw `Loop`;
        else if (cell.state === "evaluated")
          return cell.data;
        else if (cell.state === "error")
          throw cell.data;
        else if (cell.state === "unevaluated") {
          // parse/lexical error
          if (cell.data.error) {
            cell.state = "error";
            cell.data = cell.data.error.toString();
            throw cell.data;
          }
          // runtime error
          cell.state = "evaluating";
          if (ws.opts.verbose)
            console.log(`evaluating ${this.name}.${this.row}.${this.col}`);
          var env = ws.mkCellEnv(this.name, this.row, this.col);
          try {
            cell.data = cell.data.ast.eval(ws, user, env);
            if (ws.opts.verbose)
              console.log(`${this.name}.${this.row}.${this.col} = ${cell.data.toString()}`);
            cell.data.addDeps(new Dep(this.name, this.row, this.col));
            cell.state = "evaluated";
            return cell.data;
          } catch(e) {
            cell.state = "error";
            cell.data = e.toString();
            if (ws.opts.verbose)
              console.log(`error evaluating ${this.name}.${this.row}.${this.col}: ${e.toString()}`);
            throw cell.data;
          }
        }
      } else {
        // a.1.{b,c} => resolve({b: a.1.b, c: a.1.c})
        var obj = _.object(_.map(this.col, col => {
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
  toJSValue(ws, user) { return this.resolve(ws, user).toJSValue(ws, user); }
  toCensoredJSValue(ws, user) {
    this.resolve(ws, user).toCensoredJSValue(ws, user);
  }
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
  // TODO: make toString a special case of toCensoredString that skip checks
  toCensoredString(ws, user) {
    if (_.every(this.deps, d => ws.canRead(user, d.name, d.row, d.col)))
      return "[" + this.values.map(x => x.toCensoredString(ws, user)).join(", ") + "]";
    else
      return Value.censor;
  }
  toJSValue(ws, user) {
    return _.map(this.values, v => v.toJSValue(ws, user));
  }
  toCensoredJSValue(ws, user) {
    if (_.every(this.deps, d => d.canRead(ws, user)))
      return _.map(this.values, v => v.toCensoredJSValue(ws, user));
    else
      return Value.censor;
  }
  isList() { return true; }
  merge(l) { return new ListValue(this.values.concat(l.values)); }
  resolve(ws, user) {
    this.values = _(this.values).map(v => v.resolve(ws, user));
    return this;
  }
}
exports.ListValue = ListValue;

class TupleValue extends Value {
  constructor(map, deps) {
    super("Tuple", deps);
    this.map = map;
  }
  children() { _.values(this.map); }
  toString() { return "{" + _.map(this.map, (v,k)=>k+":"+v.toString()).join(", ") + "}"; }
  toCensoredString(ws, user) {
    if (_.every(this.deps, d => ws.canRead(user, d.name, d.row, d.col)))
      return "{" + _.map(this.map, (v,k)=>k+":"+v.toCensoredString(ws, user)).join(", ") + "}";
    else
      return Value.censor;
  }
  toJSValue(ws, user) {
    return _.mapObject(this.map, v => v.toJSValue(ws, user));
  }
  toCensoredJSValue(ws, user) {
    if (_.every(this.deps, d => d.canRead(ws, user)))
      return _.mapObject(this.map, v => v.toCensoredJSValue(ws, user));
    else
      return Value.censor;
  }
  isTuple() { return true; }
  merge(t) { return new TupleValue(Object.assign(this.map.deepClone(), t.map.deepClone())); }
  resolve(ws, user) {
    this.map = _(this.map).mapObject(v => v.resolve(ws, user));
    return this;
  }
}
exports.TupleValue = TupleValue;

class Dep {
  constructor(name, row, col) {
    // this might change later if dependencies require
    // depending on an entire column, row etc
    this.name = name;
    this.col = col;
    this.row = row;
  }
  toString() { return `${this.name}.${this.col}.${this.row}`; }
  canRead(ws, user) {
    // subclasses (e.g. decl or time) might just return true here
    return ws.canRead(user, this.name, this.row, this.col);
  }
}
exports.Dep = Dep;

_.each(exports, v => cjson.register(v));
