'use strict';

const create = require('../todos/create');
const fetch = require('node-fetch');

create.markAttendeeAsCheckedIn("057686", "philipstathis+seven@gmail.com")
    .catch((err) => {
        return console.log(err)
});