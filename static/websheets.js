/*jshint: jquery: true, browser: true */
/*global $:false, routie:false, Handlebars:false */

// if (document.location.hash == "")
//   document.location.hash = ""

var user = null;
var DENIED = false;

$(function(){  
  "use strict";

  var config = {
    clean: true,
    highlight: true
  };

  Handlebars._compile = Handlebars.compile;
  Handlebars.compile = function(...args) {
    var f = Handlebars._compile(...args);
    return function(ctx) {
      if (ctx === undefined)
        ctx = {w: window};
      else
        ctx.w = window;
      return f(ctx);
    }
  }

  // precompile handlebars templates
  Handlebars.registerHelper({
    'w': function() {
      return window;
    },
    'ifLoggedIn': function(options) {
      if (window.user)
        return options.fn(this);
    },
    'pcode': function(code) {
      return highlight(cleanJunk(code));
    }
  });
  var templates = {};
  ["users", "tables", "login", "logout", "alert", "eval", "home", "drop",
   "import", "admin", "input"].forEach(
    n => templates[n] = Handlebars.compile($(`#${n}-template`).html()));

  // TODO: submit when pressing enter in form fields
  function updateLoginDom() {
    if (user) {
      $("#nav-right").html(templates.logout({user}));
      $("#logout-button").click(function() {
        $.post("logout");
        user = null;
        $("#admin-li").fadeOut();
        if (document.location.hash === "")
          doHome();
        else
          document.location.hash = "";
        updateLoginDom();
      });
    } else {
      $("#admin-li").fadeOut();
      $("#nav-right").html(templates.login({}));
      $("#login-button").click(function() {
        $.post("login", $("#nav-login-form").serialize()).done(function() {
          user = $("#nav-login-form [name=username]").val();
          if (user === "admin")
            $("#admin-li").fadeIn();
          if (document.location.hash === "")
            doHome();
          else
            document.location.hash = "";
          updateLoginDom();
        }).fail(function() {
          doError("Login Failed");
        });
      });
      $("#create-button").click(function() {
        $.post("create", $("#nav-login-form").serialize()).done(function() {
          $("#login-button").trigger("click");
        }).fail(function() {
          doError("User creation failed");
        });
      });
    }
  }


  function doWarning(msg) {
    $("#alert").html(templates.alert({type: "warning", msg}));
  }
  function doError(msg) {
    $("#alert").html(templates.alert({type: "danger", msg}));
  }
  function doMessage(msg) {
    $("#alert").html(templates.alert({type: "success", msg})); 
  }

  function doUserList() {
    $(".alert").fadeOut();
    $.getJSON("users", function(users) {
      $("#content").html(templates.users(users));
    });
  }

  function doTableList() {
    $(".alert").fadeOut();
    $.getJSON("tables", function(tables) {
      $("#content").html(templates.tables(tables));
      $(".btn-delete").on("click", function() {
        var name = $(this).data("table");
        $.ajax(`tables/${name}`, {
          method: "DELETE"
        }).done(() => doTableList())
          .fail(res => doError(res.statusText));
      });
    });
  }

  function doTable(name){
    $(".alert").fadeOut();
    $.post("eval", `expr=${name}`).always(function() {
      $.getJSON(`tables/${name}`).done(function(table) {
        renderOutputTable(table);
      }).fail(function(res) {
        doError(res.statusText);
      });
    });
  }

  function doTableEdit(name) {
    $(".alert").fadeOut();
    $.getJSON(`tables/${name}/edit`).done(function(table) {
      if (table.type === "static")
        renderInputTable(table);
      else
        renderDynamicTable(table);
    }).fail(function(res) {
      doError(res.statusText);
    });
  }

  function doHome() {
    $(".alert").fadeOut();
    $("#content").html(templates.home({user}));
  }

  function doEval() {
    $(".alert").fadeOut();
    $("#content").html(templates.eval());

    $("#eval-form").on("submit", function(e) {
      var expr = $("#eval").val();
      $.post("eval", {expr})
        .done(res => $("#eval-console").append("<li><code>" + res.message + "</code></li>"))
        .fail(res => $("#eval-console").append("<li><code>" + res.statusText + "</code></li>"));
      e.preventDefault();
    });

  }

  function doImport() {
    $(".alert").fadeOut();
    $("#content").html(templates.import());

    $("#import-btn").on("click", function(e) {
      var f = $("#xls")[0].files[0];
      if (!f)
        return;
      var fd = new FormData();
      fd.append("xls", f);
      $.ajax({
        url: "import",
        data: fd,
        processData: false,
        contentType: false,
        type: 'POST'
      }).done(doTableList)
        .fail(res => doError(res.statusText));
    })
  }

  function doAdmin() {
    $(".alert").fadeOut();
    $("#content").html(templates.admin());

    $("#quit-btn").on("click", function() {
      $.post("quit")
        .done(() => doMessage("WebSheet server terminated."))
        .fail(res => doError(res.statusText));
    });

    $("#purge-btn").on("click", function() {
      $.post("purge")
        .done(() => doMessage("Cache Purged."))
        .fail(res => doError(res.statusText));
    });

    $("#reset-btn").on("click", function() {
      $.post("reset")
        .done(() => doMessage("All tables and users (except for admin) have been deleted."))
        .fail(res => doError(res.statusText));
    });

  }


  // starts by figuring out if the user is logged in

  $.get("whoami").done(function(u) {
    user = u;
    $("#admin-li").fadeIn();
  }).fail(function() {
    user = null;
  }).always(function() {
    updateLoginDom();
    // setup routing
    routie({
      "users": doUserList,
      "tables": doTableList,
      "tables/:name": doTable,
      "tables/:name/edit": doTableEdit,
      "eval": doEval,
      "import": doImport,
      "admin": doAdmin,
      "*": doHome
    });
  });

  function renderInputTable(table) {
 
    document.title = `${table.name} - Expression View`;

    var pe = s => highlight(cleanJunk(s));


    var result = "";
    result += `<h1>${table.name} - Expression View</h1><p>${table.description}</p>`;
    result += `<p><a class="btn btn-default" href="#tables/${table.name}">Switch to Value View</a></p>`;
    // TODO: table perm
    // result += `<p>Table perm: ${pe(table.tperm.read.input)}/${pe(table.tperm.write.input)}</p>`;
    result += "<h2>Permissions</h2>";
    result += "<table class='table table-bordered table-hover'><thead><tr><td></td>";
    table.colnames.forEach(c => { result += `<th>${c}</th>` });
    result += "<th>All Columns</th>";
    result += "</tr></thead><tbody>";
    // Read
    result += "<tr><th>Read</th>";
    table.colperms.map(rw => rw.read).forEach(p => { result += `<td><code>${pe(p.input)}</code></td>`});
    result += `<td><code>${pe(table.rowperm.read.input)}</code></td>`;
    result += "</tr>";
     // "Write", "Init", "Val", "Add", "Del"]
    result += "<tr><th>Write</th>";
    table.colperms.map(rw => rw.write).forEach(p => { result += `<td><code>${pe(p.input)}</code></td>`});
    result += `<td><code>${pe(table.rowperm.write.input)}</code></td>`;
    result += "</tr>";

    result += "<tr><th>Init</th>";
    table.initvalues.forEach(e => { result += `<td><code>${pe(e.input)}</code></td>`});
    result += "<td class='disabled'></td>";
    result += "</tr>";
    
    result += "<tr><th>Valid</th>";
    table.validchecks.forEach((e) => { result += `<td><code>${pe(e.input)}</code></td>` });
    result += `<td class="disabled"></td>`;
    result += "</tr>";

    result += "<tr><th>Add Row</th>";
    // table.colnames.forEach(() => { result += "<td class='disabled'></td>" });
    result += `<td colspan="${table.colnames.length+1}"><code>${pe(table.addperm.input)}</code></td>`;
    result += "</tr>";
    
    result += "<tr><th>Del Row</th>";
    // table.colnames.forEach(() => { result += "<td class='disabled'></td>" });
    result += `<td colspan="${table.colnames.length+1}"><code>${pe(table.delperm.input)}</code></td>`;
    result += "</tr>";
    
    result += "</tbody></table><h2>Data</h2>";

    result += "<table class='table table-bordered table-striped table-hover'><thead><tr><th>_owner</th>";
    table.colnames.forEach(c => { result += `<th>${c}</th>` });
    result += "</thead><tbody>"
    table.rows.forEach(function(row) {
      result += `<tr><td>${row.owner}</td>`;
      row.cells.forEach(cell => result += `<td><code>${pe(cell.expr.input)}</code></td>`);
      result += "</tr>";
    });

    result += "</tbody></table>";
    $("#content").html(result);

    // $("#content").html(templates.input({table}));

  }

  function renderDynamicTable(table) {
    document.title = `${table.name} - Expression View`;

    var result = "";
    result += `<h1>${table.name} - Expression View</h1><p>${table.description}</p>`;
    result += `<p><a class="btn btn-default" href="#tables/${table.name}">Switch to Value View</a></p>`;
    // TODO: table perm
    // result += `<p>Table read perm: <code>${table.tperm.input}</code></p>`;
    result += "<h2>Permissions</h2>";
    result += "<table class='table table-bordered table-hover'><thead><tr><td></td>";
    table.colnames.forEach(c => { result += `<th>${c}</th>` });
    result += "<th>All Columns</th>";
    result += "</tr></thead><tbody>";
    // Read
    result += "<tr><th>Read</th>";
    table.colperms.forEach(p => { result += `<td><code>${p.input}</code></td>`});
    result += `<td><code>${table.rowperm.input}</code></td>`;
    result += "</tr>";

    result += "</tbody></table><h2>Expression</h2>";
    result += `<p><code>${table.expr.input}</code></p>`;


    result += "</tbody></table>";

    $("#content").html(result);
  }

  function renderOutputTable(table) {
    document.title = `${table.name} - Value View`;
    var result = "";
    result += `<h1>${table.name} - Value View</h1><p>${table.description}</p>`;
    result += `<p><a class="btn btn-default" href="#tables/${table.name}/edit">Switch to Expression View</a></p>`;
    
    result += `<table data-name="${table.name}" class='table table-bordered table-striped table-hover'><thead><tr>`;
    result += `<th class="side-opt"></th>`;
    table.colnames.forEach(c => { result += `<th>${c}</th>` });
    result += "</thead><tbody>"
    table.rows.forEach(function(row, rowi) {
      result += `<tr data-index="${rowi}" data-owner="${row.owner}">`;
      row.index = rowi;
      result += "<td class='side-opt'>" + templates.drop({table, row}) + "</td>";
      row.cells.forEach(function(cell, celli) {
        cell.index = celli;
        var cp = printCell(cell);
        var denied = cp === false ? "denied" : "";
        result += `<td class="cell ${denied}" data-colname="${table.colnames[cell.index]}" data-index="${row.index}" data-toggle="tooltip" title data-original-title="Cell Owner: ${cell.owner}" data-delay='{"show": 800, "hide": 100}' data-container="body">`;
        if (cp)
          result += `<code>${cp}</code>`;
        result += "</td>";
      });
      result += "</tr>";
    });

    result += "</tbody></table><p><button id='add-row' class='button'>Add Row</button></p>";


    $("#content").html(result);

    // TODO: buggy, disabled for now
    // $(function () {
    //   $('[data-toggle="tooltip"]').tooltip()
    // });

    $("table td.cell").on("dblclick", function(e) {
      var $this = $(this);
      if($(this).find('input').is(':focus'))
        return; // TODO: do we need this check at all?
      var prev = $(this).html();
      var val = $("code", $this).text();

      var name = $("table").data("name");
      var row = parseInt($(this).data("index"));
      var col = $this.data("colname");
      $this.html(`<input class="code" type='text' id='write-form'/>`)
        .find("input")
        .val(val)
        .trigger("focus")
        .on({
          blur: function() { $(this).trigger("abort"); },
          keyup: function(e) {
            if (e.which == "13")
              $(this).trigger("save");
            else if (e.which == "27")
              $(this).trigger("abort");
          },
          abort: () => $this.html(prev),
          save: function() {
            var expr = $(this).val();
            if (content == null)
              $(this).trigger("abort");
            $.post(`tables/${name}/${row}/${col}`, {expr})
              .done(() => doTable(name))
              .fail(res => {
                doError(res.statusText);
                $(this).trigger("abort");
              });            
          }
        });
    });

    $("#add-row").on("click", function() {
      var name = $("table").data("name");
      $.post(`tables/${name}`)
        .done(() => doTable(name))
        .fail(res => doError(res.statusText));
    });

    $(".row-delete").on("click", function() {
      var name = $("table").data("name");
      var index = $(this).data("index");
      $.ajax(`tables/${name}/${index}`, {
        method: "DELETE"
      }).done(() => doTable(name))
        .fail(res => doError(res.statusText));
    });

    function insert(name, i) {
      $.post(`tables/${name}/${i}`)
        .done(() => doTable(name))
        .fail(res => doError(res.statusText));
    }
    $(".row-insert-before").on("click",
      e => insert($("table").data("name"), $(e.target).data("index")));
    $(".row-insert-after").on("click",
      e => insert($("table").data("name"), $(e.target).data("index")+1));

  }

  function printCell(c) {
    // TODO: this must be done in the server!
    if (c.perm.type !== "evaluated")
      return c.perm.type;
    if (c.perm.value.perm === false || c.perm.value.value === false)
      return DENIED;
    if (c.value.type !== "evaluated")
      return c.value.type;
    return printValue(c.value.value);
  }

  function printValue(v, rowPerm) {
    if (v.perm === false)
      return DENIED;
    if (v == null)
      return "null";
    if (Array.isArray(v.value))
      return "[" + v.value.map(x => printValue(x)).join(", ") + "]";
    // change them to WS syntax
    if (v.value === true)
      return "True";
    if (v.value === false)
      return "False";
    if (typeof v.value == "string")
      return '"' + v.value + '"';
    return v.value;
  }

  function cleanJunk(wf) {
    if (!config.clean)
      return wf;
    wf = wf.replace(/\.\d\./g, ".");
    wf = wf.replace(/\.\"(\w+?)\"/g, ".$1");
    wf = wf.replace("EName == \"\" || ", "");
    wf = wf.replace("newVal == \"\" || ", "");
    wf = wf.replace(/rowOwner/g, "owner");
    return wf;
  }

  function highlight(wf) {
    if (!config.highlight) {
      return wf;
    }
    wf = wf.replace(/\b(Task|Event|Response|Applicant|Faculty|Review)\b/g, "<span class=\"tname\">$&</span>");
    wf = wf.replace(/\b(in|not|True|False)\b/g, "<span class=\"keyword\">$&</span>");
    wf = wf.replace(/\b(Author|Name|Completed|Shared|Public|Invitees|Attendees|User|EName|Coming|Conflicts|AppReviews|Average|AppName|Grade)\b/g,
      "<span class=\"column\">$&</span>");
    wf = wf.replace(/\b(owner|row|user|this|val|newVal)\b/g, "<span class=\"env\">$&</span>");
    wf = wf.replace(/\b(AVG)\b/g, "<span class=\"func\">$&</span>");

    return wf;
  }

});

// TODO: do not use admin/admin2, etc
// TODO: dismiss alerts quicker/easily