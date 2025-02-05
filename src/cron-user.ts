import axios from "axios";
import type { AxiosResponse } from "axios";
import jwt from "jsonwebtoken";
import { getLogger } from "guzek-uk-common/lib/logger";
import { User } from "guzek-uk-common/lib/sequelize";
import type { UserObj } from "guzek-uk-common/models";

const logger = getLogger(__filename);

const REFRESH_TOKEN_URL = "https://auth.guzek.uk/auth/refresh";
const ACCESS_TOKEN_VALID_FOR_MS = 300000; // 5 minutes

interface RefreshTokenResponse {
  accessToken: string;
  expiresAt: number;
  user: UserObj;
}

function decodeJwt(token: string) {
  const tokenPayload = jwt.decode(token);
  if (!tokenPayload || typeof tokenPayload === "string" || !tokenPayload.uuid) {
    logger.error("Invalid CRON user token.");
    return null;
  }
  return tokenPayload;
}

export class CronUser {
  private refreshToken: string | null;
  private uuid: string | null = null;

  constructor() {
    this.refreshToken = this.getRefreshToken();
  }

  getRefreshToken() {
    const refreshToken = process.env.CRON_USER_REFRESH_TOKEN;
    if (!refreshToken) {
      logger.error("No CRON user refresh token environment variable set.");
      return null;
    }
    const tokenPayload = decodeJwt(refreshToken);
    if (!tokenPayload) return null;
    this.uuid = tokenPayload.uuid;
    return refreshToken;
  }

  isReady() {
    return this.refreshToken != null && this.uuid != null;
  }

  getUuid() {
    if (!this.isReady()) {
      throw new Error("CRON user not ready.");
    }
    return this.uuid as string;
  }

  async getAccessToken(userUuid: string) {
    if (!this.isReady()) {
      logger.error(
        "CRON user attempting to obtain access token when not ready."
      );
      return null;
    }
    let res: AxiosResponse<RefreshTokenResponse>;
    try {
      res = await axios.post<RefreshTokenResponse>(REFRESH_TOKEN_URL, {
        token: this.refreshToken,
        audienceUuid: userUuid,
        expiresIn: ACCESS_TOKEN_VALID_FOR_MS,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          `Could not obtain an access token for the CRON user. ${error.message}`,
          error.response?.data
        );
        return null;
      }
      logger.error(
        "An error occured while obtaining an access token for the CRON user:",
        error
      );
      return null;
    }
    const tokenPayload = decodeJwt(res.data.accessToken);
    if (!tokenPayload) return null;
    const expiresAt = new Date(tokenPayload.exp ?? 0).toLocaleString();
    logger.verbose(
      `Obtained access token for CRON user with expiry date ${expiresAt} and audience ${tokenPayload.aud}.`
    );
    if (res.data.user.uuid !== this.uuid) {
      logger.error("CRON user UUID mismatch:", res.data.user, this.uuid);
      return null;
    }
    return res.data;
  }
}
