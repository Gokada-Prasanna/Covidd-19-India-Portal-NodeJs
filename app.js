const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDatabaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDatabaseAndServer();

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authentication(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authentication, async (request, response) => {
  const getStatesQuery = `
    SELECT * FROM state 
    ORDER BY state_id;
    `;

  const statesQueryResponse = await db.all(getStatesQuery);
  response.send(
    statesQueryResponse.map((eachItem) =>
      convertStateDbObjectToResponseObject(eachItem)
    )
  );
});

app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
SELECT * FROM state 
WHERE state_id = '${stateId}';
`;
  const stateQueryResponse = await db.get(getStateQuery);
  response.send(convertStateDbObjectToResponseObject(stateQueryResponse));
});

app.post("/districts/", authentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
    INSERT INTO 
      district (district_name, state_id, cases, cured, active, deaths) 
    VALUES 
      (
        '${districtName}', 
        '${stateId}',
        '${cases}', 
        '${cured}',
        '${active}',
        '${deaths}'
       )`;
  await db.run(createDistrictQuery);
  response.send(`District Successfully Added`);
});

app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
SELECT * FROM district 
WHERE district_id='${districtId}';
`;

    const queryResponse = await db.get(getDistrictQuery);
    response.send(convertDistrictDbObjectToResponseObject(queryResponse));
  }
);

app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
DELETE FROM district WHERE district_id='${districtId}';
`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put("/districts/:districtId", authentication, async (request, response) => {
  const { districtId } = request.params;
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const updateDistrictQuery = `
UPDATE 
district 
SET district_name = 
'${districtName}',
state_id = '${stateId}',
cases = '${cases}',
cured = '${cured}',
active = '${active}',
deaths = '${deaths}'
WHERE district_id = '${districtId}';
`;

  await db.run(updateDistrictQuery);
  response.send("District Details Updated");
});

app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateByIDStatsQuery = `
    SELECT
      sum(cases) as totalCases,
      sum(cured) as totalCured,
      sum(active) as totalActive,
      sum(deaths) as totalDeaths
    FROM
      district 
    WHERE
      state_id = ${stateId};`;
    const getStateByIDStatsQueryResponse = await db.get(getStateByIDStatsQuery);
    response.send(getStateByIDStatsQueryResponse);
  }
);

module.exports = app;
