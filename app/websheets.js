"use strict";
var _ = require("underscore");
var fs = require("fs");

var cjson = require("./cjson");
var i = require("./input");
var o = require("./output");
var ast = require("./ast");
var importer = require("./import");
var wsfuncs = require("./functions");

class WebSheet {
  constructor(opts) {
    this.users = {admin: {user: "admin", pass: "pass"}};
    this.input = {};
    this.output = {values:{}, permissions:{}};
    this.createTable("admin", "prova", "here", ["a", "bb", "ab"]);
    this.opts = opts;
    this.functions = wsfuncs;
    this.input.prova.addRow("admin");
  }

  save(path) {
    var json = cjson.stringify(_.omitClone(this, "opts", "functions"));
    fs.writeFileSync(path, json, "utf8");
  }
  static load(path, opts) {
    var json = fs.readFileSync(path, "utf8");
    var ws = cjson.parse(json);
    ws.opts = opts;
    ws.functions = wsfuncs;
    return ws;
  }

  authUser(user, pass) {
    return this.users.hasOwnProperty(user) && this.users[user].pass === pass;
  }
  createUser(user, pass) {
    if (this.users[user])
      return false;
    this.users[user] = {user, pass};
    return true;
  }
  deleteUser(user) {
    if (user === "admin" || !this.users[user])
      return false;
    delete this.users[user];
    return true;
  }
  listUsers() {
    // [{user, [tablenames]}]
    return _(this.users).map(u => {
      return {user: u.user, tables: _.chain(this.input).where({owner: u.user}).pluck("name").value()};
    });
  }
  purge() {
    this.output = {values:{}, permissions: {}};
  }
  listTables() {
    // [publicTable]
    return _.map(this.input, t => _.pick(t, "name", "description", "owner"));
  }
  listKeywords() {
    // {tables, columns, functions}
    return {
      tables: _(this.input).keys(),
      columns: _.chain(this.input).pluck("columns").flatten().value(),
      functions: [] // TODO
    };
  }
  createTable(user, name, desc, columns) {
    this.input[name] = new i.Table(name, desc, user, columns);
    this.trigger("createTable", name);
    return true;
  }
  getInputTable(user, name) {
    // server performed access control
    // TODO: censoring for the input table as well,
    // the user should not be able to see everything
    if (!this.input[name])
      throw `Table ${name} does not exist`;
    return this.input[name].export(this, user);
  }
  addRow(user, name, row) {
    // TODO: evaluate add row permission
    this.input[name].addRow(user, row);
    this.trigger("addRow", name, row);
  }
  deleteRow(user, name, row) {
    // TODO: evaluate del row permission
    this.input[name].deleteRow(row);
    this.trigger("deleteRow", name, row);
  }
  writeCell(user, name, row, column, src) {
    // TODO: evaluate write permission (add newVal and oldVal to env)
    // TODO: update ownership if cells will have owners
    this.input[name].writeCell(row, column, src);
    this.trigger("write", name, row, column);
  }
  getOutputTable(user, name) {
    // eval them separately, otherwise the first cell error terminates the evaluation
    if (!this.input[name])
      throw `Table ${name} does not exist`;
    if (this.opts.autoEval) {
      _(this.input[name].cells).each((row,i) => {
        _(row).each((c, k) => {
          if (k === "_owner")
            return;
          try {
            this.evalString(user, `${name}.${i}.${k}`);
          } catch(e) {
            console.log(e.toString());
          }
        })});
    }
    if (!this.output.values[name])
      this.output.values[name] = o.Table.fromInputTable(this.input[name]);
    return this.output.values[name].censor(this, user);
  }
  evalString(user, src) {
    var expr = new i.Expr(src, "fromString");
    if (expr.error)
      throw expr.error;
    return expr.ast.eval(this, user, {}).resolve(this);
  }
  mkCellEnv(name, row, col, user) {
    var table = this.input[name];
    var env = {
      table: new ast.TableValue(name),
      tableName: new ast.ScalarValue(name),
      tableOwner: new ast.ScalarValue(table.owner),
      row: new ast.TableValue(name, row),
      rowIndex: new ast.ScalarValue(row),
      rowOwner: new ast.ScalarValue(table.cells[row]._owner),
      col: new ast.TableValue(name, undefined, col),
      colName: new ast.ScalarValue(col),
      cell: new ast.TableValue(name, row, col),
      // owner: TODO: cell owner?
    };
    _.each(table.columns, c => { env[c] = new ast.TableValue(name, row, c); });
    if (user)
      env.user = new ast.ScalarValue(user);
    return env;
  }
  import(user, filename) {
    importer.import(this, user, filename);
  }
  canRead(user, name, row, col) {
    var result = this._canRead(user, name, row, col);
    return result || (user === "admin" && this.opts.adminReads);
  }
  _canRead(user, name, row, col) {
    if (!this.output.permissions[user])
      this.output.permissions[user] = {};
    var userPerms = this.output.permissions[user];
    if (!userPerms[name])
      userPerms[name] = o.Table.permFromInputTable(this.input[name]);
    var table = userPerms[name];
    var cell = table.cells[row][col];
    if (!cell)
      throw "Cell not found";
    // you have permission to read name.row.col iff the read permission is true
    // AND if all the deps to the read permission are true
    var allDeps;
    if (cell.state === "evaluating")
      throw `Pem Loop`;
    else if (cell.state === "evaluated") {
      allDeps = _.every(cell.data.deps, d => this.canRead(user, d.name, d.row, d.col));
      return cell.data.asPerm() && allDeps;
    } else if (cell.state === "error")
      return false;
    else if (cell.data.error) {
      cell.state = "error";
      cell.data = cell.data.error.toString();
      return false;
    } else if (cell.state === "unevaluated") {
      cell.state = "evaluating";
      if (this.opts.verbose)
        console.log(`evaluating ${name}.${row}.${col}.read`);
      var env = this.mkCellEnv(name, row, col, user);
      try {
        cell.data = cell.data.ast.eval(this, user, env);
        if (this.opts.verbose)
          console.log(`${name}.${row}.${col}.read = ${cell.data.toString()}`);
        cell.state = "evaluated";
        allDeps = _.every(cell.data.deps, d => this.canRead(user, d.name, d.row, d.col));
        return cell.data.asPerm() && allDeps;
      } catch(e) {
        cell.state = "error";
        cell.data = e.toString();
        if (this.opts.verbose)
          console.log(`Error evaluating ${name}.${row}.${col}.read: ${e.toString()}`);
        return false;
      }
    }
  }
  getCell(user, name, row, col) {
    if (!this.input[name])
      throw `Table ${name} does not exist`;
    if (this.opts.autoEval)
      try {
        this.evalString(user, `${name}.${row}.${col}`);
      } catch(e) {
        console.log(e.toString());
      }
    if (!this.output.values[name])
      this.output.values[name] = o.Table.fromInputTable(this.input[name]);
    return this.output.values[name].cells[row][col].censor(this, user, name, row, col);
  }
  trigger(type, table, ...extra) {
    // - createTable(name)
    // - deleteTable(name)
    // - addRow(name, row(optional))
    // - deleteRow(name, row)
    // - write(name, row, col) // TODO: supply previous value/deps?
    // - writePerm(name, perm, col)
    // - writeOwner(name, row)

    // in strict semantics, evaluating an unevaluated cell doesn't trigger
    // anything, because cells that depend on it by definition have not been
    // evaluated yet and are queued for evaluation. only re-evaluating cells
    // can fire further triggers, and only if the cell has re-evaluated with a
    // different value.

    // however, so far we've been working with lazy semantics, it would be
    // nice to stick to them: writing a cell only marks all its dependencies
    // as stale, but does not recalculate them. requesting a stale dependency
    // forces re-evaluation, but if the value has not changed, then its
    // dependents need to be informed, because they might not be stale after
    // all. how would they know that *all* their dependencies have reported
    // having made no changes? return a value all the way? what is the name of
    // that pattern where you record the number of changes and if it's not the
    // current one you know it hasn't changed? generation?

    // thi stuff will be very slow without inverting the dependency graph into
    // a support graph, but i don't think i'm going to bother.

    // deleteTable, writePerm, writeRow
    ws.purge();
  }
}
cjson.register(WebSheet);
exports.WebSheet = WebSheet;
