// Initialise dependencies
import express from "express";
import { setupEnvironment } from "guzek-uk-common/setup";
setupEnvironment();
import { startServer } from "guzek-uk-common/util";
import { getMiddleware } from "guzek-uk-common/middleware";
import { getLogger } from "guzek-uk-common/logger";

const logger = getLogger(__filename);

// Initialise the application instance
const app = express();
app.set("trust proxy", 1);

// Determine the server port
const PORT = process.env.NODE_PORT;

// Define the endpoints
const ENDPOINTS = [
  "pages",
  "updated",
  "tu-lalem",
  "liveseries/shows",
  "liveseries/watched-episodes",
  "logs",
];

/** Initialises the HTTP RESTful API server. */
async function initialise() {
  // Enable middleware
  app.use(getMiddleware());

  // Enable individual API routes
  for (const endpoint of ENDPOINTS) {
    const middleware = await import("./src/routes/" + endpoint);
    if (middleware.init) middleware.init(ENDPOINTS);
    app.use("/" + endpoint, middleware.router);
  }
  startServer(app, PORT);
}

if (PORT) {
  initialise();
} else {
  logger.error("No server port environment variable set.");
}
