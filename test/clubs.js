'use strict';

const clubs = require('../passthrough/clubs');

clubs.getLiveStaticClubData().catch((err) => {
    return console.log(err)
});