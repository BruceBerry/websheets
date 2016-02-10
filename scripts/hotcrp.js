// description: Script to automatically assign reviews in HotCRP. Takes x arguments.
// setuid: false
function f(numReviews) {
  // TODO: use maxReviews and minReviews from Config
  numReviews = api.toJS(numReviews);
  var pc = api.es("Committee.member");
  var plen = api.es("len(Paper)");
  // for each paper
  for (var i = 0; i < plen; i++) {
    var ptitle = api.es(`Paper.${i}.title`);
    // get the preference for this paper for each pc member, but filter if
    // a) if they are already reviewing the paper
    // b) they have > numReviews reviews
    var query = `
      {{member: m, pref: Preference[member==m && paper=="${ptitle}"]}
        for m in Committee.member
        when Review[author==m&&paper=="${ptitle}"]==[] && len(Review[author==m&&assigned==true]) < ${numReviews}}`;
    var options = api.es(query);
    if (options.length === 0)
      return api.imm(null);
    options.forEach(o => {
      if (o.pref.length === 0)
        o.pref = 0;
      else
        o.pref = o.pref[0].pref;
    });
    // TODO: sort them, but randomize result a little
    for (var k = 0; k < numReviews && k < options.length; k++) {
      var pref = options[k];
      var allPrefs = api.es("Preference");
      var pRowIx = api.findIndex(allPrefs, i => i.paper === pref.paper && i.member === pref.member);
      if (pRowIx > -1)
        api.delRow("Preference", rowIx);
      var rRowIx = api.addRow("Review");
      api.writeCell("Review", rRowIx, "author", `"${pref.member}"`);
      api.writeCell("Review", rRowIx, "paper", `"${ptitle}"`);
      api.writeCell("Review", rRowIx, "assigned", "true");
    }
  }
  return api.imm(null);
}
return f(args[0]);