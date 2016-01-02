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
    // use dataset instead of jquery b/c of autoconversion
    $("code", this).html(this.dataset.src);
  });
  $(sel).on("mouseleave", function() {
    var $this = $(this);
    if ($this.data("editing"))
      return;
    var f = mode === "input" ? pwf : s => s;
    $this.html("<code contenteditable=\"true\">" + f(this.dataset.src) + "</code>");
    $this.css("background-color", "");
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
      $this.css("background-color", "white");
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
    $.post(`/table/${table.name}/deleterow`, {row: index})
      .done(() => routes[mode + "Table"](table.name))
      .fail(res => displayError(res.responseText));
  });
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
  wf = wf.toString();
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
  wf = wf.toString();
  wf = wf.replace(/\b(in|not|if|then|else|when|null|true|false)\b/g, "<span class=\"keyword\">$&</span>");
  wf = wf.replace(/\b(owner|row|user|this|val|newVal)\b/g, "<span class=\"env\">$&</span>");
  if (keywords.re_tables)
    wf = wf.replace(keywords.re_tables, "<span class=\"tname\">$&</span>");  
  if (keywords.re_columns)
    wf = wf.replace(keywords.re_columns, "<span class=\"column\">$&</span>");
  if (keywords.re_functions)
    wf = wf.replace(keywords.re_functions, "<span class=\"func\">$&</span>");
  wf = wf.replace("aa", "<span class=\"func\">aa</span>");
  return wf;
}
