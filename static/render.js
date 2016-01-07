"use strict";
var pwf = src => highlight(cleanJunk(src));

function renderInputTable(table) {
  document.title = `${table.name} - Input View`;
  $("#content").html(templates.input({table}));

  interact(table, "input");
}

function renderOutputTable(table) {
  document.title = `${table.name} - Output View`;
  $("#content").html(templates.output({table}));
  
  interact(table, "output");
}

function interact(table, mode) {

  var sel = "td:not(.disabled):not(.side-opt)";
  $(sel).on("mouseenter", function() {
    var $this = $(this);
    if ($this.data("editing"))
      return;
    var censored = this.dataset.censored;
    if (censored)
      $this.removeClass("censored-true");
    // use dataset instead of jquery b/c of autoconversion
    $("code", this).html(censored ? "" : this.dataset.src);
  });
  $(sel).on("mouseleave", function() {
    var $this = $(this);
    if ($this.data("editing"))
      return;
    var f = mode === "input" ? pwf : s => s;
    if (this.dataset.censored)
      $this.addClass("censored-true");
    $this.html("<code contenteditable=\"true\">" + f(this.dataset.src) + "</code>");
    $this.css("background-color", "");
  });
  // blur never fires if you click somewhere other than
  // another cell, so don't do that :-) use esc to cancel
  $(sel + " code").blur(function() {
    $(this).parent().data("editing", false);
    $(this).parent().trigger("mouseleave");
  });
  $(sel).on("keydown", function(e) {
    var $this = $(this);
    if (e.which == 13) {
      e.preventDefault();
      // TODO: check if any change was made
      var body = {
        src: $("code", this).html(),
        perm: $this.parent().data("perm"),
        row: this.parentElement.dataset.row,
        column: $this.data("col")
      };
      $this.data("editing", false);
      $.post(`/table/${table.name}/edit`, body)
        .done(() => routes[mode + "Table"](table.name))
        .fail(function(res) {
          displayError(res.responseText);
          $this.data("editing", false);
          $this.trigger("blur");
          $this.trigger("mouseleave");          
        });
    } else if (e.which == 27) {
      e.preventDefault();
      $this.data("editing", false);
      $this.trigger("blur");
      $this.trigger("mouseleave");
    } else if (!$this.data("editing")) {
      $this.data("editing", true);
      var width = $this.css("width");
      // $this.css("background-color", "white");
      $this.css("max-width", width);
      $this.css("min-width", width);
      $this.css("width", width);
    }

  });


  $("#add-row").on("click", function() {
    $.post(`/table/${table.name}/addrow`)
      .done(() => routes[mode + "Table"](table.name))
      .fail(res => displayError(res.responseText));
  });

  $(".row-insert-before,.row-insert-after").on("click", function() {
    var $this = $(this);
    var index = $this.parents("[data-row]").data("row");
    if ($this.attr("class") === "row-insert-after")
      index++;
    $.post(`/table/${table.name}/addrow`, {row: index})
      .done(() => routes[mode + "Table"](table.name))
      .fail(res => displayError(res.responseText));
  });

  $(".row-delete").on("click", function() {
    var $this = $(this);
    var index = $this.parents("[data-row]").data("row");
    $.post(`/table/${table.name}/${index}/deleterow`)
      .done(() => routes[mode + "Table"](table.name))
      .fail(res => displayError(res.responseText));
  });
}

function cleanJunk(wf) {
  if (!config.clean)
    return wf;
  wf = wf.toString();
  wf = wf.replace(/\.\d\./g, ".");
  wf = wf.replace(/\.\"(\w+?)\"/g, ".$1");
  wf = wf.replace("EName == \"\" || ", "");
  wf = wf.replace("newVal == \"\" || ", "");
  wf = wf.replace(/rowOwner/g, "owner");
  return wf;
}

// current set of tables and column names
var keywords = {};
var joinkw = kws => new RegExp("\\b(" + kws.join("|") + ")\\b", "g");
var updateKeywords = function() {
  $.get("/debug/keywords")
    .done(function(kw) {
      keywords = kw;
      if (keywords.tables.length > 0)
        keywords.re_tables = joinkw(keywords.tables);
      if (keywords.columns.length > 0)
        keywords.re_columns = joinkw(keywords.columns);
      if (keywords.functions.length > 0)
        keywords.re_functions = joinkw(keywords.functions);
      keywords.re_kw = joinkw([
        "in", "not", "if", "then", "else", "when", "null", "true", "false"
      ]);
      keywords.re_env = joinkw([
        "table", "tableName", "tableOwner",
        "row", "rowIndex", "rowOwner",
        "col", "colName",
        "this", "user", "newVal"
      ]);
    })
    .fail(() => console.log("Keywords currently unavailable"));
};
updateKeywords();
function highlight(wf) {
  if (!config.highlight) {
    return wf;
  }
  wf = wf.toString();
  wf = wf.replace(keywords.re_kw, "<span class=\"keyword\">$&</span>");
  wf = wf.replace(keywords.re_env, "<span class=\"env\">$&</span>");
  if (keywords.re_tables)
    wf = wf.replace(keywords.re_tables, "<span class=\"tname\">$&</span>");  
  if (keywords.re_columns)
    wf = wf.replace(keywords.re_columns, "<span class=\"column\">$&</span>");
  if (keywords.re_functions)
    wf = wf.replace(keywords.re_functions, "<span class=\"func\">$&</span>");
  wf = wf.replace("aa", "<span class=\"func\">aa</span>");
  return wf;
}
