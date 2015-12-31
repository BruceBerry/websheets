"use strict";

function renderInputTable(table) {
  document.title = `${table.name} - Input View`;
  // TODO: editing
  // TODO: when I do "each" on the row i need to hide the _owner and
  // possibly other values
  $("#content").html(templates.input({table}));

  var sel = "td:not(.disabled)";
  $(sel).on("mouseenter", function() {
    console.log("start");
    var $this = $(this);
    $this.data("prev", $this.html());
    $this.html($this.data("src"));
  });
  $(sel).on("mouseleave", function() {
    var $this = $(this);
    if ($this.data("editing") || !this.data("prev"))
      return;
    console.log("mrevert");
    $this.html($this.data("prev"));
  });
  // $("td").on("input", function() {
  //   console.log("input");
  // });
  $(sel).on("keydown", function(e) {
    var $this = $(this);
    if (e.which == 13) {
      e.preventDefault();
      console.log("committing " + $("code", this).html());
      $this.data("editing", false);
      // TODO: send to server
      $this.html($this.data("prev"));    
      return;
    } else if (e.which == 27) {
      e.preventDefault();
      console.log("revert");
      $this.data("editing", false);
      $this.html($this.data("prev"));
      return;
    }
    $this.data("editing", true);
  })
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
      return; // wut
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
