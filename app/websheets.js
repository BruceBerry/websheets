"use strict";
var _ = require("underscore");
var fs = require("fs");

var cjson = require("./cjson");
var i = require("./input");
var o = require("./output");

class WebSheet {
  constructor() {
    this.users = {admin: {user: "admin", pass: "pass"}};
    this.input = {};
    this.output = {values:{}, permissions:{}};
  }

  save(path) {
    var json = cjson.stringify(this);
    fs.writeFileSync(path, json, "utf8");
  }
  static load(path) {
    var json = fs.readFileSync(path, "utf8");
    return cjson.parse(json);
  }

  authUser(user, pass) {
    return this.users[user] && this.users[user].pass === pass;
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

  getInputTable(user) {

  }
}
cjson.register(WebSheet);
exports.WebSheet = WebSheet;