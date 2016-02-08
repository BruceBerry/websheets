

/*

for each paper
  get the list of people who have not been assigned 2 reviews and are
    1) not already reviewing it
    2) do not have conflicts and
    3) are not the author
  get the one with the highest preference for this paper
  if list is empty, stop (not enough reviewers)
*/


function execScript(ws, user, env, ...args) {
  var es = function(s) {
    return ws.evalString(user, s).toCensoredJSValue(ws, user);
  };
}

function(es)
function() {
  var plen = es("len(Paper)").value;
  for (var i = 0; i < plen; i++) {
    var ptitle = es("Paper." + i + ".title").value;
    var pc = toList(es("Committee.member"));


  }
  ws.evalString(""  
}