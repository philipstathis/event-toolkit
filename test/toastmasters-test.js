'use strict';

const fastcsv = require('fast-csv');
const fs = require('fs'); 
const makeIntoCsv = (fileName) => (data) => {
  const ws = fs.createWriteStream(fileName);
  fastcsv.write(data, { headers: true}).pipe(ws);
}

const list = require('../todos/toastmasters');
const exportMissingRegistrationEmails = async () => {
    const enrichedOutput = await list.getCurrentOfficers();
    const writeIt = makeIntoCsv("OfficerRegistrations.csv");
    writeIt(enrichedOutput);
}

exportMissingRegistrationEmails();