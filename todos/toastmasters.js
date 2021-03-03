"use strict";

const AWS = require("aws-sdk"); // eslint-disable-line import/no-extraneous-dependencies

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "us-east-1" });

module.exports.getCurrentOfficers = async () => {
  const officialClubOfficers = await dynamoDb
    .scan({ TableName: "toastmasters" })
    .promise();

  const registrations = await dynamoDb
    .scan({ TableName: "attendee" })
    .promise();

  const attendance = await dynamoDb.scan({ TableName: "verified" }).promise();

  const enrichedClubData = officialClubOfficers.Items.map((r) => {
    const attended = registrations.Items.find(
      (reg) =>
        reg.id == parseInt(r.memberId, 10) + "-" + parseInt(r.clubId, 10) + "-" + r.office
        // && (reg.eventId == 98740894233) // set the actual event here
    );
    r.registered = (attended || false) && attended.registered;
    const verified = attendance.Items.find(
      (attendee) => attendee.id == parseInt(r.clubId, 10) + "-" + r.office
    );
    r.verified = (verified || false) && true;
    r.email = null;
    r.firstName = null;
    r.lastName = null;
    return r;
  });

  return enrichedClubData;
};

module.exports.list = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const results = await this.getCurrentOfficers();
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(results),
    isBase64Encoded: false,
  };
  console.log(response);
  callback(null, response);
};
