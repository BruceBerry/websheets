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
    this.generation = 0;
    this.users = {admin: {user: "admin", pass: "pass"}};
    this.input = {};
    this.output = {values:{}, permissions:{}};
    this.opts = opts;
    this.createTable("admin", "prova", "here", ["a", "bb", "ab"]);
    this.functions = wsfuncs;
    this.scripts = {};
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
    // ideally this belongs in ws.trigger, but whatever
    delete this.output.permissions[user];
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
      functions: _.keys(this.functions).concat(_.keys(this.scripts))
    };
  }
  createTable(user, name, desc, columns) {
    this.input[name] = new i.Table(name, desc, user, columns);
    this.trigger("createTable", name);
    return true;
  }
  getInputTable(user, name) {
    // server already performed access control
    return this.input[name].export(this, user);
  }
  addRow(user, name, row) {
    var env = this.mkTableEnv(name, user);
    var expr = this.input[name].perms.add.row;
    if (expr.error)
      throw `Cannot add row, error in expr ${expr.error.toString()}`;
    var result = i.defaultPerm(expr).ast.eval(this, user, env).resolve(this, user);
    // not using allPerms() because nested perms would imply a list or tuple which fail asPerm
    var allDeps = _.every(result.deps, d => d.canRead(this, user));
    if (!result.asPerm() || !allDeps)
      throw `You are not authorized add a new row to ${name}`;
    this.input[name].addRow(user, row);
    this.trigger("addRow", name, row);
  }
  deleteRow(user, name, row) {
    var env = this.mkTableEnv(name, user);
    var expr = this.input[name].perms.del.row;
    if (expr.error)
      throw `Cannot delete row, error in expr ${expr.error.toString()}`;
    var result = i.defaultPerm(expr).ast.eval(this, user, env).resolve(this, user);
    var allDeps = _.every(result.deps, d => d.canRead(this, user));
    if (!result.asPerm() || !allDeps)
      throw `You are not authorized to delete a row from ${name}`;
    this.input[name].deleteRow(row);
    this.trigger("deleteRow", name, row);
  }
  writeCell(user, name, row, column, src) {
    var env = this.mkCellEnv(name, row, column, user);
    var table = this.input[name];
    // if the write permission does explicitly reference newVal,
    // you can modify it to an erroneous value. this is on purpose.
    try {
      let oldExpr = table.cells[row][column];
      let newExpr = new i.Expr(src, oldExpr.cell);
      let newVal = newExpr.ast.eval(this, user, env.deepClone());
      env.newVal = newVal;
    } catch (e) {
      console.warn("NewVal", e);
    }
    var permExpr = table.perms.write[column];
    var rowPermExpr = table.perms.write.row;
    var pExpr = i.combinePerms(permExpr, rowPermExpr);
    if (pExpr.error)
      throw `Cannot write cell, error in expr ${pExpr.error.toString()}`;
    var result = pExpr.ast.eval(this, user, env).resolve(this, user);
    var allDeps = _.every(result.deps, d => d.canRead(this, user));
    if (!result.asPerm() || !allDeps)
      throw `You are not authorized to write ${src} to ${name}.${row}.${column}`;
    table.writeCell(row, column, src, user);
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
        });
      });
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
  mkTableEnv(name, user) {
    var table = this.input[name];
    var env = {
      table: new ast.TableValue(name),
      tableName: new ast.ScalarValue(name),
      tableOwner: new ast.ScalarValue(table.owner),
    };
    if (user)
      env.user = new ast.ScalarValue(user);
    return env;
  }
  mkCellEnv(name, row, col, user) {
    var table = this.input[name];
    var env = this.mkTableEnv(name, user);
    Object.assign(env, {
      row: new ast.TableValue(name, row),
      rowIndex: new ast.ScalarValue(row),
      rowOwner: new ast.ScalarValue(table.cells[row]._owner),
      col: new ast.TableValue(name, undefined, col),
      colName: new ast.ScalarValue(col),
      cell: new ast.TableValue(name, row, col),
      owner: new ast.ScalarValue(table.cells[row][col]._owner)
    });
    _.each(table.columns, c => { env[c] = new ast.TableValue(name, row, c); });
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
    // you have permission to read name.row.col iff the read permission is
    // true AND if all the deps to the read permission are true.
    var allDeps;
    if (cell.state === "evaluating")
      throw `Perm Loop`;
    else if (cell.state === "evaluated") {
      allDeps = _.every(cell.data.deps, d => d.canRead(this, user));
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
          console.log(`${user}:${name}.${row}.${col}.read = ${cell.data.toString()}`);
        cell.state = "evaluated";
        cell.generation = this.generation;
        allDeps = _.every(cell.data.deps, d => d.canRead(this, user));
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
  loop(f) {
    // executes the callback for all output cells and permission cached cells
    var visitTable = (ot, isRead) => {
      _(ot).each(table => {
        _(table.cells).each((row, rowIx) => {
          _(row).each((cell, colName) => {
            if (colName === "_owner")
              return;
            var expr;
            if (isRead) {
              // combine perms
              let it = this.input[table.name];
              let cellP = it.perms.read[colName];
              let rowP = it.perms.read.row;
              expr = i.combinePerms(cellP, rowP);
            } else {
              expr = this.input[table.name].cells[rowIx][colName];
            }
            // console.log(`>>> looping on ${table.name}.${rowIx}.${colName}.${isRead}`);
            f(table.name, rowIx, colName, expr, cell, isRead);
          });
        });
      });
    };
    visitTable(this.output.values, false);
    _(this.output.permissions).each(u => visitTable(u, true));
  }
  cellSupport(_name, _row, _col, f) {
    // executes the callback on all the cells that depend on the selected cell
    // (with NormalDep only)
    this.loop((name, row, col, expr, cell, isRead) => {
      if (cell.state !== "evaluated")
        return;
      // console.log(`> Looping on ${name}.${row}.${col}.${isRead}`, cell.data.allDeps());
      _(cell.data.allDeps()).each(d => {
        if (d instanceof ast.NormalDep && d.name === _name &&
            d.row === _row && d.col === _col && d.recalculate === true) {
          f(name, row, col, expr, cell, isRead);
        }
      });  
    });
  }
  trigger(type, name, ...extra) {
    if (this.opts.verbose)
      console.log("trigger", type, name, extra);
    this.generation++;

    // first, set all cell errors back to unevaluated
    this.loop(function(name, row, col, expr, cell, isRead) {
      // parse errors are not our concern here, they have no dependencies
      if (cell.state !== "error")
        return;
      console.log(`### resetting error cell ${name}.${row}.${col}`);
      cell.state = "unevaluated";
      cell.data = expr.deepClone();
      delete cell.error;
      delete cell.generation;
    });

    if (type === "write") {
      let [row, col] = extra;
      this.cellSupport(name, row, col, function(name, row, col, expr, cell, isRead) {
        console.log(`>>> examining support cell ${name}.${row}.${col}.${isRead}`);
        cell.state = "unevaluated";
        cell.oldData = cell.data;
        cell.data = expr.deepClone();
      });
      // this one does *not* become stale, it just becomes plain invalid
      let cell = this.output.values[name].cells[row][col];
      cell.state = "unevaluated";
      cell.data = this.input[name].cells[row][col];
      delete cell.generation;
      delete cell.error;
    } else if (type === "writePerm") {
      // we invalidate the cached permission itself for all users
      let [row, col] = extra;
      _(this.output.permissions).map(up => {
        let cell = up[name].cells[row][col];
        cell.state = "unevaluated";
        cell.data = this.input[name].cells[row][col];
        delete cell.generation;
        delete cell.error;
      });
      // and then follow along the support graph of the related value
      // or NOT :-) because we always call canRead for all deps even if stuff
      // is evaluated, so no one is really depending on the value of this
      // permission cell.
      // this.trigger("write", name, row, col);
    } else if (type === "writeOwner") {
      // we pretend we modified all cells of the row,
      // so the code automatically goes after their support set
      let [row] = extra;
      var cols = this.input[name].columns;
      _.each(cols, col => this.trigger("write", name, row, col));
    } else if (type === "addRow") {
      // update the cache to have another unevaluated row, then invalidate the support
      // graph of row dependencies
      // TODO: implement row permissions
      var ot = this.output.values[name];
      throw "AA";
      ot.addRow()
    } else if (type === "deleteRow") {
      // same as addRow, plus invalidate any normaldep that refers to this row
    } else if (type === "createTable") {
      // nothing, we already create output tables on demand
    } else if (type === "deleteTable") {
      // delete cached tables, invalidate any normaldep that refers to this table
    } else
      throw `Unhandled trigger ${type}`;

    // - write(name, row, col)
    // - writePerm(name, perm, col)
    // - writeOwner(name, row)
    // - addRow(name, row(optional))
    // - deleteRow(name, row, oldRow)
    // - createTable(name)
    // - deleteTable(name)

    // the operations above only modify input tables and users. trigger
    // handles the effect on output and permission cache tables, mainly by
    // calculating the set of support cells for the current cell and restoring
    // those as unevaluated as well.

    // write: (simple version)
    // - get the cell support set for the old cell (loop on table cells and
    //   permission cells, use allDeps to find those that have the old cell as
    //   a dependency)
    // - mark cell and all cells from the support set as unevaluated (copy
    //   back from input table)

    // write: (detect changes)
    // - assign a generation number to all cells
    // - do not immediately mark cells as unevaluated, keep the evaluated version
    //   marked as stale.
    // - once evaluation of the stale cell is requested, check the generation
    //   number of the dependencies.
    // - if they are all older or equal, mark the cell back as evaluated
    // - if they are not, re-evaluate the cell, but you should still check if
    //   the new value is the same as the old one (including deps and flags).
    //   if it is, do not update the generation number.

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

  }
}
cjson.register(WebSheet);
exports.WebSheet = WebSheet;
