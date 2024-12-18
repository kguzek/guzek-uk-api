import express from "express";
import { WatchedEpisodes } from "guzek-uk-common/sequelize";
import { CustomRequest } from "guzek-uk-common/models";
import {
  createDatabaseEntry,
  queryDatabase,
  readAllDatabaseEntries,
  sendError,
  sendOK,
  updateDatabaseEntry,
  validateNaturalList,
  validateNaturalNumber,
} from "guzek-uk-common/util";
import { WatchedShowData } from "guzek-uk-common/models";

export const router = express.Router();

// GET all users' watched episodes
router.get("/watched-episodes", (_req, res) =>
  readAllDatabaseEntries(WatchedEpisodes, res)
);

// GET own watched episodes
router.get("/watched-episodes/personal", async (req: CustomRequest, res) => {
  const watchedEpisodes = await queryDatabase(
    WatchedEpisodes,
    { where: { userUUID: req.user?.uuid } },
    res,
    true
  );
  if (!watchedEpisodes) return;
  const watchedData =
    (watchedEpisodes[0]?.get("watchedEpisodes") as WatchedShowData) ?? {};
  sendOK(res, watchedData);
});

// UPDATE own watched episodes
router.put(
  "/watched-episodes/personal/:showId/:season",
  async (req: CustomRequest, res) => {
    const showId = +req.params.showId;
    const season = +req.params.season;
    const errorMessage =
      validateNaturalNumber(showId) ?? validateNaturalNumber(season);
    if (errorMessage) return sendError(res, 400, { message: errorMessage });
    if (!validateNaturalList(req.body, res)) return;
    const where = { userUUID: req.user?.uuid };
    const storedModel = await queryDatabase(
      WatchedEpisodes,
      { where },
      res,
      true
    );
    if (!storedModel) return;
    if (storedModel.length === 0) {
      await createDatabaseEntry(
        WatchedEpisodes,
        {
          ...where,
          watchedEpisodes: { [showId]: { [season]: req.body } },
        },
        res
      );
      return;
    }
    const storedData = storedModel[0].get("watchedEpisodes") as WatchedShowData;
    const watchedEpisodes = {
      ...storedData,
      [showId]: { ...storedData[showId], [season]: req.body },
    };
    updateDatabaseEntry(WatchedEpisodes, req, res, { watchedEpisodes }, where);
  }
);
