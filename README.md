# unfisk

OADA uservice to &#34;unflatten&#34; a list into a list of links.  In other words, if you POST
objects into a resource, and you want all those objects to actually become resources themselves,
this will create them as resources and link them at a destination.

For example,
```http
POST /bookmarks/trellisfw/asn-staging
{
  "the": "asn",
  "as": "a plain object",
}
```
(returns content-location = resources/d09i3jdf9/AAAAABBBBCCCC123)

would result in `unfisk` executing the following requests:
```http
PUT /resources/AAAAABBBBCCCC123
{
  "the": "asn",
  "as": "a plain object",
}

PUT /bookmarks/trellisfw/asns
{
  AAAAABBBBCCCC123: { "_id": "resources/AAAAABBBBCCCC123" },
}

DELETE /bookmarks/trellisfw/asn-staging
```

## Installation
```bash
cd /path/to/your/oada-srvc-docker
cd services-available
git clone git@github.com:trellisfw/unfisk.git
cd ../services-enabled
ln -s ../unfisk .
```

## Overriding defaults for production
Using the `z_tokens` method described in `oada-srvc-docker`, the following docker-compose entries
will work in `z_tokens/docker-compose.yml`:
```docker-compose
  unfisk:
    environment:
      - token=atokentouseinproduction
      - domain=https://your.trellis.domain
```
