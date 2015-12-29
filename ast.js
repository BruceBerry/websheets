"use strict";

/* inspired by estree */

exports.Loc = class SourceLocation {
  constructor(jloc) { // jison location
    this.start = jloc.first_column;
    this.end = jloc.last_column;
  }
};

class Node {
  constructor(type, location) {
    this.type = type;
    this.loc = location;
  }
}

exports.Literal = class Literal extends Node {
  constructor(data, location) {
    super("Literal", location);
    this.value = data;
  }
};

exports.Identifier = class Identifier extends Node {
  constructor(id, location) {
    super("Identifier", location);
    this.name = id;
  }
};

exports.Binary = class Binary extends Node {
  constructor(op, l, r, location) {
    super("Binary", location);
    this.op = op;
    this.l = l;
    this.r = r;
  }
};

exports.Unary = class Unary extends Node {
  constructor(op, arg, location) {
    super("Unary", location);
    this.op = op;
    this.arg = arg;
  }
};

exports.List = class List extends Node {
  constructor(elements, location) {
    super("List", location);
    this.elements = elements;
  }
};

exports.Tuple = class Tuple extends Node {
  constructor(map, location) {
    super("Tuple", location);
    // trick to put them back in the correct order
    this.map = {};
    var keys = Object.keys(map).reverse();
    keys.forEach(k => this.map[k] = map[k]);
  }
};

exports.IfThenElse = class IfThenElse extends Node {
  constructor(test, t, f, location) {
    super("IfThenElse", location);
    this.test = test;
    this.whenTrue = t;
    this.whenFalse = f;
  } 
}
