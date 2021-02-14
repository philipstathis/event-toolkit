'use strict';

const events = require('../todos/events');

events.getAttendeesForEvent("114842057686")
    .catch((err) => {
        return console.log(err)
});