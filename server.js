"use strict";
var express = require("express");
var session = require('express-session');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var upload = require("multer")({ dest: 'uploads/' });
var favicon = require("serve-favicon");
var debug = require("express-debug");

var fs = require("fs");
var os = require("os");
var process = require("process");
var argParser = require('minimist');

var {WebSheet} = require("./app/websheets");
var cjson = require("./app/cjson");

var argv = argParser(process.argv.slice(2), {
  default: {
    port: 8000,
    saveFile: os.homedir() + "/.websheets",
    admin: true // always logged in as admin
  }
});
console.log("Listening on port", argv.port);

var ws;
if (fs.existsSync(argv.saveFile))
  ws = WebSheet.load(argv.saveFile);
else {
  console.log("No savefile, starting from scratch");
  ws = new WebSheet();
}



var app = express();
app.use(favicon("static/favicon.ico"));
app.use(cookieParser());
app.use(session({secret: "TODO", resave: false, saveUninitialized: true}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); 

app.use("/static", express.static("static"));

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
  if (req.session.user === "admin" || req.session.user === ws.input[req.params.name].name)
    next();
  else
    res.status(403).end("Must be owner of table or admin");
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
  var result = ws.eval(req.session.user, req.body.code);
  res.end(result);
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
  ws = new WebSheet();
  res.end();
});
app.post("/admin/quit", isAdmin, function(req, res) {
  ws.save(argv.saveFile);
  res.end();
  process.exit(0);
});
app.post("/admin/load", isAdmin, upload.single("load"), function(req, res) {
  try {
    ws = WebSheet.load(req.file.path);
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

app.get("/table/:name/input", isOwnerOrAdmin, function(req, res) {
  res.json(ws.getInputTable(req.session.user, req.params.name));
});
app.get("/table/:name/output", isUser, function(req, res) {
  res.json(ws.getOutputTable(req.session.user, req.params.name));
});


app.post("/table/import", isUser, upload.single("xls"), function(req, res) {
  try {
    ws.import(req.session.user, req.file.path);
    res.end();
  } finally {
    fs.unlink(req.file.path);
  }
});

var server = app.listen(argv.port);