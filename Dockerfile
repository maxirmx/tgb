# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of the tgb application

FROM node:22-alpine3.22 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine3.22 AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/src ./dist
RUN mkdir -p /data

CMD ["node", "dist/index.js"]
