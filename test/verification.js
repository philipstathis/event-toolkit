'use strict';

const events = require('../todos/events');
const get = require('../todos/get');
const fs = require('fs'); 
const parse = require('csv-parse/lib/sync');
const uuid = require('uuid');
const fastcsv = require('fast-csv');

const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies
const dynamoDb = new AWS.DynamoDB.DocumentClient({'region': 'us-east-1'});

module.exports.legacyReadCsvData = (filePath) => {
  var csvData=[];
  fs.createReadStream(filePath)
    .pipe(parse({columns:true, delimiter:',', ltrim:true, rtrim:true}))
    .on('data', function(csvrow) {
        console.log(csvrow);
        //do something with csvrow
        csvData.push(csvrow);
    })
    .on('end',function() {
      //do something with csvData
      console.log(csvData);
    });
  return csvData;
};


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

module.exports.readDynamoDdEntry = () => {
  const params = {
    TableName: 'serverless-rest-api-ps-v2-dev',
    Key: {
      id: "02ba2d10-cc7f-11ea-b3e8-770077baec60",
    },
  };

  // fetch todo from the database
  dynamoDb.get(params, (error, result) => {
    // handle potential errors
    if (error) {
      console.error(error);
      console.log(null, {
        statusCode: error.statusCode || 501,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Couldn\'t fetch the todo item.',
      });
      return;
    }

    result;
  });
};

module.exports.getAllAttendees = async () => {
  let attendees = await events.getAttendeesForEvent("110731167904");
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731189970"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731193982"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731204012"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731218054"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731222066"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("114842057686"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("114842067716"));
  return attendees;
}

module.exports.clearTable = async (tableName) => {
  const params = {TableName: tableName};
  const result = await dynamoDb.scan(params).promise();
  result.Items.forEach(async i => await dynamoDb.delete({TableName: tableName, id: i.id}).promise());
};

