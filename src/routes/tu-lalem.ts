import express from "express";
import { Op } from "sequelize";
import { TuLalem } from "guzek-uk-common/lib/sequelize";
import {
  createDatabaseEntry,
  readAllDatabaseEntries,
} from "guzek-uk-common/lib/rest";
import { sendError, sendOK } from "guzek-uk-common/lib/http";
import { getDistanceBetweenTwoPoints } from "guzek-uk-common/lib/maths";
import { CustomRequest, LatLngArray } from "guzek-uk-common/models";
export const router = express.Router();

/** The minimum distance a point has to be apart from all other points on the map. */
const MIN_POINT_DISTANCE_KM = 0.1; // 100 metres

/** The number of milliseconds that need to be waited before a new entry can be made.*/
const MIN_WAIT_TIME_MS = 10 * 60 * 1000; // 10 minutes

/** Ensures that the coordinates are not to close to any previous entries.
 *  Returns an error message or `null` if the coordinates are valid.
 */
async function validateCoordinates(coords?: number[], userUuid?: string) {
  if (!coords) return "Coordinates not provided.";
  if (coords.length !== 2)
    return "Coordinates must have a latitude and longitude.";
  if (!userUuid) return "User not logged in.";

  const entries = await TuLalem.findAll({
    where: { userUuid },
  });
  let cooldownMillis = 0;
  for (const entry of entries) {
    const testCoords = entry.get("coordinates") as LatLngArray;
    const distance = getDistanceBetweenTwoPoints(
      coords as LatLngArray,
      testCoords
    );
    if (distance < MIN_POINT_DISTANCE_KM) {
      return "You are too close to a previous entry.";
    }
    const timestamp = entry.get("timestamp") as Date;
    const currentCooldownMillis =
      timestamp.getTime() + MIN_WAIT_TIME_MS - new Date().getTime();
    if (currentCooldownMillis > cooldownMillis) {
      cooldownMillis = currentCooldownMillis;
    }
  }
  // if (cooldownMillis > 0) {
  //   return `You must wait ${cooldownMillis / 1000}s before you can do that.`;
  // }

  return null;
}

router
  // POST new coordinates
  .post("/", async (req: CustomRequest, res) => {
    const coords = req.body.coordinates;
    const errorMessage = await validateCoordinates(coords, req.user?.uuid);
    if (errorMessage) {
      return sendError(res, 400, { message: errorMessage });
    }

    const [lat, lng] = req.body.coordinates;

    const modelParams = {
      coordinates: {
        type: "Point",
        coordinates: [lng, lat],
      },
      userUuid: req.user?.uuid,
    };
    await createDatabaseEntry(TuLalem, modelParams, res);
  })

  // GET all coordinates
  .get("/", async (req, res) => {
    const userUuid = req.query.user;
    if (!userUuid) {
      // GET coordinates of all users
      await readAllDatabaseEntries(TuLalem, res);
      return;
    }

    // GET the last entry made in the last 10 mins by given user
    const timespanMillis = req.query.timespan
      ? +req.query.timespan * 60_000
      : MIN_WAIT_TIME_MS;
    const fromTimestamp = new Date().getTime() - timespanMillis;

    let result;
    try {
      result = await TuLalem.findOne({
        where: {
          userUuid,
          timestamp: { [Op.gte]: fromTimestamp },
        },
        order: [["timestamp", "DESC"]],
      });
    } catch (error) {
      return sendError(res, 500, error as Error);
    }
    sendOK(res, result);
  });
