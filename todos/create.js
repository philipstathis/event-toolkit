'use strict';

const uuid = require('uuid');
const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const eventbrite = require('eventbrite').default;
const ssm = new AWS.SSM({'region': 'us-east-1'});
const eventBriteSecretKeyPromise = ssm.getParameter({
  Name: '/eventbrite/live',
  WithDecryption: true
}, function(err, data) {
  if (err) {console.log(err);}
  else {console.log(data);}
}).promise();

const acceptedEvents = [
  '057686', //114842057686
  '067716'  //114842067716
];

const baseEventIdPrefix = '114842'

function checkInAttendee(eventId, attendeeId) {
  return fetch("https://www.eventbrite.com/checkin_update", {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,el-GR;q=0.8,el;q=0.7",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-csrftoken": "557324fc83d311eabd59233c61111e16",
        "x-requested-with": "XMLHttpRequest",
        "cookie": "shenanigans--ignore--me"
      },
      "referrer": "https://www.eventbrite.com/checkin?eid=110465174310",
      "referrerPolicy": "strict-origin-when-cross-origin",
      "body": "eid=" + baseEventIdPrefix + eventId + "&attendee=" + attendeeId + "&quantity=1",
      "method": "POST",
      "mode": "cors"
  });
}

module.exports.markAttendeeAsCheckedIn = async (eventId, attendeeEmail) => {
  const eventbriteSecretKey = await eventBriteSecretKeyPromise;
  const sdk = eventbrite({token: eventbriteSecretKey["Parameter"]["Value"]});
  
  const attendeesResult = await sdk.request('/events/' + baseEventIdPrefix + eventId + '/attendees');
  let json = [ attendeesResult ] ;
  let continuation = attendeesResult["pagination"]["continuation"];
  while (continuation){
    let innerResult = await sdk.request('/events/' + baseEventIdPrefix + eventId + '/attendees?continuation=' + continuation);
    json.push(innerResult);
    continuation = innerResult["pagination"]["continuation"];
  }

  // handle response data
  console.log(json);

  const attendeeList = json.map(rs => rs["attendees"])
    .map(response => response.filter(r => r["profile"]["email"].toUpperCase() === (attendeeEmail || '').toUpperCase())
    .map(rs => rs.id));
  attendeeList.forEach(async attendeeId => await checkInAttendee(eventId, attendeeId));
};

module.exports.create = (event, context, callback) => {
  const timestamp = new Date().getTime();
  const data = JSON.parse(event.body);
  if (typeof data.eventPassword !== 'string' || !acceptedEvents.includes(data.eventPassword)) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin' : '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({error: 'Couldn\'t create the todo item.'})
    });
    return;
  }

  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Item: {
      id: uuid.v1(),
      attendeeEmail: data.attendeeEmail,
      eventPassword: data.eventPassword,
      checked: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };

  // write the todo to the database
  dynamoDb.put(params, (error) => {
    // handle potential errors
    if (error) {
      console.error(error);
      callback(null, {
        statusCode: error.statusCode || 501,
        headers: {
          'Access-Control-Allow-Origin' : '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({error: 'Couldn\'t create the todo item.'}),
      });
      return;
    }

    const eventbriteCheckIn = this.markAttendeeAsCheckedIn(data.eventPassword, data.attendeeEmail).catch(err => console.log(err));
    
    // create a response
    const response = {
      statusCode: 200,
      body: JSON.stringify(params.Item),
      headers: {
          'Access-Control-Allow-Origin' : '*'
      }
    };
    callback(null, response);
  });
};
