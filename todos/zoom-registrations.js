"use strict";

const AWS = require("aws-sdk"); // eslint-disable-line import/no-extraneous-dependencies
const fetch = require("node-fetch");
const FormData = require("form-data");
const redis = require("async-redis");
const moment = require("moment");
const access_token_key = "access_token";
const refresh_token_key = "refresh_token";
const flatten = require("flat").flatten;

const ssm = new AWS.SSM({ region: "us-east-1" });
const getSecret = async (key) => {
  const secret = await ssm
    .getParameter(
      {
        Name: "/zoom/" + key,
        WithDecryption: true,
      },
      function (err, data) {
        if (err) {
          console.log(err);
        } else {
          console.log(data);
        }
      }
    )
    .promise();
  return secret["Parameter"]["Value"];
};
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "us-east-1" });

module.exports.getRefreshTokenPayload = async (refreshToken) => {
  const authPayload = {
    client_id: await getSecret("clientid"),
    client_secret: await getSecret("clientsecret"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  const form = new FormData();
  form.append("client_id", authPayload.client_id);
  form.append("client_secret", authPayload.client_secret);
  form.append("grant_type", authPayload.grant_type);
  form.append("refresh_token", authPayload.refresh_token);
  return form;
};

module.exports.generateAccessToken = async (refreshToken) => {
  console.log("generateAccessToken");
  const form = await this.getRefreshTokenPayload(refreshToken);
  const tokenResponse = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  const json = await tokenResponse.json();
  if (json) {
    return json;
  }
  return null;
};

module.exports.getToken = async () => {
  console.log("getToken");
  const host = await getSecret("redishost");
  const port = await getSecret("redisport");
  const password = await getSecret("redispassword");
  const client = redis.createClient({
    host: host,
    port: port,
    password: password,
  });
  client.on("error", function (err) {
    console.log("redis", err);
    throw err;
  });

  const token = await client.get(access_token_key);
  if (!token || token == "undefined") {
    const refresh_token = await client.get(refresh_token_key);
    const refreshed_auth_payload = await this.generateAccessToken(
      refresh_token
    );
    await client.set(access_token_key, refreshed_auth_payload.access_token);
    await client.set(refresh_token_key, refreshed_auth_payload.refresh_token);
    var expiry = moment(new Date()).add(50, "minutes").unix();
    await client.expireat(access_token_key, expiry);
    return refreshed_auth_payload.access_token;
  }
  return token;
};

module.exports.getAuthHeader = async () => {
  console.log("getAuthHeader");
  const token = await this.getToken();
  const headers = {
    Authorization: "Bearer " + token,
  };
  return headers;
};

module.exports.getRawMeetingData = async (meeting) => {
  console.log("getRawMeetingData");
  const authHeaders = await this.getAuthHeader();
  console.log("zoom-api");
  const meetingApiResponse = await fetch(
    "https://api.zoom.us/v2/meetings/" + meeting + "/registrants",
    {
      headers: authHeaders,
      method: "GET",
    }
  );
  console.log(meetingApiResponse);
  const output = await meetingApiResponse.json();

  let json = output.registrants;
  let continuation = output.next_page_token;
  while (continuation) {
    const innerResult = await fetch(
      "https://api.zoom.us/v2/meetings/" +
        meeting +
        "/registrants?next_page_token=" +
        continuation,
      {
        headers: authHeaders,
        method: "GET",
      }
    );
    const innerData = await innerResult.json();
    innerData.registrants.forEach((r) => json.push(r));
    continuation = innerData.next_page_token;
  }

  return json;
};

module.exports.getMeetingData = async (meeting) => {
  console.log("getMeetingData");

  const output = await this.getRawMeetingData(meeting);
  const officialClubOfficers = await dynamoDb
    .scan({ TableName: "toastmasters" })
    .promise();
  if (!officialClubOfficers.Items) {
    return [];
  }

  const isSameOffice = (selectedValue, office) => {
    if (selectedValue == "Vice President of Education") {
      return office == "VicePresidentEducation";
    }
    if (selectedValue == "Vice President of Membership") {
      return office == "VicePresidentMembership";
    }
    if (selectedValue == "Vice President of PR") {
      return office == "VicePresidentPublicRelations";
    }
    if (selectedValue == "Sergeant at Arms") {
      return office == "SergeantAtArms";
    }
    return selectedValue == office;
  };

  const result = officialClubOfficers.Items.filter((a) => {
    return output.find(
      (registrant) =>
        parseInt(registrant["custom_questions"][0].value, 10) ==
          parseInt(a.memberId, 10) &&
        isSameOffice(registrant["custom_questions"][1].value, a.office)
    );
  });
  const sanitizedResult = result.map((r) => {
    let rObj = {};
    rObj["clubId"] = r.clubId;
    rObj["clubName"] = r.clubName;
    rObj["firstName"] = r.firstName.substring(0, 1);
    rObj["lastName"] = r.lastName.substring(0, 1);
    rObj["memberId"] = r.memberId;
    rObj["office"] = r.office;
    rObj["division"] = r.division;
    rObj["area"] = r.area;
    return rObj;
  });
  return sanitizedResult;
};

module.exports.get = async (event, context, callback) => {
  const eventId = event.pathParameters.id;
  context.callbackWaitsForEmptyEventLoop = false;
  const results = await this.getMeetingData(eventId);
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

module.exports.syncRegistrations = async (registrationData, eventId) => {
  const createAttendeeRecord = (reg) => {
    const timestamp = new Date().getTime();
    const params = {
      TableName: "attendee",
      Item: {
        id: parseInt(reg.memberId, 10) + "-" + parseInt(reg.clubId, 10) + "-" + reg.office,
        eventId: eventId,
        registered: true,
        attended: false,
        clubId: reg.clubId,
        clubName: reg.clubName,
        firstName: reg.firstName,
        lastName: reg.lastName,
        division: reg.division,
        area: reg.area,
        officer: reg.office,
        memberId: reg.memberId,
        notes: "automated",
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
  };

  const upsertAttendeeRecord = (reg) => {
    const params = {
      TableName: "attendee",
      Key: {
        id: parseInt(reg.memberId, 10) + "-" + parseInt(reg.clubId, 10) + "-" + reg.office,
      },
    };

    // fetch todo from the database
    const found = dynamoDb.get(params, (error, result) => {
      // handle potential errors
      if (error) {
        console.error(error);
        return;
      }
      if (result.Item && result.Item.id) {
        return;
      }
      createAttendeeRecord(reg);
    });
  };

  registrationData.forEach((reg) => {
    upsertAttendeeRecord(reg);
  });
  console.log("insert complete");
};

module.exports.create = async (event, context, callback) => {
  const eventId = event.pathParameters.id;
  context.callbackWaitsForEmptyEventLoop = false;
  const results = await this.getMeetingData(eventId);
  await this.syncRegistrations(results, eventId);
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

module.exports.getFullRegistrations = async (meeting) => {
  console.log("getFullRegistrations");

  const output = await this.getRawMeetingData(meeting);
  const officialClubOfficers = await dynamoDb
    .scan({ TableName: "toastmasters" })
    .promise();
  if (!officialClubOfficers.Items) {
    return [];
  }

  const isSameOffice = (selectedValue, office) => {
    if (selectedValue == "Vice President of Education") {
      return office == "VicePresidentEducation";
    }
    if (selectedValue == "Vice President of Membership") {
      return office == "VicePresidentMembership";
    }
    if (selectedValue == "Vice President of PR") {
      return office == "VicePresidentPublicRelations";
    }
    if (selectedValue == "Sergeant at Arms") {
      return office == "SergeantAtArms";
    }
    return selectedValue == office;
  };

  const extendedResult = output.flatMap((r) => {
    r.zoomEmail = r.email;
    const entries = officialClubOfficers.Items.filter(
      (a) =>
        parseInt(r["custom_questions"][0].value, 10) ==
          parseInt(a.memberId, 10) &&
        isSameOffice(r["custom_questions"][1].value, a.office)
    );
    if (entries && entries.length > 0) {
      const bigArray = entries.map((entry) => {
        const zoomEmail = r.zoomEmail;
        const output = Object.assign(entry, r);
        output.zoomEmail = zoomEmail;
        return output;
      });
      bigArray.length;
      return bigArray;
    }
    return r;
  });
  return extendedResult;
};

module.exports.exportFullRegistrations = async (event, context, callback) => {
  const eventId = event.pathParameters.id;
  context.callbackWaitsForEmptyEventLoop = false;
  const results = await this.getFullRegistrations(eventId);
  const output = results.map((r) => {
    const constructed = Object.create({});
    constructed["first_name"] = r.first_name;
    constructed["last_name"] = r.last_name;
    constructed["email"] = r.zoomEmail;
    constructed["Enterered Member Id"] = r["custom_questions"][0].value;
    constructed["Role"] = r["custom_questions"][1].value;
    constructed["Out of District Note"] = r["custom_questions"][2].value;
    constructed["Registration Notes"] = r["custom_questions"][3].value;
    constructed["ClubName"] = r.clubName;
    constructed["Pathways Enrolled"] = r.pathwaysEnrolled;
    return constructed;
  });
  callback(output);
};

module.exports.exportBreakoutRooms = async (event, context, callback) => {
  const eventId = event.pathParameters.id;
  context.callbackWaitsForEmptyEventLoop = false;
  const results = await this.getFullRegistrations(eventId);
  const output = results.map((r) => {
    const constructed = Object.create({});
    constructed["Pre-assign Room Name"] = r["custom_questions"][1].value;
    constructed["Email Address"] = r.email;
    return constructed;
  });
  callback(output);
};

module.exports.getRawMeetingDetailReport = async (meeting) => {
  console.log("getRawMeetingData");
  const authHeaders = await this.getAuthHeader();
  console.log("zoom-api");
  const meetingApiResponse = await fetch(
    "https://api.zoom.us/v2/report/meetings/" + meeting,
    {
      headers: authHeaders,
      method: "GET",
    }
  );
  console.log(meetingApiResponse);
  const output = await meetingApiResponse.json();
  return output;
};

module.exports.enrichMeetingDetailReport = async (meeting, reportingData) => {
  console.log("enrichMeetingDetailReport");

  const output = await this.getFullRegistrations(meeting);

  const enrichedOutput = reportingData.map((r) => {
    const inner = output.filter(
      (a) => a.zoomEmail.toLowerCase() === r["User Email"].toLowerCase()
    );
    r.inner = inner;
    r.clubName = inner.map((i) => i.clubName).join(",");
    r["Found Officer Roles"] = inner.map((i) => i.office).join(",");
    r.office = "";
    r["Enterered Member Id"] = "";
    r["Role"] = "";
    r["Out of District Note"] = "";
    r["Registration Notes"] = "";
    if (inner[0]) {
      r.office = inner[0]["custom_questions"][1].value;
      r["Enterered Member Id"] = inner[0]["custom_questions"][0].value;
      r["Role"] = inner[0]["custom_questions"][1].value;
      r["Out of District Note"] = inner[0]["custom_questions"][2].value;
      r["Registration Notes"] = inner[0]["custom_questions"][3].value;
    }
    return r;
  });
  return enrichedOutput;
};

module.exports.importPostMeetingAttendees = async (
  event,
  reportingData,
  callback
) => {
  const eventId = event.pathParameters.id;
  const results = await this.enrichMeetingDetailReport(eventId, reportingData);
  await this.syncAttendance(results, eventId);
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

module.exports.syncAttendance = async (registrationData, eventId) => {
  const createAttendeeRecord = (inner) => {
    const timestamp = new Date().getTime();
    const params = {
      TableName: "verified",
      Item: {
        id: parseInt(inner.clubId, 10) + "-" + inner.office,
        eventId: eventId,
        inner: inner,
        notes: "automated",
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
  };

  const upsertAttendeeRecord = (reg) => {
    if (!reg.inner || reg.inner.length == 0) {
      console.log("skipped", reg);
      return;
    }
    reg.inner.forEach((innerElement) => {
      const params = {
        TableName: "verified",
        Key: {
          id: parseInt(innerElement.clubId, 10) + "-" + innerElement.office,
        },
      };

      // fetch todo from the database
      const found = dynamoDb.get(params, (error, result) => {
        // handle potential errors
        if (error) {
          console.error(error);
          return;
        }
        if (result.Item && result.Item.id) {
          return;
        }
        createAttendeeRecord(innerElement);
      });
    });
  };

  registrationData.forEach((reg) => {
    upsertAttendeeRecord(reg);
  });
  console.log("insert complete");
};
