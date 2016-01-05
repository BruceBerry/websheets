"use strict";
var cp = require("child_process");
var parse = require("csv-parse");
var _ = require("underscore");
var fibrous = require("fibrous");
var fs = require("fs");

var i = require("./input");

var sep = "AABBAABBAA";
exports.import = function(ws, user, filename) {
  if (!fs.existsSync(filename))
    throw `XLS file ${filename} does not exist`;

  var cmd = `python app/xls2csv.py -s 0 -p ${sep} ${filename}`;
  var output = cp.execSync(cmd).toString();

  // split on separator
  var csvs = output.split("\r\n" + sep + "\r\n");
  // maybe fix quotes in cell
  // '\8220' => '"'
  // '\8221' => '"'
  _(csvs).each(function(csv) {
    // parse csv
    csv = parse.sync(csv, {skip_empty_lines: false});
    importTable(ws, user, csv);
  });
};

var importTable = function(ws, user, csv) {
  var row = 0, col = 0;

  var rowLen = csv[0].length;
  if (!_.every(csv, row => row.length === rowLen))
    throw "Not a matrix";
  
  var tname = csv[0][0];
  var tdesc = csv[1][0];

  console.log("Importing", tname);
  
  var [columns, ...data] = getSquare(csv, 3, 0);
  col = columns.length + 2;
  // actually there's no need to scan height, we know the size
  var [columns2, ...perms] = getSquare(csv, 3, col);
  columns.shift();
  columns2.pop();
  if (columns.toString() !== columns2.toString())
    throw "Format error " + columns + " != " + columns2;
  
  var table = new i.Table(tname, tdesc, user, columns);
  var owcols = ["_owner", ...columns];
  table.cells = _(data).map((r,ix) => {
    return _.object(_(r).map((c,cx) => {
      var col = owcols[cx];
      if (col === "_owner") {
        // also add users with a default user/pass
        if (ws.opts.importUsers)
          ws.createUser(c, "pass");
        return [col, c];
      }
      else {
        var expr = new i.Expr(c, `${tname}.${ix}.${col}`);
        // default owner is the rowOwner. could be the table owner instead.
        expr._owner = r[0];
        return [col, expr];
      }
    }));
  });

  var permRows = ["read", "write", "init", "add", "del"];
  var pCols = [...columns, "row"];
  _(perms).each((prow, pix) => {
    var perm = permRows[pix];
    _(prow).each((c,cix) => {
      var col = pCols[cix];
      if (perm === "init" && col === "row" && c !== "")
        throw "No init column";
      if ((perm === "add" || perm === "del") && col != "row" && c !== "")
        throw "No add/del for columns";
      if (perm === "init" && col === "row")
        return;
      if ((perm === "add" || perm === "del") && col !== "row")
        return;
      table.perms[perm][col] = new i.Expr(c, `${tname}.${perm}.${col}`);
    });
  });

  if (ws.input[table.name])
    throw `Table ${table.name} already exists`;
  ws.input[table.name] = table;
  ws.trigger("createTable", table.name);

};

var getSquare = function(csv, rowStart, colStart) {
  var row = rowStart, col = colStart;
  var transposed = _.zip(...csv);
  
  while(csv[row][col] !== "" && csv[row][col] !== undefined)
    col++;
  col--;
  var colEnd = col;

  var colIxs = _.range(colStart, col+1);
  var rows = _(colIxs).map(c => {
    return _(transposed[c]).findLastIndex(s => s !== "");
  });
  var rowEnd = _.max(rows);

  rows = csv.slice(rowStart, rowEnd+1);
  return rows.map(r => r.slice(colStart, colEnd+1));
};
