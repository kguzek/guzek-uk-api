import express from "express";
import { Op } from "sequelize";
import { CronJob } from "cron";
import axios from "axios";
import { getLogger } from "guzek-uk-common/lib/logger";
import {
  User,
  UserShows,
  WatchedEpisodes,
} from "guzek-uk-common/lib/sequelize";
import type { Episode, TvShow } from "guzek-uk-common/models";
import { serialiseEpisode } from "guzek-uk-common/lib/util";
import { CronUser } from "./cron-user";

export const router = express.Router();

const EPISODATE_API_BASE = "https://episodate.com/api/show-details?q=";

const logger = getLogger(__filename);

const hasEpisodeAired = (episode: Episode) =>
  new Date() > new Date(episode.air_date + " Z");

let cronUser: CronUser;

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
  if (!cronUser.isReady()) {
    logger.error("Failed to get CRON user token. Aborting episodes check.");
    return;
  }
  const users = await User.findAll({
    where: {
      uuid: {
        [Op.not]: cronUser.getUuid(),
      },
      serverUrl: {
        [Op.and]: {
          [Op.not]: null,
          [Op.like]: "http%",
        },
      },
    },
  });
  for (const user of users) {
    const username = user.get("username");
    const serverUrl = user.get("serverUrl");
    if (!serverUrl) {
      logger.warn(
        `User query returned user with falsey serverUrl: ${username}`
      );
      continue;
    }
    logger.info(`Checking ${username}'s unwatched episodes`);
    const uuid = user.get("uuid") as string;
    const watchedEpisodes = await WatchedEpisodes.findByPk(uuid);
    if (!watchedEpisodes) continue;
    const watchedShowData = watchedEpisodes.get("watchedEpisodes");
    const { subscribedShows } = await getUserShows(uuid);
    if (!subscribedShows) continue;
    let userAccessToken: string | null = null;

    async function getUserAccessToken() {
      if (!userAccessToken) {
        const res = await cronUser.getAccessToken(uuid);
        if (res == null) {
          logger.error("Failed to get user access token.");
          return null;
        }
        userAccessToken = res.accessToken;
      }
      return userAccessToken;
    }

    for (const showId of subscribedShows) {
      const watchedData = watchedShowData[showId];
      axios.get(EPISODATE_API_BASE + showId).then(
        async (res) => {
          const tvShow = res.data.tvShow as TvShow;
          for (const episode of tvShow.episodes) {
            if (!hasEpisodeAired(episode)) continue;
            if (watchedData?.[episode.season]?.includes(episode.episode))
              continue;
            const url = `${serverUrl}liveseries/downloaded-episodes`;
            const serialised = serialiseEpisode(episode);
            logger.info(
              `Attempting to download ${tvShow.name} ${serialised}...`
            );
            try {
              await axios.post(
                url,
                {
                  showName: tvShow.name,
                  showId,
                  season: episode.season,
                  episode: episode.episode,
                },
                {
                  headers: {
                    Authorization: `Bearer ${await getUserAccessToken()}`,
                  },
                }
              );
            } catch (error) {
              if (!axios.isAxiosError(error)) {
                logger.error(`Failed to post to ${url}:`, error);
                return;
              }
              if (error.status === 409) {
                logger.info(
                  `This episode is already downloaded on the target server.`
                );
                return;
              }
              if (error.status === 403) {
                logger.warn(
                  `The target server ${url} has denied access to the server.`
                );
                return;
              }
              logger.error(
                `Failed to post to ${url}. ${error.message}`,
                error.response?.data
              );
              return;
            }
            logger.info(`Successfully posted to ${url}`);
          }
        },
        (error) => {
          if (!axios.isAxiosError(error)) {
            logger.error(
              `Could not retrieve liked show ${showId} details.`,
              error
            );
            return;
          }
          logger.error(
            `Request to Episodate for show ${showId} failed. ${error.message}`,
            error.response?.data
          );
        }
      );
    }
  }
}

export async function initialiseEpisodeTracker() {
  cronUser = new CronUser();
  if (!cronUser.isReady()) {
    logger.error("Failed to initialise CRON user. Aborting episode tracker.");
    return;
  }
  checkUnwatchedEpisodes();
  new CronJob(
    "0 0 */6 * * *",
    checkUnwatchedEpisodes,
    null,
    true,
    "Europe/Warsaw"
  );
}