module.exports.insertOfficerListItem = (row) => {
  const office = row["Office"];
  const clubName = row["Club Name"];
  if (office === "VicePresidentMembership") {row["Office"] = "Vice President of Membership" }
  if (office === "VicePresidentEducation") {row["Office"] = "Vice President of Education" }
  if (office === "VicePresidentPublicRelations") {row["Office"] = "Vice President of PR" }
  if (office === "SergeantAtArms") {row["Office"] = "Sergeant at Arms" }
  row["Club Name"] = clubName + " (" + row["Club ID"] + ")"

  const timestamp = new Date().getTime();
  const params = {
    TableName: 'officer-list-dev',
    Item: {
      id: uuid.v1(),
      division: row["Division"],
      area: row["Area"],
      clubName: row["Club Name"],
      firstName: row["First Name"],
      lastName: row["Last Name"],
      email: row["Email Address"],
      office: row["Office"],
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

module.exports.insertZoomAttendeeItem = (meetingDate, row) => {
  const timestamp = new Date().getTime();
  const params = {
    TableName: 'zoom-attendees-dev',
    Item: {
      id: uuid.v1(),
      duration: row["Total Duration (Minutes)"],
      firstName: row["First Name"],
      name: row["Name (Original Name)"],
      email: row["User Email"],
      meetingDate: meetingDate,
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

module.exports.reloadOfficerData = async () => {
  // await this.clearTable('officer-list-dev');
  await this.readCsvData('ClubOfficerList-District46-20200724.csv', this.insertOfficerListItem);
};

// this.reloadOfficerData().catch(c => console.log(c));

// this.readCsvData('MondayZoom.csv', (args) => this.insertZoomAttendeeItem("2020-07-20", args));
// this.readCsvData('WednesdayZoom.csv', (args) => this.insertZoomAttendeeItem("2020-07-22", args));
// this.readCsvData('FridayZoom.csv', (args) => this.insertZoomAttendeeItem("2020-07-24", args));
// this.readCsvData('SaturdayZoom.csv', (args) => this.insertZoomAttendeeItem("2020-07-25", args));

// const mondayZoomRegs = this.readCsvData('MondayZoom.csv');
// const wednesdayZoomRegs = this.readCsvData('WednesdayZoom.csv');
// const fridayZoomRegs = this.readCsvData('FridayZoom.csv');
// const saturdayZoomRegs = this.readCsvData('SaturdayZoom.csv');

// const confirmedAttendees = Array.prototype.concat(mondayZoomRegs, wednesdayZoomRegs, fridayZoomRegs, saturdayZoomRegs);

// console.log(confirmedAttendees);

module.exports.getInvalidOfficers = async () => {
  // fetch todo from the database
  const result = await dynamoDb.scan({TableName: 'officer-list-dev'}).promise();

  const clubOfficerMap = result.Items.map(o => {
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

  // const attendees = await events.getAttendeesForEvent("110731167904");
  const attendees = await this.getAllAttendees();
  console.log(attendees);
  let counter = 0;
  attendees.forEach(a => {
    const expectedRoles = clubOfficerMap.filter(o => o.email && o.email !== '').find(o => {
      return String.prototype.toLowerCase(o.email) === String.prototype.toLowerCase(a["profile"]["email"]) &&
            o.office === a["role"] &&
            o.clubName === a["clubName"]
    });
    if (expectedRoles) {
      counter++;
      a["officerListConfirmed"] = true;
      console.log('confirming' + a["profile"]["email"]);
    }
  });

  console.log(counter);
  const unconfirmed = attendees.filter(a => !a["officerListConfirmed"]).filter(a => !(a["division"] === 'Outside District 46'));
  console.log(unconfirmed.length);
  console.log(unconfirmed);
};

module.exports.getOfficersWhoNeverRegistered = async () => {
  // fetch todo from the database
  const result = await dynamoDb.scan({TableName: 'officer-list-dev'}).promise();

  const clubOfficerMap = result.Items.map(o => {
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

  const attendees = await this.getAllAttendees();
  
  const unregistered = clubOfficerMap.filter(o => {
    const expectedRoles = attendees.find(a => {
      return String.prototype.toLowerCase(o.email) === String.prototype.toLowerCase(a["profile"]["email"]) &&
            o.office === a["role"] &&
            o.clubName === a["clubName"]
    });
    return !expectedRoles;
  });

  return unregistered;
};

module.exports.writeOfficersWhoNeverRegistered = async () => {
  const data = await this.getOfficersWhoNeverRegistered();
  const ws = fs.createWriteStream("NeverRegisteredOfficers.csv");
  fastcsv
    .write(data, { headers: true })
    .pipe(ws);
};

module.exports.getNoShowOfficers = async () => {
  const zoomAttendees = (await dynamoDb.scan({TableName: 'zoom-attendees-dev'}).promise()).Items;

  let attendees = (await events.getAttendeesForEvent("110731167904"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731189970"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731193982"));
  attendees = Array.prototype.concat(attendees, await events.getAttendeesForEvent("110731204012"));
  const neverCheckedIn = attendees.filter(a => !a["checked_in"])

  const noZoomRecords = neverCheckedIn.filter(a => {
    const zoomRecord = zoomAttendees.filter(o => !o.email && o.email !== '').find(o => {
      return String.prototype.toLowerCase(o.email) === String.prototype.toLowerCase(a["profile"].email)
    });
    if (zoomRecord){
      console.log('Missing Check-in!!' + a["profile"].email);
    }
    return !zoomRecord;
  });
  return noZoomRecords.map(a => {
    return {
      office: a["role"],
      area: a["area"],
      lastName: a["profile"]["last_name"],
      clubName: a["clubName"],
      email: a["profile"]["email"],
      firstName: a["profile"]["first_name"],
      division: a["division"]
    };
  });
};

module.exports.writeNoShowOfficers = async () => {
  const data = await this.getNoShowOfficers();
  const ws = fs.createWriteStream("NoShowOfficers.csv");
  fastcsv
    .write(data, { headers: true })
    .pipe(ws);
};

module.exports.getValidVsInvalidAttendees = async (eventId) => {
  const valid = await events.getValidAttendeesForEvent(eventId);
  console.log(valid.length);
  const all = await events.getAttendeesForEvent(eventId);
  console.log(all.length);
};

module.exports.getMissingCheckins = async (eventId) => {
  const valid = await events.getValidAttendeesForEvent(eventId);

  const notCheckedIn = valid.filter(a => !a["checked_in"]);

  const zoomAttendees = (await dynamoDb.scan({TableName: 'zoom-attendees-dev'}).promise()).Items;
  
  const shouldBeCheckedIn = notCheckedIn.filter(a => {
    let zoomRecord = zoomAttendees.filter(o => o.email && o.email !== '').find(o => {
      let emailMatch = o.email.toLowerCase() === a["profile"].email.toLowerCase();
      let dateMatch = new Date(a["startTime"]).toLocaleDateString() === new Date(o.meetingDate).toLocaleDateString();
      return emailMatch & dateMatch;
    });
    if (zoomRecord){
      console.log('Missing Check-in!!' + a["profile"].email);
    }
    return zoomRecord;
  });

  return shouldBeCheckedIn;
};

// this.readCsvData('TuesdayZoom.csv', (args) => this.insertZoomAttendeeItem("2020-07-28", args));

// this.getValidVsInvalidAttendees("110731218054").catch((err) => {
//   return console.log(err)
// })

// this.getValidVsInvalidAttendees("110731167904").catch((err) => {
//   return console.log(err)
// })

/*
"110731167904" --clean
"110731189970" --clean
"110731193982" --clean
"110731204012" --clean
"110731218054"
"110731222066"
"114842057686"
"114842067716"
*/

module.exports.getClubs = async () => {
  const result = await dynamoDb.scan({TableName: 'officer-list-dev'}).promise();

  const clubOfficerMap = result.Items.map(o => {
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

  let dataByOfficer = {};
  clubOfficerMap.forEach(club => {
      const group = club["clubName"];
      if (!(group in dataByOfficer)) {
          dataByOfficer[group] = {
              "division": club["division"],
              "area": club["area"],
              "clubName": club["clubName"],
              "registered": 0,
              "missing": 7,
              "verified": 0,
              "signuptotal": 7,
              "atleastone": 0,
              "fourormore": 0,
              "allseven": 0
          };
      }
  });

  const invalid = this.getStaticClubData().filter(d => {
    let exists = dataByOfficer[d.clubName];
    exists = exists && dataByOfficer[d.clubName].division === d.division;  
    exists = exists && dataByOfficer[d.clubName].area === d.area;
    return !exists;
  });

  return invalid;
};

module.exports.getStaticClubData = () => {
  return [
      { "division": "A", "area": "11", "clubName": "Hudson River Toastmasters (8558)" },
      { "division": "A", "area": "11", "clubName": "IBM Westchester Toastmasters (648356)" },
      { "division": "A", "area": "11", "clubName": "Peekskill Toastmasters (3171395)" },
      { "division": "A", "area": "11", "clubName": "Northern Westchester Toastmasters (3797112)" },
      { "division": "A", "area": "12", "clubName": "BASF Tarrytown Toastmasters (3638279)" },
      { "division": "A", "area": "12", "clubName": "Regeneron Toastmasters (5829986)" },
      { "division": "A", "area": "12", "clubName": "WSP-BCM Toastmasters (7176388)" },
      { "division": "A", "area": "13", "clubName": "Westchester Toastmasters (863)" },
      { "division": "A", "area": "13", "clubName": "Speakers With Authority (5463)" },
      { "division": "A", "area": "13", "clubName": "United We Stand Toastmasters Club (9938)" },
      { "division": "A", "area": "13", "clubName": "Westchester Advanced Club (695803)" },
      { "division": "A", "area": "14", "clubName": "Cross Westchester Toastmasters (9976)" },
      { "division": "A", "area": "14", "clubName": "PepsiCo Valhalla Toastmasters Club (828089)" },
      { "division": "A", "area": "14", "clubName": "Legends For Life! (889516)" },
      { "division": "A", "area": "15", "clubName": "Pepsico Toastmasters Club (7230)" },
      { "division": "A", "area": "15", "clubName": "Swiss Toast Club (716600)" },
      { "division": "A", "area": "15", "clubName": "Priceless Speakers (1199057)" },
      { "division": "A", "area": "15", "clubName": "The Toast of Purchase (5864849)" },
      { "division": "B", "area": "21", "clubName": "La Voz Latina Toastmasters (1488421)" },
      { "division": "B", "area": "21", "clubName": "Monroe College Toastmasters (2218018)" },
      { "division": "B", "area": "21", "clubName": "Bronx Advanced Speakers (3337790)" },
      { "division": "B", "area": "21", "clubName": "Mount Vernon Toast (5341900)" },
      { "division": "B", "area": "22", "clubName": "Toast Of The Bronx Club (3035)" },
      { "division": "B", "area": "22", "clubName": "Co-op City Toastmasters Club (3824)" },
      { "division": "B", "area": "22", "clubName": "Einstein Toastmasters (1500422)" },
      { "division": "B", "area": "23", "clubName": "Bronx Toastmasters Club (6615)" },
      { "division": "B", "area": "23", "clubName": "MI Toastmasters (1322088)" },
      { "division": "B", "area": "23", "clubName": "Consumer Reports Toastmasters (3640336)" },
      { "division": "B", "area": "23", "clubName": "MIT Toastmasters (6576008)" },
      { "division": "B", "area": "24", "clubName": "TIC Toastmasters Club (2676)" },
      { "division": "B", "area": "24", "clubName": "Harlem Toastmasters (8594)" },
      { "division": "B", "area": "24", "clubName": "TORCH Toastmasters (1168440)" },
      { "division": "B", "area": "24", "clubName": "Columbia University Toastmasters  (3890961)" },
      { "division": "B", "area": "25", "clubName": "Douglas Elliman /west Side Toasties (595443)" },
      { "division": "B", "area": "25", "clubName": "West Side Talkers (1180341)" },
      { "division": "B", "area": "25", "clubName": "DE Squared (5580612)" },
      { "division": "C", "area": "31", "clubName": "Pacers Toastmasters Club (2608)" },
      { "division": "C", "area": "31", "clubName": "AB Toastmasters (1588600)" },
      { "division": "C", "area": "31", "clubName": "g-Toastmasters (5589856)" },
      { "division": "C", "area": "31", "clubName": "Macquarie New York (7291924)" },
      { "division": "C", "area": "32", "clubName": "Ringers Toastmasters Club (7890)" },
      { "division": "C", "area": "32", "clubName": "Excellent Toastmasters (1410471)" },
      { "division": "C", "area": "32", "clubName": "BNP Paribas Toastmasters (3332242)" },
      { "division": "C", "area": "32", "clubName": "French/Bilingual Toastmasters of NY (7315453)" },
      { "division": "C", "area": "33", "clubName": "Leadership Roundtable  (1636)" },
      { "division": "C", "area": "33", "clubName": "Bryant Park Toastmasters Club (2895)" },
      { "division": "C", "area": "33", "clubName": "CFA NY Toastmasters (965817)" },
      { "division": "C", "area": "33", "clubName": "Barclays New York Toastmasters (5418945)" },
      { "division": "C", "area": "34", "clubName": "SEC Roughriders Club (1876)" },
      { "division": "C", "area": "34", "clubName": "Traffic Club (2286)" },
      { "division": "C", "area": "34", "clubName": "Mazars USA LLP (1166775)" },
      { "division": "C", "area": "34", "clubName": "Marsh McLennan Companies NY (2078496)" },
      { "division": "C", "area": "35", "clubName": "Deloitte Tri-State Toastmasters  (1244840)" },
      { "division": "C", "area": "35", "clubName": "Midtown's Best @ Morgan Stanley (1700500)" },
      { "division": "C", "area": "35", "clubName": "The Big Toast NYC (7419138)" },
      { "division": "C", "area": "36", "clubName": "BlackRock Speaks NY (2884725)" },
      { "division": "C", "area": "36", "clubName": "The World's Leading Toastmasters (4315364)" },
      { "division": "C", "area": "36", "clubName": "Speak Up Swiss Re (6547516)" },
      { "division": "C", "area": "36", "clubName": "Dewan Shai (7376563)" },
      { "division": "D", "area": "41", "clubName": "Knickerbocker Toastmasters Club (137)" },
      { "division": "D", "area": "41", "clubName": "Roosevelt Island Club (4121)" },
      { "division": "D", "area": "41", "clubName": "East Side Toastmasters Club (6138)" },
      { "division": "D", "area": "41", "clubName": "Yorkville Evening Stars - YES (5425506)" },
      { "division": "D", "area": "41", "clubName": "New York Storytellers (6606660)" },
      { "division": "D", "area": "42", "clubName": "Humorous Toastmasters (1296797)" },
      { "division": "D", "area": "42", "clubName": "730 Toastmasters (1387307)" },
      { "division": "D", "area": "42", "clubName": "Bloomberg New York Toastmasters (3618250)" },
      { "division": "D", "area": "42", "clubName": "Gotham Speakers Toastmasters Club (3966637)" },
      { "division": "D", "area": "42", "clubName": "Geller and Company (7708987)" },
      { "division": "D", "area": "43", "clubName": "JPMorgan Toastmasters NYC (3793452)" },
      { "division": "D", "area": "43", "clubName": "KPMG NYO Toastmasters Club (4405755)" },
      { "division": "D", "area": "43", "clubName": "Wafra Toastmasters (6931829)" },
      { "division": "D", "area": "43", "clubName": "TD NYC Toastmasters Club (7702911)" },
      { "division": "D", "area": "44", "clubName": "Mount Sinai Toastmasters (1023495)" },
      { "division": "D", "area": "44", "clubName": "Metnyc (1213823)" },
      { "division": "D", "area": "44", "clubName": "Stagecoach Speakers, NYC (4748139)" },
      { "division": "D", "area": "44", "clubName": "Societe Generale Toastmasters, USA (6765848)" },
      { "division": "D", "area": "45", "clubName": "Nichibei Toastmasters Club (6394)" },
      { "division": "D", "area": "45", "clubName": "World Voices Club (643436)" },
      { "division": "D", "area": "45", "clubName": "Advanced Debaters (3313240)" },
      { "division": "D", "area": "45", "clubName": "Persuasive Toastmasters (4634928)" },
      { "division": "D", "area": "45", "clubName": "Toastmasters International Club - Elsevier NYC (6660424)" },
      { "division": "D", "area": "46", "clubName": "Global Expression Club (5596)" },
      { "division": "D", "area": "46", "clubName": "Pfree Speech Toastmasters Club (7883)" },
      { "division": "D", "area": "46", "clubName": "Travelers NYC (3433011)" },
      { "division": "D", "area": "46", "clubName": "A+E Networks NYC (6501985)" },
      { "division": "D", "area": "46", "clubName": "Speaking Easy (7560123)" },
      { "division": "E", "area": "51", "clubName": "Voices of Bank America Club (5328)" },
      { "division": "E", "area": "51", "clubName": "Times Toastmasters (1548645)" },
      { "division": "E", "area": "51", "clubName": "Legg Mason Toastmasters - NY Chapter (5821058)" },
      { "division": "E", "area": "52", "clubName": "EY NYC Toastmasters (2560548)" },
      { "division": "E", "area": "52", "clubName": "Toastmasters NYC Microsoft (6021925)" },
      { "division": "E", "area": "53", "clubName": "Greenspeakers Club (3172)" },
      { "division": "E", "area": "53", "clubName": "NYC Equitable Toastmasters Club (3507)" },
      { "division": "E", "area": "53", "clubName": "Amazon NYC Toastmasters Club (7226903)" },
      { "division": "E", "area": "54", "clubName": "Vanderbilt Club (3061)" },
      { "division": "E", "area": "54", "clubName": "Lexington Toastmasters (1254058)" },
      { "division": "E", "area": "54", "clubName": "Jade Toastmasters Club (1721565)" },
      { "division": "E", "area": "54", "clubName": "Midtown Masters (4672690)" },
      { "division": "E", "area": "55", "clubName": "Extraordinary Talkers (735)" },
      { "division": "E", "area": "55", "clubName": "FactMasters (1526129)" },
      { "division": "E", "area": "55", "clubName": "Toastmasters @ MSK (1551020)" },
      { "division": "E", "area": "56", "clubName": "Metro New York (451)" },
      { "division": "E", "area": "56", "clubName": "Graybar Club (1436)" },
      { "division": "E", "area": "56", "clubName": "New York Toastmasters Club (1949)" },
      { "division": "E", "area": "56", "clubName": "Girl Scouts of the USA (7202219)" },
  ];
};

module.exports.processClubOfficerData = (row) => {
  const office = row["Office"];
  const clubName = row["Club Name"];
  if (office === "VicePresidentMembership") {row["Office"] = "Vice President of Membership" }
  if (office === "VicePresidentEducation") {row["Office"] = "Vice President of Education" }
  if (office === "VicePresidentPublicRelations") {row["Office"] = "Vice President of PR" }
  if (office === "SergeantAtArms") {row["Office"] = "Sergeant at Arms" }
  row["Club Name"] = clubName + " (" + row["Club ID"] + ")"

  const timestamp = new Date().getTime();
  const params = {
    TableName: 'officer-list-dev',
    Item: {
      id: uuid.v1(),
      division: row["Division"],
      area: row["Area"],
      clubName: row["Club Name"],
      firstName: row["First Name"],
      lastName: row["Last Name"],
      email: row["Email Address"],
      office: row["Office"],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };

  console.log(params);
};

// this.readCsvData('ClubOfficerList-v2.20200806.csv', (args) => this.processClubOfficerData(args)).catch((err) => {
//   return console.log(err)
// })

module.exports.grabStuff = async () => {
  const requestOptions = {
    method: 'GET',
    // headers: { 'Content-Type': 'application/json' },
    // body: JSON.stringify({ title: 'React Hooks POST Request Example' })
  };
  const csvData = [];
  const response = await fetch('http://dashboards.toastmasters.org/export.aspx?type=CSV&report=clubperformance~46~8/31/2020~~2020-2021', requestOptions)
      .catch((e) => console.log(e));    
  const text = await response.text();
  const records = await parse(text, {columns:true, skip_lines_with_error:true, delimiter:',', ltrim:true, rtrim:true});
  console.log(records);

  
//   .on('data', function(csvrow) {
//     csvData.push(csvrow);
//     console.log(csvrow);
//   })
//   .on('error', function(csvrow) {
//     console.log('ERROR');
//     console.log(csvrow);
//   })
//   .on('end',function() {
//     //do something with csvData
//     console.log(csvData);
//   });
// return csvData;
};

this.grabStuff().catch((err) => {
    return console.log(err)
});