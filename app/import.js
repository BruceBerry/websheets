"use strict";
var cp = require("child_process");
var fibrous = require('fibrous');
var parse = require("csv-parse");
var _ = require("underscore");

var i = require("./input");

var sep = "AABBAABBAA";
exports.import = function(ws, user, filename) {
  
  var cmd = `python app/xls2csv.py -s 0 -p ${sep} ${filename}`;
  var output = cp.execSync(cmd).toString();

  // split on separator
  var csvs = output.split("\r\n" + sep + "\r\n");
  // maybe fix quotes in cell
  // '\8220' => '"'
  // '\8221' => '"'
  _(csvs).each(function(csv) {
    fibrous.run(function() {
      // parse csv
      csv = parse.sync(csv, {skip_empty_lines: false});
      var table = csvToTable(csv, user);
      if (ws.input[table.name])
        throw `Table ${table.name} already exists`;
      ws.input[table.name] = table;
    });
  });
};

var csvToTable = function(csv, owner) {
  var row = 0, col = 0;

  var rowLen = csv[0].length;
  if (!_.every(csv, row => row.length === rowLen))
    throw "Not a matrix";
  
  var tname = csv[0][0];
  var tdesc = csv[1][0];
  
  var [columns, ...data] = getSquare(csv, 3, 0);

  col = columns.length + 2;
  // actually there's no need to scan height, we know the size
  var [columns2, ...perms] = getSquare(csv, 3, col);
  if (columns.length !== columns2.length)
    throw "Format error";
  columns[0] = "_owner";
  columns2[columns2.length-1] = "row";

  var table = new i.Table(tname, tdesc, owner, columns);
  table.cells = _(data).map((r,ix) => _(r).map((c,cx) => new i.Expr(c, `${tname}.${ix}.${columns[cx]}`)));

  var permRows = ["read", "write", "init", "add", "del"];
  _(perms).each((prow, pix) => {
    var p = permRows[pix];
    _(prow).each((c,cix) => {
      var col = columns2[cix];
      if (p === "init" && col === "row" && c !== "")
        throw "No init column";
      if ((p === "add" || p === "del") && col != "row" && c !== "")
        throw "No add/del for columns";
      table.perms[p][col] = new i.Expr(c, `${tname}.${p}.${col}`);
    });
  });

  return table;

};

var getSquare = function(csv, rowStart, colStart) {
  var row = rowStart, col = colStart;
  var transposed = _.zip(...csv);
  
  while(csv[row][col] !== "" && csv[row][col] !== undefined)
    col++;
  col--;
  debugger;
  var colEnd = col;

  var colIxs = _.range(colStart, col+1);
  var rows = _(colIxs).map(c => {
    return _(transposed[c]).findLastIndex(s => s !== "");
  });
  var rowEnd = _.max(rows);

  rows = csv.slice(rowStart, rowEnd+1);
  return rows.map(r => r.slice(colStart, colEnd+1));
};

exports.import(null,null, "xls/rsvp.xls");