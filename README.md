# The Guzek UK API

## Intro

This repository contains the source code for the [Guzek UK API](https://api.guzek.uk/), which is used to power the [Guzek UK Website](https://www.guzek.uk/) -- my personal homepage. It has general website-related routes, such as page content for my custom-made content management system, the entire backend of [LiveSeries](https://www.guzek.uk/liveseries), a public torrent indexer and scraper, and much more.

## API

This repository contains only the necessary lightweight public-facing APIs. It used to contain user authentication, but that has been moved to a [separate server](https://github.com/kguzek/guzek-uk-auth-server).

Fun fact: this API's first implementation was as a JSON file serving as the database, and raw Node.JS http server code. It's now a MariaDB database operated by [Sequelize](https://sequelize.org/), an ORM for JS/TS -- yes, it's still based on Node.JS.

## Routes

Below is a list of accessible API routes, which use a base of [https://api.guzek.uk](https://api.guzek.uk/) (*).

\* The `liveseries/watch` route is planned to be moved to a separate streaming server, `v.guzek.uk`. Currently, that hostname resolves to the same server as `api.guzek.uk`.

TODO: implement routes documentation

### `/pages`

### `/updated`

### `/logs`

### `/torrents`

### `/liveseries`

### `/tu-lalem`

## Usage

This repository isn't really meant to be cloned or downloaded by anyone, it's just where I keep the source code so I can develop from different locations. If you read this README, say hi!
