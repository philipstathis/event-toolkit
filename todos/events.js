'use strict';

const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies

const eventbrite = require('eventbrite').default;
const dynamoDb = new AWS.DynamoDB.DocumentClient({'region': 'us-east-1'});

const ssm = new AWS.SSM({'region': 'us-east-1'});
const eventBriteSecretKeyPromise = ssm.getParameter({
  Name: '/eventbrite/live',
  WithDecryption: true
}, function(err, data) {
  if (err) {console.log(err);}
  else {console.log(data);}
}).promise();

module.exports.getAttendeesForEvent = async (eventId) => {
  const eventbriteSecretKey = await eventBriteSecretKeyPromise;
  const sdk = eventbrite({token: eventbriteSecretKey["Parameter"]["Value"]});
  
  const eventResult = await sdk.request('/events/' + eventId);
  const startTime = eventResult.start.local;

  const eventQuestionsResult = await sdk.request('/events/' + eventId + '/questions');

  // ignoring chance of more than 50 questions (short sighted, but mvp)
  if (!eventQuestionsResult["questions"]){
    console.log('No Questions Specified')
    return;
  }
  var clubQuestions = eventQuestionsResult["questions"].filter(que => {
      return que["type"] === "dropdown" &&
      que["question"]["html"].startsWith("For District 46 Members:");
  });
  const officerTrainingQuestion = eventQuestionsResult["questions"].find(que => {
    return que["question"]["html"].startsWith("Which Officer Training");
  }).id;
  const outsideDistrictClubQuestion = eventQuestionsResult["questions"].find(que => {
    return que["question"]["html"].startsWith("Please provide us the District and Club numbers and your club names");
  }).id;

  console.log(clubQuestions);
  const attendeesResult = await sdk.request('/events/' + eventId + '/attendees');
  let json = [ attendeesResult ] ;
  let continuation = attendeesResult["pagination"]["continuation"];
  while (continuation){
      let innerResult = await sdk.request('/events/' + eventId + '/attendees?continuation=' + continuation);
      json.push(innerResult);
      continuation = innerResult["pagination"]["continuation"];
  }

  // handle response data
  console.log(json);

  let results = json.map(rs => rs["attendees"]).reduce(function (output, response) {
    let selectionsOut = clubQuestions.map(cl => cl["id"]).reduce(function (answerObjects, clubQuestionId) {
      let attendeesOut = response.map(function (attendee) {
          let clonedResult = JSON.parse(JSON.stringify(attendee));
          if (clonedResult.answers){
            let roleAnswer = clonedResult.answers.find(obj => {
              return obj["question_id"] === officerTrainingQuestion;
            });
            if (roleAnswer) {
              clonedResult["role"] = roleAnswer["answer"]
            }
            let clubName = clonedResult.answers.find(obj => {
              return obj["question_id"] === clubQuestionId;
            });
            if (clubName && clubName["answer"]) {
              if ((clubName["answer"] || '').toUpperCase() === "None of the below".toUpperCase()) {
                clonedResult["division"] = "Outside District 46";
                clonedResult["area"] = "Outside District 46";

                const outsideClubName = clonedResult.answers.find(obj => obj["question_id"] === outsideDistrictClubQuestion);
                clonedResult["clubName"] = outsideClubName["answer"];
              }
              else {
                const areaPosition = clubName["answer"].lastIndexOf('-');
                const areaPiece = clubName["answer"].substring(areaPosition + 1) || ': ';
                clonedResult["area"] = (areaPiece.split(':')[1]|| '').trimRight();
  
                const divisionPosition = clubName["answer"].lastIndexOf('-', areaPosition - 1);
                const divisionPiece = clubName["answer"].substring(divisionPosition + 1, areaPosition) || ': ';
                clonedResult["division"] = (divisionPiece.split(':')[1] || '').trimRight();
  
                clonedResult["clubName"] = clubName["answer"].substring(0, divisionPosition -1).trimRight();
              }
            }
          }
          clonedResult["startTime"] = startTime;
          return clonedResult;
      });
      return Array.prototype.concat(answerObjects, attendeesOut.filter(at => at.clubName && !at.cancelled));
    }, []);
    return Array.prototype.concat(output, selectionsOut);
  }, []);

  return results;
}

module.exports.getValidAttendeesForEvent = async (eventId) => {
  const attendees = await this.getAttendeesForEvent(eventId);

  const officialClubOfficers = await dynamoDb.scan({TableName: 'officer-list-dev'}).promise();
  
  const clubOfficerMap = officialClubOfficers.Items.map(o => {
    if (o.clubName === 'Geller & Company Toastmasters (7708987)') { o.clubName = 'Geller and Company (7708987)' }
    if (o.clubName === "French/Bilingual Toastmasters of New York (7315453)") { o.clubName = 'French/Bilingual Toastmasters of NY (7315453)' }
    if (o.clubName === 'Leadership Roundtable Toastmasters Club (1636)') { o.clubName = 'Leadership Roundtable  (1636)' }
    if (o.clubName === 'Columbia University Toastmasters Club (3890961)') { o.clubName = 'Columbia University Toastmasters  (3890961)' }
    if (o.clubName === 'Bronx Advanced Speakers Toastmasters (3337790)') { o.clubName = 'Bronx Advanced Speakers (3337790)' }
    if (o.clubName === 'IBM Armonk Toastmasters (7780585)') { o.clubName = 'IBM Armonk Toastmasters (07780585)' }
    if (o.clubName === 'Legg Mason Toastmasters - New York Chapter (5821058)') { o.clubName = 'Legg Mason Toastmasters - NY Chapter (5821058)' }
    if (o.clubName === 'Bloomberg New York Toastmasters - Bloomberg Employees Only (3618250)') { o.clubName = 'Bloomberg New York Toastmasters (3618250)' }
    if (o.clubName === 'IBM Westchester Toastmasters Club (648356)') { o.clubName = 'IBM Westchester Toastmasters (648356)' }
    if (o.clubName === 'Marsh McLennan Companies New York (2078496)') { o.clubName = 'Marsh McLennan Companies NY (2078496)' }
    if (o.clubName === 'Deloitte Tri-State Toastmasters Club (1244840)') { o.clubName = 'Deloitte Tri-State Toastmasters  (1244840)' }
    return o;
  });

  return attendees.filter(a => {
    return a["checked_in"] || clubOfficerMap.filter(o => o.email && o.email !== '').find(o => {
      return o.email.toLowerCase() === a["profile"]["email"].toLowerCase() &&
            o.office === a["role"] &&
            o.clubName === a["clubName"]
    });
  });
};

module.exports.filterEmailData = (data) => {
  return data.map(rs => {
    rs["first_name"] = rs["profile"]["first_name"] + ' ' + rs["profile"]["last_name"].substring(0,1);
    delete rs["profile"];
    delete rs["costs"];
    delete rs["barcodes"];
    return rs;
  });
};

module.exports.list = async (event, context, callback) => {
  const eventId = "110731222066"; // <== the error one //"110731167904";//event.pathParameters.id;
  const results = this.filterEmailData(await this.getValidAttendeesForEvent(eventId));
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

module.exports.get = async (event, context, callback) => {
  const eventId = event.pathParameters.id;
  const results = this.filterEmailData(await this.getAttendeesForEvent(eventId));
  // create a response
  const response = {
      statusCode: 200,
      headers: {
          'Access-Control-Allow-Origin' : '*',
          'Cache-Control': 'max-age=2000'
      },
      body: JSON.stringify(results),
      isBase64Encoded: false
  };
  callback(null, response);
};