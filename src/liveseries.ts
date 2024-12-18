import express from "express";
import { getLogger } from "guzek-uk-common/logger";
import { User, UserShows, WatchedEpisodes } from "guzek-uk-common/sequelize";
import { WatchedShowData, Episode, TvShow } from "guzek-uk-common/models";
import { CronJob } from "cron";
import axios from "axios";

export const router = express.Router();

const EPISODATE_API_BASE = "https://episodate.com/api/show-details?q=";

const logger = getLogger(__filename);

const hasEpisodeAired = (episode: Episode) =>
  new Date() > new Date(episode.air_date + " Z");

/**
 * Obtains the requesting user's liked and subscribed shows from the database.
 * `likedShows` and `subscribedShows` are returned as arrays of show IDs.
 * If the user has no entries in the database, these values are `undefined`.
 */
export async function getUserShows(userUuid?: string) {
  const entry = userUuid ? await UserShows.findByPk(userUuid) : null;
  return {
    likedShows: entry?.get("likedShows") as undefined | number[],
    subscribedShows: entry?.get("subscribedShows") as undefined | number[],
  };
}

async function checkUnwatchedEpisodes() {
  const users = await User.findAll({ where: { admin: true } });
  for (const user of users) {
    const username = user.get("username") as string;
    logger.info(`Checking ${username}'s unwatched episodes`);
    const uuid = user.get("uuid") as string;
    const watchedEpisodes = await WatchedEpisodes.findByPk(uuid);
    if (!watchedEpisodes) continue;
    const watchedShowData = watchedEpisodes.get(
      "watchedEpisodes"
    ) as WatchedShowData;
    const { subscribedShows } = await getUserShows(uuid);
    if (!subscribedShows) continue;
    for (const showId of subscribedShows) {
      const watchedData = watchedShowData[showId];
      axios.get(EPISODATE_API_BASE + showId).then(
        (res) => {
          const tvShow = res.data.tvShow as TvShow;
          for (const episode of tvShow.episodes) {
            if (!hasEpisodeAired(episode)) continue;
            if (watchedData?.[episode.season]?.includes(episode.episode))
              continue;
            // TODO: Post to the user's DOWNLOAD endpoint using an admin token
            // axios.post(url, { tvShow, episode });
            // tryDownloadEpisode(tvShow, episode);
          }
        },
        (error) =>
          logger.error(
            `Could not retrieve liked show ${showId} details. ${error}`
          )
      );
    }
  }
}

export function init() {
  checkUnwatchedEpisodes();
  new CronJob(
    "0 0 */6 * * *",
    checkUnwatchedEpisodes,
    null,
    true,
    "Europe/Warsaw"
  );
}
