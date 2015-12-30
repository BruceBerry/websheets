"use strict";

// current username
var user = null;
// handlebar templates
var templates = {};

var config = {
  clean: false,
  highlight: true
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
    $(".alert").fadeOut();
    $.getJSON("/user/list", function(users) {
      $("#content").html(templates.users(users));
    });
  },
  tableList: function() {
    $(".alert").fadeOut();
    $.getJSON("/table/list", function(tables) {
      $("#content").html(templates.tables(tables));
      $(".btn-delete").on("click", function() {
        var name = $(this).data("table");
        $.ajax(`tables/${name}`, {
          method: "DELETE"
        }).done(routes.tableList)
          .fail(res => doError(res.responseText));
      });
    });
  },
  valueTable: function(name) {
    $(".alert").fadeOut();
    $.getJSON(`/table/${name}/value`)
      .done(renderOutputTable)
      .fail(function(res) {
        displayError(res.responseText);
    });
  },
  exprTable: function(name) {
    $(".alert").fadeOut();
    $.getJSON(`/table/${name}/expr`)
      .done(renderInputTable)
      .fail(function(res) {
        displayError(res.responseText);
    });
  },
  home: function() {
    $(".alert").fadeOut();
    $("#content").html(templates.home());
  },
  eval: function() {
    $(".alert").fadeOut();
    $("#content").html(templates.eval());

    $("#eval-form").on("submit", function(e) {
      var expr = $("#eval").val();
      var append = code => $("#eval-console").append(`<li><code>${code}</code></li>`);
      $.post("/debug/eval", {expr})
        .done(res => append(res.responseText))
        .fail(res => append(res.responseText));
      e.preventDefault();
    });
  },
  import: function() {
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
      }).done(routes.tableList)
        .fail(res => displayError(res.responseText));
    });
  },
  admin: function() {
    $(".alert").fadeOut();
    $("#content").html(templates.admin());



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
        .fail(res => doError(res.statusText));
    });

    $("#reset-btn").on("click", function() {
      $.post("/admin/reset")
        .done(() => doMessage("All tables and users (except for admin) have been deleted."))
        .fail(res => doError(res.statusText));
    });

    // TODO: load, save and download

  },
  error: function() {
    displayError("Invalid URL");
  }
};





$(document).ready(function() {

  // precompile handlebars templates
  ["users", "tables", "login", "logout", "alert", "eval", "home", "drop",
   "import", "admin", "input"].forEach(
    n => templates[n] = Handlebars.compile($(`#${n}-template`).html())
  );

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
      "users": routes.userList,
      "tables": routes.tableList,
      "tables/:name": routes.valueTable,
      "tables/:name/edit": routes.exprTable,
      "eval": routes.eval,
      "import": routes.import,
      "admin": routes.admin,
      "": routes.home,
      "*": routes.error
    });
  });
});