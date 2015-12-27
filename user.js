"use strict";

class User {
  constructor(user, pass) {
    this.user = user;
    this.pass = pass;
  }

  static admin() {
    return new User("admin", "pass");
  }

  static ric() {
    return new User("riccardo", "pass");
  }

}

exports.User = User;