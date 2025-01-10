import express from "express";
import { Op } from "sequelize";
import { getLogger } from "guzek-uk-common/logger";
import { User, UserShows, WatchedEpisodes } from "guzek-uk-common/sequelize";
import type { Episode, TvShow, UserObj } from "guzek-uk-common/models";
import { CronJob } from "cron";
import axios, { AxiosResponse } from "axios";
import { serialiseEpisode } from "guzek-uk-common/util";

export const router = express.Router();

const REFRESH_TOKEN_URL = "https://auth.guzek.uk/auth/refresh";
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

interface RefreshTokenResponse {
  accessToken: string;
  expiresAt: number;
  uesr: UserObj;
}

async function getAdminToken() {
  const refreshToken = process.env.ADMIN_REFRESH_TOKEN;
  if (!refreshToken) {
    logger.error("No admin refresh token environment variable set.");
    return null;
  }
  let res: AxiosResponse<RefreshTokenResponse>;
  try {
    res = await axios.post<RefreshTokenResponse>(REFRESH_TOKEN_URL, {
      token: refreshToken,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        `Could not obtain an admin access token. ${error.message}`,
        error.response?.data
      );
      return null;
    }
    logger.error(
      "An error occured while obtaining an admin access token:",
      error
    );
    return null;
  }
  const expiresAt = new Date(res.data.expiresAt).toLocaleString();
  logger.info(`Obtained admin access token with expiry date ${expiresAt}.`);
  return res.data.accessToken;
}

async function checkUnwatchedEpisodes() {
  const adminToken = await getAdminToken();
  if (!adminToken) {
    logger.error("Failed to get admin token. Aborting episodes check.");
    return;
  }
  const users = await User.findAll({
    where: {
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
    for (const showId of subscribedShows) {
      const watchedData = watchedShowData[showId];
      axios.get(EPISODATE_API_BASE + showId).then(
        (res) => {
          const tvShow = res.data.tvShow as TvShow;
          for (const episode of tvShow.episodes) {
            if (!hasEpisodeAired(episode)) continue;
            if (watchedData?.[episode.season]?.includes(episode.episode))
              continue;
            const url = `${serverUrl}liveseries/downloaded-episodes`;
            const serialised = serialiseEpisode(episode);
            logger.info(`Attempting to download ${tvShow.name} ${serialised}`);
            axios
              .post(
                url,
                {
                  showName: tvShow.name,
                  showId,
                  season: episode.season,
                  episode: episode.episode,
                },
                {
                  headers: {
                    Authorization: `Bearer ${adminToken}`,
                  },
                }
              )
              .then(() => {
                logger.info(`Successfully posted to ${url}`);
              })
              .catch((error) => {
                if (!axios.isAxiosError(error)) {
                  logger.error(`Failed to post to ${url}:`, error);
                  return;
                }
                if (error.status === 403) {
                  // User hasn't opted-in to this feature
                  logger.warn(`Unauthorized to post to ${url}`);
                  return;
                }
                logger.error(
                  `Failed to post to ${url}. ${error.message}`,
                  error.response?.data
                );
              });
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

export function initialiseEpisodeTracker() {
  checkUnwatchedEpisodes();
  new CronJob(
    "0 0 */6 * * *",
    checkUnwatchedEpisodes,
    null,
    true,
    "Europe/Warsaw"
  );
}
