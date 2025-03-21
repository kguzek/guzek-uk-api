// Initialise dependencies
import express from "express";
import { setupEnvironment } from "guzek-uk-common/lib/setup";
const debugMode = setupEnvironment();
import { startServer, send405 } from "guzek-uk-common/lib/server";
import { getMiddleware } from "guzek-uk-common/middleware";
import { initialiseEpisodeTracker } from "./src/liveseries";

// Initialise the application instance
const app = express();
app.set("trust proxy", 1);

// Define the endpoints
const ENDPOINTS = [
  "pages",
  "updated",
  "tu-lalem",
  "liveseries/shows",
  "liveseries/watched-episodes",
];

async function initialise() {
  // Enable middleware
  app.use(getMiddleware(debugMode));
  for (const endpoint of ENDPOINTS) {
    const middleware = await import("./src/routes/" + endpoint);
    if (middleware.init) middleware.init(ENDPOINTS);
    app.use(`/${endpoint}`, middleware.router, send405);
  }
  if (startServer(app)) {
    initialiseEpisodeTracker();
  }
}

initialise();
