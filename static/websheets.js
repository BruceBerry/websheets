"use strict";

// current username
var user = null;
// handlebar templates
var templates = {};

var config = {
  clean: false,
  highlight: true,
  showHidden: false // show hidden fields in output tables (always shown in input tables)
};

// TODO: does removing hidden column cause bugs b/c of relative positioning?

// TODO: not sure if description needs to be a textarea, because tooltips have
// word wrap so you don't really control line wraps anyway.

// TODO: why is 'w' provided into the cell context? we really need to stop overriding Handlebars.compile

var lh = function(hash) {
  location.hash = "#" + hash;
};

// always allow window
Handlebars._compile = Handlebars.compile;
Handlebars.compile = function(...args) {
  var f = Handlebars._compile(...args);
  return function(ctx) {
    if (ctx === undefined)
      ctx = {w: window};
    else
      ctx.w = window;
    return f(ctx);
  };
};
Handlebars.registerHelper({
  pcode: function(code) {
    return highlight(cleanJunk(code));
  },
  ifError: function(expr) {
    return expr.error ? "wf-error" : "";
  },
  not: function(v) {
    return !v;
  },
  eq: function (v1, v2) {
        return v1 === v2;
  },
  neq: function (v1, v2) {
      return v1 !== v2;
  },
  and: function (v1, v2) {
      return v1 && v2;
  },
  or: function (v1, v2) {
      return v1 || v2;
  },
  ifCensored: function(expr) {
    return expr.censored ? "censored" : "";
  },
  inc: function(i) {
    return i+1;
  },
  swrap: function(s) {
    s = Handlebars.Utils.escapeExpression(s);
    return new Handlebars.SafeString(s.replace(/\n/g, "<br>"));
  },
  wrap: function(s) {
    return s.replace(/\n/g, "<br>");
  },
  attrEscape: function(s) { // otherwise < and > are unescaped in tooltips
    return s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
});

function displayWarning(msg) {
  $("#alert").html(templates.alert({type: "warning", msg}));
}
function displayError(msg) {
  $("#alert").html(templates.alert({type: "danger", msg}));
}
function displayMessage(msg) {
  $("#alert").html(templates.alert({type: "success", msg})); 
}


// TODO: submit when pressing enter in form fields
function updateLoginDom() {
  if (user) {
    $("#nav-right").html(templates.logout());
    $("#logout-button").click(function() {
      $.post("/user/logout");
      if (user === "admin")
        $("#admin-li").fadeOut();
      user = null;
      if (document.location.hash === "")
        routes.home();
      else
        document.location.hash = "";
      updateLoginDom();
    });
  } else {
    $("#nav-right").html(templates.login());
    // trigger on enter
    $("#nav-login-form").keypress(function(e) {
      if (e.which === 13)
        $("#login-button").trigger("click"); 
    });
    $("#login-button").click(function() {
      $.post("/user/login", $("#nav-login-form").serialize()).done(function() {
        user = $("#nav-login-form [name=user]").val();
        if (user === "admin")
          $("#admin-li").fadeIn();
        if (document.location.hash === "")
          routes.home();
        else
          document.location.hash = "";
        updateLoginDom();
      }).fail(function() {
        displayError("Login Failed");
      });
    });
    $("#create-button").click(function() {
      $.post("/user/create", $("#nav-login-form").serialize()).done(function() {
        $("#login-button").trigger("click");
      }).fail(function() {
        doError("User creation failed");
      });
    });
  }
}


var routes = {
  userList: function() {
    document.title = "Users";
    $(".alert").fadeOut();
    $.getJSON("/user/list", function(users) {
      $("#content").html(templates.users(users));
    });
  },
  tableList: function() {
    document.title = "Tables";
    $(".alert").fadeOut();
    var numColumns = 0;
    $.getJSON("/table/list", function(tables) {
      $("#content").html(templates.tables(tables));
      $("#table-column-button").before(templates.column({i: numColumns}));
      numColumns++;
      $(".btn-delete").on("click", function() {
        var name = $(this).data("table");
        $.post(`/table/${name}/delete`).done(routes.tableList)
          .fail(res => displayError(res.responseText));
      });
      $("#table-column-button").click(function() {
        $("#table-column-button").before(templates.column({i: numColumns}));
        numColumns++;
      });
      $("#table-create-button").click(function() {
        $.post("/table/create", $("#table-create-form").serialize() + `&numcols=${numColumns}`)
          .done(routes.tableList)
          .fail(res => displayError(res.responseText));
      });
    });
  },
  outputTable: function(name) {
    $(".alert").fadeOut();
    $.getJSON(`/table/${name}/output`)
      .done(renderOutputTable)
      .fail(function(res) {
        displayError(res.responseText);
    });
  },
  inputTable: function(name) {
    $(".alert").fadeOut();
    $.getJSON(`/table/${name}/input`)
      .done(renderInputTable)
      .fail(res => displayError(res.responseText));
  },
  home: function() {
    document.title = "Home";
    $(".alert").fadeOut();
    $("#content").html(templates.home());
  },
  eval: function() {
    document.title = "Eval Console";
    $(".alert").fadeOut();
    $("#content").html(templates.eval());
    $("#eval").val(localStorage.eval);
    $("#eval-form").on("submit", function(e) {
      var src = $("#eval", $(this)).val();
      localStorage.eval = src;
      var append = (code, isError) => $("#eval-console").append(`<li>${isError ? "<b>Error:</b>":""}<code>${code}</code></li>`);
      $.post("/debug/eval", {src: src})
        .done(function(res) {
          var string = res.string;
          var result = string;
          if ($("#eval-verbose").prop("checked") === true) {
            delete res.string;
            result += "<br>" + JSON.stringify(res);
          }
          append(result, false);
        })
        .fail(res => append(res.responseText, true));
      e.preventDefault();
    });
    $("#eval-clear-btn").click(function(e) {
      e.preventDefault();
      $("#eval-console").html("");
    });
  },
  import: function() {
    document.title = "XLS Import";
    $(".alert").fadeOut();
    $("#content").html(templates.import());

    $("#import-btn").on("click", function(e) {
      var f = $("#xls")[0].files[0];
      if (!f)
        return;
      var fd = new FormData();
      fd.append("xls", f);
      $.ajax({
        url: "/table/import",
        data: fd,
        processData: false,
        contentType: false,
        type: 'POST'
      }).done(() => lh("table/list"))
        .fail(res => displayError(res.responseText));
    });
  },
  admin: function() {
    document.title = "Admin Console";
    $.getJSON("/user/list", function(users) {

      $(".alert").fadeOut();
      $("#content").html(templates.admin({users}));



      $("#save-btn").on("click", function() {
        $.post("/admin/save")
          .done(() => displayMessage("State Saved."))
          .fail(res => doError(res.statusText));
      });

      $("#load-btn").on("click", function(e) {
        var f = $("#loadstate")[0].files[0];
        if (!f)
          return;
        var fd = new FormData();
        fd.append("load", f);
        $.ajax({
          url: "/admin/load",
          data: fd,
          processData: false,
          contentType: false,
          type: 'POST'
        }).done(() => displayMessage("State Loaded."))
          .fail(res => displayError(res.responseText));
      });

      $("#quit-btn").on("click", function() {
        $.post("/admin/quit")
          .done(() => displayMessage("WebSheet server terminated."))
          .fail(res => displayError(res.responseText));
      });

      $("#purge-btn").on("click", function() {
        $.post("/admin/purge")
          .done(() => displayMessage("Cache Purged."))
          .fail(res => displayError(res.responseText));
      });

      $("#reset-btn").on("click", function() {
        $.post("/admin/reset")
          .done(() => displayMessage("All tables and users (except for admin) have been deleted."))
          .fail(res => displayError(res.responseText));
      });

      $("#select-user").on("click", function() {
        $.getJSON(`/user/${this.value}/login`);
        // do not update, use this in another window
      });

    });

  },
  error: function() {
    displayError("Invalid URL");
  },
  scriptList: function() {
    $.getJSON("/script/list")
      .done(scripts => {
        $("#content").html(templates.scriptList({scripts}));
        var editor = ace.edit("editor");
        editor.getSession().setMode("ace/mode/javascript");
        editor.getSession().setUseWrapMode(true);

        // TODO: script delete

        $("#script-create-button").click(function() {
          var src = editor.getValue();
          $.post("/script/create", $("#script-create-form").serialize() + "&src=" + encodeURIComponent(src))
            .done(routes.scriptList)
            .fail(res => displayError(res.responseText));
        });        
      })
      .fail(res => displayError(res.responseText));
  },
  scriptEdit: function(name) {
    $.getJSON(`/script/${name}`)
      .done(script => {
        var enabled = user === script.author;
        $("#content").html(templates.scriptEdit({script, enabled}));
        var editor = ace.edit("editor");
        editor.getSession().setMode("ace/mode/javascript");
        editor.getSession().setUseWrapMode(true);
        editor.setValue(script.src, -1);
        if (!enabled)
          editor.setReadOnly(true);

        $("#script-edit-button").click(function() {
          var src = editor.getValue();
          $.post(`/script/${name}/edit`, "src=" + encodeURIComponent(src))
            .done(lh("script/list"))
            .fail(res => displayError(res.responseText));
        });        
      })
      .fail(res => displayError(res.responseText));
  }
};





$(document).ready(function() {

  // precompile handlebars templates
  ["users", "tables", "login", "logout", "alert", "eval", "home", "drop",
   "import", "admin", "input", "output", "column", "scriptList", "scriptEdit"].forEach(
    n => templates[n] = Handlebars.compile($(`#${n}-template`).html())
  );
  Handlebars.registerPartial('drop', templates.drop);


  // starts by figuring out if the user is logged in
  $.get("/user/whoami").done(function(u) {
    user = u;
    if (user === "admin")
      $("#admin-li").fadeIn();
  }).fail(function() {
    user = null;
  }).always(function() {
    // display the correct login and admin pane
    updateLoginDom();
    // start routing location.hash
    routie({
      "user/list": routes.userList,
      "table/list": routes.tableList,
      "table/:name/output": routes.outputTable,
      "table/:name/input": routes.inputTable,
      "script/list": routes.scriptList,
      "script/:name": routes.scriptEdit,
      "eval": routes.eval,
      "import": routes.import,
      "admin": routes.admin,
      "": routes.home,
      "*": routes.error
    });
  });
});