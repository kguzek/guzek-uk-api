import express from "express";
import { Updated } from "guzek-uk-common/sequelize";
import { readAllDatabaseEntries, sendOK } from "guzek-uk-common/util";
export const router = express.Router();

const ENDPOINTS: { [endpoint: string]: number } = {};
const IGNORED_ENDPOINTS = ["updated"];

export function init(endpoints: string[]) {
  for (const endpoint of endpoints) {
    if (IGNORED_ENDPOINTS.includes(endpoint)) continue;
    ENDPOINTS[endpoint.split("/").at(-1) ?? endpoint] = 0;
  }
}

/** Returns the data from the database, including default data for non-included databases. */
const processData = (data: Updated[]) => ({
  ...ENDPOINTS,
  ...Object.fromEntries(
    data.map((model) => [
      (model.get("endpoint") as string)
        .replace(/_/, "-")
        .replace("user-shows", "shows"),
      model.get("timestamp"),
    ])
  ),
});

router.get("/", (_req, res) =>
  readAllDatabaseEntries(Updated, res, (data) => {
    res.setHeader("Cache-Control", "no-store");
    sendOK(res, processData(data));
  })
);
