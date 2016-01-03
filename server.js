"use strict";
var express = require("express");
var session = require('express-session');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var upload = require("multer")({ dest: 'uploads/' });
var favicon = require("serve-favicon");
var debug = require("express-debug");
var fibrous = require("fibrous");

var fs = require("fs");
var os = require("os");
var process = require("process");
var argParser = require('minimist');

var {WebSheet} = require("./app/websheets");
var i = require("./app/input");
var cjson = require("./app/cjson");

var argv = argParser(process.argv.slice(2), {
  default: {
    port: 8000,
    saveFile: os.homedir() + "/.websheets",
    admin: true, // always logged in as admin
    newAccounts: true, // prevent creation of new accounts
    autoEval: true, // should viewing an output table trigger evaluation of the whole table?
    debug: true, // output table json responses leak debug information
    verbose: true, // print evaluation info
    adminReads: false, // does canRead always return true for admin (still evaluates)
  }
});
console.log("Listening on port", argv.port);

var ws;
if (fs.existsSync(argv.saveFile))
  ws = WebSheet.load(argv.saveFile, argv);
else {
  console.log("No savefile, starting from scratch");
  ws = new WebSheet(argv);
}



var app = express();
app.use(favicon("static/favicon.ico"));
app.use(cookieParser());
app.use(session({secret: "TODO", resave: false, saveUninitialized: true}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use("/static", express.static("static"));
app.use(fibrous.middleware);



app.get("/", function(req, res) {
  res.redirect("static/");
});

var isUser = function(req, res, next) {
  if (argv.admin)
    req.session.user = "admin";
  if (req.session.user)
    next();
  else
    res.status(403).end("Must be logged in");
};
var isAdmin = function(req, res, next) {
  if (argv.admin)
    req.session.user = "admin";
  isUser(req, res, function() {
    if (req.session.user === "admin")
      next();
    else
      res.status(403).end("Must be admin");
  });
};
var isOwnerOrAdmin = function(req, res, next) {
  if (argv.admin)
    req.session.user = "admin";

  isUser(req, res, function() {
    if (!ws.input[req.params.name])
      res.status(403).end("Table does not exist");
    else if (req.session.user === "admin" || req.session.user === ws.input[req.params.name].owner)
      next();
    else
      res.status(403).end("Must be owner of table or admin");
  });
};

// 1. USER/AUTH
app.post("/user/login", function(req, res) {
  if (ws.authUser(req.body.user, req.body.pass)) {
    req.session.user = req.body.user;
    console.log("logged in as", req.session.user);
    res.end();
  } else
    res.status(400).end("invalid username/password");
});
app.get("/user/whoami", isUser, function(req, res) {
  res.end(req.session.user);
});
app.post("/user/logout", isUser, function(req, res) {
  req.session.destroy();
  res.end();
});
app.post("/user/create", function(req, res) {
  if (!config.newAccounts)
    return res.status(400).end("Account creation is disabled");
  if (ws.createUser(req.body.user, req.body.pass)) {
    console.log("created user", req.body.user);
    res.end();
  } else
    res.status(400).end("duplicate user");
});
app.post("/user/delete", isUser, function(req, res) {
  ws.deleteUser(req.session.user);
  req.session.destroy();
  res.end();
});
app.post("/user/:user/delete", isAdmin, function(req, res) {
  ws.deleteUser(req.params.user);
  res.end();
});
app.get("/user/list", isUser, function(req, res) {
  res.json(ws.listUsers());
});

// 2. ADMIN/DEBUG
app.post("/debug/eval", isUser, function(req, res) {
  var result = ws.evalString(req.session.user, req.body.src);
  result.string = result.toString();
  res.json(result);
});
app.get("/debug/keywords", isUser, function(req, res) {
  var result = ws.listKeywords();
  res.json(result);
});
app.post("/admin/purge", isAdmin, function(req, res) {
  ws.purge();
  res.end();
});
app.post("/admin/reset", isAdmin, function(req, res) {
  ws = new WebSheet(argv);
  res.end();
});
app.post("/admin/quit", isAdmin, function(req, res) {
  ws.save(argv.saveFile);
  res.end();
  process.exit(0);
});
app.post("/admin/load", isAdmin, upload.single("load"), function(req, res) {
  try {
    ws = WebSheet.load(req.file.path, argv);
    console.log("Successfully loaded state.");
    res.end();
  } finally {
    fs.unlink(req.file.path);
  }
});
app.post("/admin/save", isAdmin, function(req, res) {
  ws.save(argv.saveFile);
  res.end();
});
app.get("/admin/download", isAdmin, function(req, res) {
  var json = cjson.stringify(ws);
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', 'attachment;filename="ws.json"');
  res.send(json);
});

// 3. Actual Websheet API
app.get("/table/list", isUser, function(req,res) {
  res.json(ws.listTables());
});
app.post("/table/create", isUser, function(req,res) {
  if (ws.input[req.body.name])
    res.status(403).end("Table already exists");
  else
    ws.createTable(req.session.user,
      req.body.name, req.body.description,
      req.body.columns.split(",").map(s=>s.trim()));
    res.end();
});
app.post("/table/:name/delete", isOwnerOrAdmin, function(req, res) {
  delete ws.input[req.params.name];
  res.end();
});

app.get("/table/:name/input", isOwnerOrAdmin, function(req, res) {
  res.type("json").end(ws.getInputTable(req.params.name));
});
app.get("/table/:name/output", isUser, function(req, res) {
  res.type("json").end(ws.getOutputTable(req.session.user, req.params.name));
});
app.post("/table/:name/edit", isUser, function(req, res) {
  var name = req.params.name;
  var {perm, column, src, row} = req.body;
  row = Number(row);
  // double as both privileged and normal cell editing
  if (perm) {
    // TODO: since this is not admin-only, it needs some checking
    isOwnerOrAdmin(req, res, function() {
      ws.input[name].perms[perm][column] =
        new i.Expr(src, `${name}.${perm}.${column}`);
      ws.purge();
      res.end();
    });
  } else if (column === "_owner") {
    isAdmin(req, res, function () {
      ws.input[name].cells[row][column] = src;
      ws.purge();
      res.end();
    });
  } else {
    ws.writeCell(req.session.user, name, row, column, src);
    res.end();
  }
});
app.post("/table/:name/addrow", isUser, function(req, res) {
  ws.addRow(req.session.user, req.params.name, req.body.row);
  res.end();
});
app.post("/table/:name/deleterow", isUser, function(req, res) {
  ws.deleteRow(req.session.user, req.params.name, req.body.row);
  res.end();
});
app.post("/table/import", isUser, upload.single("xls"), fibrous.middleware, function(req, res) {
  try {
    ws.import(req.session.user, req.file.path);
    res.end();
  } finally {
    fs.unlink(req.file.path);
  }
});

var server = app.listen(argv.port, "localhost");