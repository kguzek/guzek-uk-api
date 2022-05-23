// Initialise dependencies
import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import "dotenv/config";
import { sendError } from "./src/util";
import { getLogger, loggingMiddleware } from "./src/logger";

const logger = getLogger(__filename);

// Initialise the application instance
const app = express();

// Determine the server port
const PORT = process.env.NODE_PORT;

// Define the endpoints
const ENDPOINTS = ["pages"];

console.log(); // Add newline before app output for readability

/** Initialises the HTTP RESTful API server. */
function initialise() {
  // Enable middleware
  app.use(cors());
  app.use(bodyParser.json());
  app.use(loggingMiddleware);

  // Enable individual API routes
  for (const endpoint of ENDPOINTS) {
    const middleware = require("./routes/" + endpoint)
    app.use("/" + endpoint, middleware.router);
  }

  // Catch-all 404 response for any other route
  app.all("*", (req, res) =>
    sendError(res, 404, {
      message: `The resource at '${req.originalUrl}' was not located.`,
    })
  );

  app.listen(PORT, () => logger.info(`API listening on port ${PORT}.`));
}

if (PORT) {
  initialise();
} else {
  logger.error("No server port environment variable set.");
}