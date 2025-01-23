# The Guzek UK API

## Intro

This repository contains the source code for the [Guzek UK API](https://api.guzek.uk/), which is used to power the [Guzek UK Website](https://www.guzek.uk/) -- my personal homepage. It has general website-related routes, such as page content for my custom-made content management system, the entire backend of [LiveSeries](https://www.guzek.uk/liveseries), a public torrent indexer and scraper, and much more.

## API

This repository contains only the necessary lightweight public-facing APIs. It used to contain user authentication, but that has been moved to a [separate server](https://github.com/kguzek/guzek-uk-auth-server).

Fun fact: this API's first implementation was as a JSON file serving as the database, and raw Node.JS http server code. It's now a MariaDB database operated by [Sequelize](https://sequelize.org/), an ORM for JS/TS -- yes, it's still based on Node.JS.

## Routes

Below is a list of accessible API routes, all of which use a base of [https://api.guzek.uk](https://api.guzek.uk/).

### GET `/pages`

Permissions: `public`

Returns an array of pages to be displayed in the website navbar.

Parameters:

- `lang` (required): `EN` or `PL` -- the language of the page titles. Can also be provided in cookies instead.

### GET `/pages/{pageId}`

Returns the HTML body content for that page, if it exists. Parameters same as for GET `/pages`.

### GET `/updated`

Permissions: `public`

Returns a dictionary of endpoint-timestamp pairs. For each endpoint, the UNIX timestamp represents the last modification date of any resource behind that API endpoint.

It ignores the `/logs` endpoint as well as itself (`/updated`); i.e. these endpoints are not present in the response body.

### `/logs`

Permissions: `admin only`

All sub-endpoints return an object containing a `date` field and a `logs` field, where `logs` is an array of JSON-formatted log entries.

#### GET `/logs/{date}`

Returns all logs (except for error-level logs) made on the specified date. The date must be specified as a string in such a way that JavaScript's `new Date()` constructor can parse it. The `date` field is set to the date in ISO 8601 format.

#### GET `/logs/error`

Returns all logs ever made with level `error`. The `date` field is set to `"error"`.

### `/liveseries`

This parent endpoint is shared by the [LiveSeries decentralised server](https://github.com/kguzek/guzek-uk-liveseries-server).

#### GET `/liveseries/watched-episodes`

Permissions: `admin only`

Get all watched episode data stored in the database.

##### GET `/liveseries/watched-episodes/personal`

Permissions: `authenticated only`

Get all of the logged in user's watched episodes.

###### PUT `/liveseries/watched-episodes/personal/{showId}/{season}`

Sets the logged in user's watched episodes in the given season of the given TV show, where the ID is the numerical ID from the [Episodate API](https://www.episodate.com/api).

#### GET `/liveseries/shows`

Permissions: `admin only`

Reads all user's liked and subscribed shows.

##### GET `/liveseries/shows/personal`

Permissions: `authenticated only`

Reads the logged in user's liked and subscribed shows, as arrays of show IDs.

###### POST|DELETE `/liveseries/shows/personal/{type}/{showId}`

Adds or removes (depending on request method) the show ID from the given list specified by `type`, where `type` is either `liked` or `subscribed`.

### GET|POST `/tu-lalem`

Permissions: `authenticated only`

Reads all Tu Lałem entries or creates a new one, depending on the request method. New entries must be JSON objects with key `coordinates` and value in the form of a two-value array (geographical coordinates).

Tu Lałem is a currently-private dormant project, which may or may not be revisited in the future.

## Usage

This repository isn't really meant to be cloned or downloaded by anyone, it's just where I keep the source code so I can develop from different locations. If you read this README, say hi!
