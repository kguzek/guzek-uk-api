import express, { Response } from "express";
import { UserShows } from "guzek-uk-common/sequelize";
import { CustomRequest } from "guzek-uk-common/models";
import {
  createDatabaseEntry,
  readAllDatabaseEntries,
  sendError,
  sendOK,
  updateDatabaseEntry,
  validateNaturalNumber,
} from "guzek-uk-common/util";
import { getUserShows } from "../../liveseries";

export const router = express.Router();

async function modifyUserShows(
  req: CustomRequest,
  res: Response,
  add: boolean,
  liked: boolean
) {
  const showId = +req.params.showId;
  const errorMessage = validateNaturalNumber(showId);
  if (errorMessage) return sendError(res, 400, { message: errorMessage });
  const userUUID = req.user?.uuid;
  const { likedShows, subscribedShows } = await getUserShows(userUUID);
  if (likedShows == null || subscribedShows == null) {
    const success = await createDatabaseEntry(
      UserShows,
      { userUUID, likedShows: [], subscribedShows: [] },
      res
    );
    if (!success) return;
  }
  const collection = (liked ? likedShows : subscribedShows) ?? [];
  // Trying to add if already present, or trying to remove if not present
  if (add === collection.includes(showId)) {
    return sendError(res, 409, {
      message: `Show with id '${showId}' is ${add ? "already" : "not"} ${
        liked ? "liked" : "subscribed"
      }.`,
    });
  }
  const key = liked ? "likedShows" : "subscribedShows";
  await updateDatabaseEntry(
    UserShows,
    req,
    res,
    {
      [key]: add
        ? [...collection, showId]
        : collection.filter((id) => id !== showId),
    },
    { userUUID: req.user?.uuid }
  );
}

// GET all users' liked & subscribed TV shows
router.get("/shows", (_req, res) => readAllDatabaseEntries(UserShows, res));

// GET own liked & subscribed TV shows
router.get("/shows/personal", async (req: CustomRequest, res) => {
  const uuid = req.user?.uuid;
  const { likedShows, subscribedShows } = await getUserShows(uuid);
  sendOK(res, {
    likedShows: likedShows ?? [],
    subscribedShows: subscribedShows ?? [],
  });
});

// ADD liked TV show
router.post("/shows/personal/liked/:showId", (req, res) =>
  modifyUserShows(req, res, true, true)
);

// DELETE liked TV show
router.delete("/shows/personal/liked/:showId", (req, res) =>
  modifyUserShows(req, res, false, true)
);

// ADD subscribed TV show
router.post("/shows/personal/subscribed/:showId", (req, res) =>
  modifyUserShows(req, res, true, false)
);

// DELETE subscribed TV show
router.delete("/shows/personal/subscribed/:showId", (req, res) =>
  modifyUserShows(req, res, false, false)
);
