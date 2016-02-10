var _ = require("underscore");

/*

for each paper
  get the list of people who have not been assigned 2 reviews and are
    1) not already reviewing it
    2) do not have conflicts and
    3) are not the author
  get the one with the highest preference for this paper
  if list is empty, stop (not enough reviewers)
*/

// ast passed to avoid circular dep
exports.execScript = function(ws, user, env, ast, fname, ...args) {
  var es = function(s) {
    return ws.evalString(user, s).toCensoredJSValue(ws, user);
  };
  var toJS = function(obj) {
    return obj.toCensoredJSValue(ws, user);
  };
  var delRow = function(t, ix) {
    ws.deleteRow(user, t, ix);
    return ws.input[t].cells.length;
  };
  var addRow = function(t, ix) {
    ws.addRow(user, t, ix);
    return ws.input[t].cells.length-1;
  };
  var writeCell = function(t, ix, c, src) {
    ws.writeCell(user, t, ix, c, src);
  };
  var findIndex = function(l, f) {
    return _.findIndex(l, f);
  };
  var hotcrp = function(numReviews) {
    numReviews = toJS(numReviews);
    var pc = es("Committee.member");
    var plen = es("len(Paper)");
    // for each paper
    for (var i = 0; i < plen; i++) {
      var ptitle = es(`Paper.${i}.title`);
      // get the preference for this paper for each pc member, but filter if
      // a) if they are already reviewing the paper
      // b) they have > numReviews reviews
      var query = `
        {{member: m, pref: Preference[member==m && paper=="${ptitle}"]}
          for m in Committee.member
          when Review[author==m&&paper=="${ptitle}"]==[] && len(Review[author==m&&assigned==true]) < ${numReviews}}`;
      var options = es(query);
      if (options.length === 0)
        return new ast.ScalarValue(null);
      options.forEach(o => {
        if (o.pref.length === 0)
          o.pref = 0;
        else
          o.pref = o.pref[0].pref;
      });
      // TODO: sort them, but randomize result a little
      for (var k = 0; k < numReviews && k < options.length; k++) {
        var pref = options[k];
        // TODO: this API sucks, it forces evaluation of everything unnecessarily
        var allPrefs = es("Preference");
        var pRowIx = findIndex(allPrefs, i => i.paper === pref.paper && i.member === pref.member);
        if (pRowIx > -1)
          delRow("Preference", rowIx);
        var rRowIx = addRow("Review");
        // TODO: this string based API could be sensitive to injection attacks, it would be nice to have stronger typing
        // TODO: at the very least, support escaping in strings
        writeCell("Review", rRowIx, "author", `"${pref.member}"`);
        writeCell("Review", rRowIx, "paper", `"${ptitle}"`);
        writeCell("Review", rRowIx, "assigned", "true");
        // TODO: writeCell does not invalidate cache?
        // TODO: Review.reviews seems to have a wrong formula 
      }
    }
    return new ast.ScalarValue(null);
  };
  return hotcrp(...args);
};

/*


*/