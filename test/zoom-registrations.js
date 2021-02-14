"use strict";

const zoom = require("../todos/zoom-registrations");

const sync = async () => {
  // await zoom.create({pathParameters: { id: 99851275316}}, {}, console.log);
  // await zoom.create({pathParameters: { id: 99632810126}}, {}, console.log);
  // await zoom.create({pathParameters: { id: 99669431236}}, {}, console.log);
  // await zoom.create({pathParameters: { id: 99072824214}}, {}, console.log);
  // await zoom.create({pathParameters: { id: 99493136749}}, {}, console.log);
  // await zoom.create({pathParameters: { id: 93768989390}}, {}, console.log);
  await zoom.create({pathParameters: { id: 92576775808}}, {}, console.log);
}

const fastcsv = require('fast-csv');
const fs = require('fs'); 
const makeIntoCsv = (fileName) => (data) => {
  const ws = fs.createWriteStream(fileName);
  fastcsv
    .write(data, { headers: true})
    .pipe(ws);
}

const parse = require('csv-parse');
const readCsvData = async (filePath) => {
  return new Promise(async (resolve, reject) => {
    const results = [];
    const parseStream = parse({columns:true, delimiter:',', ltrim:true, rtrim:true});
    await fs.createReadStream(filePath).pipe(parseStream).on('data', function(csvrow) {
      results.push(csvrow);
    }).on('end',function() {
      //do something with csvData
      resolve(results);
    });
  });
};

const exportFullRegistrations = async (eventId) => {
  await zoom.exportFullRegistrations({pathParameters: { id: eventId}}, {}, makeIntoCsv("RegistrationEntries-" + eventId +".csv"));
}

const exportBreakoutRooms = async (eventId) => {
  await zoom.exportBreakoutRooms({pathParameters: { id: eventId}}, {}, makeIntoCsv("BreakoutRooms-" + eventId +".csv"));
}

const exportPostMeetingReport = async (eventId) => {
  const load = async (results) => {
    const enrichedOutput = await zoom.enrichMeetingDetailReport(
      eventId,
      results);
    const action = makeIntoCsv("EmailAlert.csv");
    await action(enrichedOutput);
  }
  var result = await readCsvData('participants_' + eventId + '.csv');
  await load(result);
}

const runPostMeetingSync = async (eventId) => {
  const load = (results) => {
    zoom.importPostMeetingAttendees({pathParameters: { id: eventId}}, results, console.log);
  }
  var result = await readCsvData('participants_' + eventId + '.csv');
  load(result);
}

const exportFullRegistrationsForAll = async () => {
  var fullList = [];
  await zoom.exportFullRegistrations({pathParameters: { id: 99851275316}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  await zoom.exportFullRegistrations({pathParameters: { id: 99632810126}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  await zoom.exportFullRegistrations({pathParameters: { id: 99669431236}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  await zoom.exportFullRegistrations({pathParameters: { id: 99072824214}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  await zoom.exportFullRegistrations({pathParameters: { id: 99493136749}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  await zoom.exportFullRegistrations({pathParameters: { id: 93768989390}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  await zoom.exportFullRegistrations({pathParameters: { id: 92576775808}}, {}, (d) => d.forEach((r) => fullList.push(r)));
  const fun = makeIntoCsv("RegistrationEntries-Full.csv")
  fun(fullList);
}

const exportPostMeetingReportForAll = async () => {
  const fullList = [];
  const load = async (eventId, fullList, results) => {
    const enrichedOutput = await zoom.enrichMeetingDetailReport(
      eventId,
      results);
    enrichedOutput.forEach((r) => fullList.push(r));
    return fullList;
  }

  const parseData = async (eventId) => {
    const yes = await readCsvData('participants_' + eventId + '.csv');
    await load(eventId, fullList, yes);
  }
  // await parseData(99851275316);
  await parseData(99632810126);
  await parseData(99669431236);
  await parseData(99072824214);
  await parseData(99493136749);
  await parseData(93768989390);
  await parseData(92576775808);

  const action = makeIntoCsv("FullDataSet.csv");
  await action(fullList);
}
// manualSetToken();

// Saturday
// exportFullRegistrations(99072824214);
// runPostMeetingSync(99851275316);

// Friday Noon
// exportFullRegistrations(99632810126);
//runPostMeetingSync(99632810126);
// exportPostMeetingReport(99632810126)

//Monday
//exportFullRegistrations(99669431236);
// exportBreakoutRooms(99669431236);
// runPostMeetingSync(99669431236);
// exportPostMeetingReport(99669431236)

//Thursday
//exportFullRegistrations(99072824214);
//exportBreakoutRooms(99072824214);
//runPostMeetingSync(99072824214);
//exportPostMeetingReport(99072824214);

// manualSetToken();
//exportPostMeetingReportForAll()

// Tuesday Jan 26th
// exportFullRegistrations(99493136749);
// exportBreakoutRooms(99493136749);
// runPostMeetingSync(99493136749);
// exportPostMeetingReport(99493136749);


// Monday Feb 8th
// exportFullRegistrations(93768989390);
// exportBreakoutRooms(93768989390);
// runPostMeetingSync(93768989390);
// exportPostMeetingReport(93768989390);

// Friday Feb 12th
// sync().then(() => exportFullRegistrations(92576775808)).then(() => exportBreakoutRooms(92576775808));
// manualSetToken();
//runPostMeetingSync(92576775808)
// exportPostMeetingReport(92576775808);

exportPostMeetingReportForAll()