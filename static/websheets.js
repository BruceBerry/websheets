"use strict";

window.user = null;

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

// precompile handlebars templates
var templates = {};
["users", "tables", "login", "logout", "alert", "eval", "home", "drop",
 "import", "admin", "input"].forEach(
  n => templates[n] = Handlebars.compile($(`#${n}-template`).html())
);

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
      window.user = null;
      if (document.location.hash === "")
        routes.home();
      else
        document.location.hash = "";
      updateLoginDom();
    });
  } else {
    $("#nav-right").html(templates.login());
    $("#login-form").submit(function(e) {
      e.preventDefault();
      $("#login-button").trigger("click"); // trigger on enter
    });
    $("#login-button").click(function() {
      $.post("/user/login", $("#nav-login-form").serialize()).done(function() {
        window.user = $("#nav-login-form [name=user]").val();
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
    $.getJSON(`tables/${name}`).done(function(table) {
      renderOutputTable(table);
    }).fail(function(res) {
      displayError(res.statusText);
    });
  },
  exprTable: function(name) {
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

}


function doTableEdit(name) {
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
  });
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
$.get("/user/whoami").done(function(u) {
  user = u;
  if (user === "admin")
    $("#admin-li").fadeIn();
}).fail(function() {
  user = null;
}).always(function() {
  updateLoginDom();
  // setup routing
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
