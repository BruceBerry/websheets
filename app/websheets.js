"use strict";
var _ = require("underscore");
var fs = require("fs");

var cjson = require("./cjson");
var i = require("./input");
var o = require("./output");
var ast = require("./ast");
var importer = require("./import");

class WebSheet {
  constructor(opts) {
    this.users = {admin: {user: "admin", pass: "pass"}};
    this.input = {};
    this.output = {values:{}, permissions:{}};
    this.createTable("admin", "prova", "here", ["a", "bb", "ab"]);
    this.input.prova.addRow("admin");
    this.opts = opts;
  }

  save(path) {
    var json = cjson.stringify(this);
    fs.writeFileSync(path, json, "utf8");
  }
  static load(path, opts) {
    var json = fs.readFileSync(path, "utf8");
    var ws = cjson.parse(json);
    ws.opts = opts;
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
    this.purge();
    return true;
  }
  getInputTable(name) {
    // server performed access control
    // TODO: censoring for the input table as well,
    // the user should not be able to see everything
    if (!this.input[name])
      throw `Table ${name} does not exist`;
    return cjson.stringify(this.input[name].export());
  }
  addRow(user, name, row) {
    // TODO: evaluate add row permission
    this.input[name].addRow(user, row);
    this.purge();
  }
  deleteRow(user, name, row) {
    // TODO: evaluate del row permission
    this.input[name].deleteRow(row);
    this.purge();
  }
  writeCell(user, name, row, column, src) {
    // TODO: evaluate write permission (add newVal and oldVal to env)
    // TODO: update ownership if cells will have owners
    this.input[name].writeCell(row, column, src);
    this.purge();
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
    return cjson.stringify(this.output.values[name].censor(this, user));
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
    console.log("Import completed.");
    this.purge();
  }
  canRead(user, name, row, col) {
    var result = this._canRead(user, name, row, col);
    return result || (user === "admin" && this.opts.adminReads);
  }
  _canRead(user, name, row, col) {
    // TODO: maybe accept a dep directly
    if (!this.output.permissions[user])
      this.output.permissions[user] = {};
    var userPerms = this.output.permissions[user];
    if (!userPerms[name])
      userPerms[name] = o.Table.permFromInputTable(this.input[name]);
    var table = userPerms[name];
    debugger;
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
    // TODO: separate table.censor and cell.censor so you can censor only one here
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
    // TODO: move all these stringify to the server?
    return cjson.stringify(this.output.values[name].censor(this, user).cells[row][col]);
  }
}
cjson.register(WebSheet);
exports.WebSheet = WebSheet;