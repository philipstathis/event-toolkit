'use strict';

const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "us-east-1" });
const params = {
  TableName: 'toastmasters',
};

module.exports.list = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  // fetch all todos from the database
  dynamoDb.scan(params, (error, result) => {
    // handle potential errors
    if (error) {
      console.error(error);
      callback(null, {
        statusCode: error.statusCode || 501,
        headers: { 'Content-Type': 'text/plain', "Access-Control-Allow-Origin": "*" },
        body: 'Couldn\'t fetch the todos.',
      });
      return;
    }

    // create a response
    const response = {
      statusCode: 200,
      body: JSON.stringify(result.Items),
      headers: {
        "Access-Control-Allow-Origin": "*",
      }
    };
    callback(null, response);
  });
};
