ARG NODE_VER=16-alpine

FROM node:$NODE_VER AS install

WORKDIR /trellis/unfisk

COPY ./.yarn /trellis/unfisk/.yarn
COPY ./package.json ./yarn.lock ./.yarnrc.yml /trellis/unfisk/

RUN yarn workspaces focus --all --production

FROM install AS build

# Install dev deps too
RUN yarn install --immutable

COPY . /trellis/unfisk/

# Build code and remove dev deps
RUN yarn build && rm -rfv .yarn .pnp*

FROM node:$NODE_VER AS production

# Do not run service as root
USER node

WORKDIR /trellis/unfisk

COPY --from=install /trellis/unfisk/ /trellis/unfisk/
COPY --from=build /trellis/unfisk/ /trellis/unfisk/

ENTRYPOINT ["yarn", "run"]
CMD ["start"]
