// description: Script to automatically assign reviews in HotCRP. Takes x arguments.
// setuid: false
function f(maxR,minR) {
  "use strict";
  // TODO: use maxReviews and minReviews from Config
  maxR = api.toJS(maxR);
  minR = api.toJS(minR);
  var pc = api.es("Committee.member");
  var plen = api.es("len(Paper)");
  // for each paper
  for (var i = 0; i < plen; i++) {
    var ptitle = api.es(`Paper.${i}.title`);
    api.log("Assigning", ptitle);
    // get the preference for this paper for each pc member, but filter if
    // a) if they are already reviewing the paper
    // b) they have >= maxR reviews
    // c) TODO: they have a conflict with the paper
    var query = `
      {{member: m, pref: Preference[member==m && paper=="${ptitle}"]}
        for m in Committee.member
        when Review[author==m&&paper=="${ptitle}"]==[] &&
             len(Review[author==m]) < ${maxR} &&
             m not in Paper[title=="${ptitle}"].0.conflicts
      }`;
    var options = api.es(query);
    options.forEach(o => {
      if (o.pref.length === 0)
        o.pref = 0;
      else
        o.pref = o.pref[0].pref;
    });
    // TODO: randomize result a little
    options = api.sortBy(options, o => -o.pref);
    api.log("options", options);
    for (var k = 0; k < minR && k < options.length; k++) {
      var pref = options[k];
      var allPrefs = api.es("Preference");
      var pRowIx = api.findIndex(allPrefs, i => i.paper === ptitle && i.member === pref.member);
      api.log("compare", allPrefs, pref, pRowIx);
      if (pRowIx > -1)
        api.delRow("Preference", pRowIx);
      var rRowIx = api.addRow("Review");
      api.writeCell("Review", rRowIx, "author", `"${pref.member}"`);
      api.writeCell("Review", rRowIx, "paper", `"${ptitle}"`);
      api.writeCell("Review", rRowIx, "assigned", "true");
    }
  }
  return api.imm(null);
}
return f(args[0], args[1]);
//@ sourceURL=hotcrp.js
