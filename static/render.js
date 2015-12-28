
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
  table.colnames.forEach(c => { result += `<th>${c}</th>`; });
  result += "<th>All Columns</th>";
  result += "</tr></thead><tbody>";
  // Read
  result += "<tr><th>Read</th>";
  table.colperms.map(rw => rw.read).forEach(p => { result += `<td><code>${pe(p.input)}</code></td>`; });
  result += `<td><code>${pe(table.rowperm.read.input)}</code></td>`;
  result += "</tr>";
   // "Write", "Init", "Val", "Add", "Del"]
  result += "<tr><th>Write</th>";
  table.colperms.map(rw => rw.write).forEach(p => { result += `<td><code>${pe(p.input)}</code></td>`; });
  result += `<td><code>${pe(table.rowperm.write.input)}</code></td>`;
  result += "</tr>";

  result += "<tr><th>Init</th>";
  table.initvalues.forEach(e => { result += `<td><code>${pe(e.input)}</code></td>`; });
  result += "<td class='disabled'></td>";
  result += "</tr>";
  
  result += "<tr><th>Valid</th>";
  table.validchecks.forEach((e) => { result += `<td><code>${pe(e.input)}</code></td>`; });
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
  table.colnames.forEach(c => { result += `<th>${c}</th>`; });
  result += "</thead><tbody>";
  table.rows.forEach(function(row) {
    result += `<tr><td>${row.owner}</td>`;
    row.cells.forEach(cell => result += `<td><code>${pe(cell.expr.input)}</code></td>`);
    result += "</tr>";
  });

  result += "</tbody></table>";
  $("#content").html(result);

  // $("#content").html(templates.input({table}));

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

// TODO: make it smart by supplying table, column names and functions
function highlight(wf) {
  if (!config.highlight) {
    return wf;
  }
  wf = wf.replace(/\b(in|not|True|False)\b/g, "<span class=\"keyword\">$&</span>");
  wf = wf.replace(/\b(owner|row|user|this|val|newVal)\b/g, "<span class=\"env\">$&</span>");
  wf = wf.replace(/\b(AVG)\b/g, "<span class=\"func\">$&</span>");
  wf = wf.replace(/\b(Task|Event|Response|Applicant|Faculty|Review)\b/g, "<span class=\"tname\">$&</span>");
  wf = wf.replace(/\b(Author|Name|Completed|Shared|Public|Invitees|Attendees|User|EName|Coming|Conflicts|AppReviews|Average|AppName|Grade)\b/g,
    "<span class=\"column\">$&</span>");

  return wf;
}

// TODO: do not use admin/admin2, etc
// TODO: dismiss alerts quicker/easily