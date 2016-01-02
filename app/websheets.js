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
    // TODO: filtering
    // eval them separately, otherwise the first cell error terminates the evaluation
    if (!this.input[name])
      throw `Table ${name} does not exist`;
    if (this.opts.autoEval) {
      _(this.input[name].cells).each((row,i) => {
        _(row).each((c, k) => {
          try {
            this.evalString(user, `${name}.${i}.${k}`);
          } catch(e) {
            console.log(e.toString());
          }
        })});
    }
    if (!this.output[name])
      this.output[name] = o.Table.fromInputTable(this.input[name]);
    return cjson.stringify(this.output[name].censor(this, user));
  }
  evalString(user, src) {
    var expr = new i.Expr(src, "fromString");
    if (expr.error)
      throw expr.error;
    return expr.ast.eval(this, user, {}).resolve(this);
  }
  mkCellEnv(name, row, col) {
    return {
      table: new ast.TableValue(name),
      tableName: new ast.ScalarValue(name),
      tableOwner: new ast.ScalarValue(this.input[name].owner),
      row: new ast.TableValue(name, row),
      rowIndex: new ast.ScalarValue(row),
      rowOwner: new ast.ScalarValue(this.input[name].cells[row]._owner),
      col: new ast.TableValue(name, undefined, col),
      colName: new ast.ScalarValue(col),
      cell: new ast.TableValue(name, row, col),
      // owner: TODO: cell owner?
    };
  }
  import(user, filename) {
    importer.import(this, user, filename);
    console.log("Import completed.");
    this.purge();
  }
}
cjson.register(WebSheet);
exports.WebSheet = WebSheet;