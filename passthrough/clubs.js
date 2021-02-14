'use strict';

const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies
const fetch = require('node-fetch');
const parse = require('csv-parse/lib/sync');

module.exports.getLiveStaticClubData = async () => {
    const response = await fetch('http://dashboards.toastmasters.org/export.aspx?type=CSV&report=clubperformance~46~8/31/2020~~2020-2021', {retries: 4,retryDelay: 1000}); 
    const text = await response.text();
    const records = parse(text, {columns:true, skip_lines_with_error:true, delimiter:',', ltrim:true, rtrim:true});
    const result = records.filter(c => c["Club Status"] === "Active").map(c => {
      let r = c;
      r.clubName = r["Club Name"] + " (" + r["Club Number"] + ")";
      return r;
    });
    return result;
  }

module.exports.list = async (event, context, callback) => {
    const results = await this.getLiveStaticClubData();
    // create a response
    const response = {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin' : '*'
        },
        body: JSON.stringify(results),
        isBase64Encoded: false
    };
    callback(null, response);
};
