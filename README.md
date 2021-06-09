# Qlever-LLC/unfisk

[![License](https://img.shields.io/github/license/Qlever-LLC/unfisk)](LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/qlever/unfisk)][dockerhub]

OADA uservice to "unflatten" a list into a list of links.
In other words, if you POST objects into a resource,
and you want all those objects to actually become resources themselves,
this will create them as resources and link them at a destination.

For example,

```http
POST /bookmarks/trellisfw/asn-staging
{
  "the": "asn",
  "as": "a plain object",
}
```

(returns header `content-location: resources/AAAAABBBBCCCC123`)

would result in `unfisk` essentially executing the following requests:

```http
PUT /resources/AAAAABBBBCCCC123
{
  "the": "asn",
  "as": "a plain object",
}

PUT /bookmarks/trellisfw/asns
{
  "AAAAABBBBCCCC123": { "_id": "resources/AAAAABBBBCCCC123" },
}

DELETE /bookmarks/trellisfw/asn-staging
```

## Usage

Docker images for unfisk are available from
DockerHub and GitHub Container Registry.

### docker-compose

Here is an example of using this service with docker-compose.

```yaml
services:
  service:
    image: Qlever-LLC/unfisk
    restart: unless-stopped
    environment:
      NODE_TLS_REJECT_UNAUTHORIZED:
      NODE_ENV: ${NODE_ENV:-development}
      DEBUG: ${DEBUG-*:error,*:warn,*:info}
      # Connect to host if DOMAIN not set.
      # You should really not rely on this though. Set DOMAIN.
      DOMAIN: ${DOMAIN:-host.docker.internal}
      # Unless your API server is running with development tokens enabled,
      # you will need to give the service token(s) to use.
      TOKEN: ${TOKEN:-abc123,def456}
      # Rate limit unflattening (minimum ms between items being unflattened)
      UNFLATTEN_RATE:
```

### Running unfisk within the [OADA Reference API Server]

To add this service to the services run with an OADA v3 server,
simply add a snippet like the one in the previous section
to your `docker-compose.override.yml`.

### External Usage

To run this service separately,
simply set the domain and token(s) of the OADA API.

```shell
# Set up the environment.
# Only need to run these the first time.
echo DOMAIN=api.oada.example.com > .env # Set API domain
echo TOKEN=abc123 >> .env # Set API token(s) for the service

# Start the service
docker-compose up -d
```

[dockerhub]: https://hub.docker.com/repository/docker/qlever/unfisk
[oada reference api server]: https://github.com/OADA/server
