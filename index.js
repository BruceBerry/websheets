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
var argParser = require('minimist');

var WS = require("./websheets");

var argv = argParser(process.argv.slice(2), {
  default: {
    port: 8000,
    saveFile: os.homedir() + "/.websheets"
  }
});
console.log("Listening on port", argv.port);

var ws;
if (fs.existsSync(argv.saveFile))
  ws = WS.load(argv.saveFile);
else {
  console.log("No savefile, starting from scratch");
  ws = WS.create();
}



var app = express();
app.use(favicon("static/favicon.ico"));
app.use(cookieParser());
app.use(session({secret: "TODO", resave: false, saveUninitialized: true}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
// debug(app, { });
 

app.use("/static", express.static("static"));

app.get("/", function(req, res) {
  res.redirect("static/");
});

var isUser = function(req, res, next) {
  // TODO: check if user still exists?
  if (req.session.user)
    next();
  else
    res.status(403).end("Must be logged in");
};
var isAdmin = function(req, res, next) {
  isUser(req, res, function() {
    if (req.session.user === "admin")
      next();
    else
      res.status(403).end("Must be admin");
  });
};

// TODO: ensure all api requests are same origin

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
app.post("/eval", isUser, function(req, res) {
  var result = ws.eval(req.session.user, req.body.code);
  res.end(result);
});
app.post("/purge", isAdmin, function(req, res) {
  ws.cache = {};
  res.end();
});
app.post("/reset", isAdmin, function(req, res) {
  ws = WS.create();
  res.end();
});
app.post("/save", isAdmin, function(req, res) {
  ws.save(argv.saveFile);
  res.end();
});
app.post("/quit", isAdmin, function(req, res) {
  ws.save(argv.saveFile);
  res.end();
  server.close();
});


app.get("/table/list", isUser, function(req,res) {
  res.json(ws.listTables());
});

app.get("/table/:name/output", isUser, function(req, res) {
  res.json(ws.valueTable(req.session.user, req.params.name));
});

app.get("/table/:name/input", isUser, function(req, res) {
  res.jsons(ws.inputTable(req.session.user, req.params.name));
});

app.post("/table/import", isUser, upload.single("xls"), function(req, res) {
  ws.import(req.file.path);
  fs.unlink(req.file.path);
  res.end();
});

app.get("/table/:name/value", isUser, function(req, res) {
  res.json(ws.valueTable(user, req.params.name));
});

app.get("/table/:name/expr", isUser, function(req, res) {
  res.json(ws.exprTable(user, req.params.name));
});

var server = app.listen(argv.port);