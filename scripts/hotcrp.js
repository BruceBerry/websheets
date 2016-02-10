numReviews = args[0];
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
    // TODO: Review.reviews seems to have a wrong formula 
  }
}
return new ast.ScalarValue(null);