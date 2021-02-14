const fs = require('fs'); 
const parse = require('csv-parse');
const uuid = require('uuid');
const AWS = require("aws-sdk"); // eslint-disable-line import/no-extraneous-dependencies
const dynamoDb = new AWS.DynamoDB.DocumentClient({'region': 'us-east-1'});

module.exports.readCsvData = async (filePath, callback) => {
  var csvData=[];
  const parseStream = parse({columns:true, delimiter:',', ltrim:true, rtrim:true});
  return await fs.createReadStream(filePath).pipe(parseStream).on('data', function(csvrow) {
    csvData.push(csvrow);
    callback(csvrow);
  })
  .on('end',function() {
    //do something with csvData
    console.log(csvData);
  });
};

module.exports.insertToDynamoDB = (row) => {
  const timestamp = new Date().getTime();
  const params = {
    TableName: 'toastmasters',
    Item: {
      uuid: uuid.v1(),
      clubId: row["Club ID"],
      clubName: row["Club Name"],
      office: row["Office"],
      memberId: row["Member ID"],
      lastName: row["Last Name"],
      firstName: row["First Name"],
      email: row["Email Address"],
      division: row["Division"],
      area: row["Area"],
      paidStatus: row["Paid Status"],
      pathwaysEnrolled: row["Pathways Enrolled"],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };

  // write the todo to the database
  dynamoDb.put(params, (error) => {
    // handle potential errors
    if (error) {
      console.error(error);
      return;
    }
  });
  console.log("insert complete");
};

this.readCsvData('officerdata.csv', (args) => this.insertToDynamoDB(args));