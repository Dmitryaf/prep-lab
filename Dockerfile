FROM node:22.22.3-bookworm-slim AS dependencies
WORKDIR /app
ENV NUXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# The pinned driver includes N-API binaries; npm must not invoke node-gyp.
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();"

FROM dependencies AS build
COPY nuxt.config.ts tsconfig.json eslint.config.ts playwright.config.ts ./
COPY app ./app
COPY domain ./domain
COPY server ./server
COPY scripts ./scripts
COPY tests ./tests
COPY content ./content
COPY public ./public
RUN npm run build

FROM node:22.22.3-bookworm-slim AS assistant-runtime
RUN npm install --global --ignore-scripts --no-audit --no-fund @openai/codex@0.158.0 \
    && codex --version \
    && npm cache clean --force

FROM assistant-runtime AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    FRONTEND_LAB_DATA_DIR=/data \
    CODEX_COMMAND=/usr/local/bin/codex
COPY --from=build --chown=node:node /app/.output ./.output
# Keep explicit dependencies for TS administration even when Nitro inlines them.
COPY --from=dependencies --chown=node:node /app/node_modules/zod ./.output/server/node_modules/zod
COPY --from=dependencies --chown=node:node /app/node_modules/yaml ./.output/server/node_modules/yaml
COPY --from=dependencies --chown=node:node /app/node_modules/jose ./.output/server/node_modules/jose
# Administrative commands reuse the application's repositories and validators.
# These files are outside Nitro's public directory and contain no instance data.
COPY --from=build --chown=node:node /app/package.json ./admin/package.json
COPY --from=build --chown=node:node /app/domain ./admin/domain
COPY --from=build --chown=node:node /app/server ./admin/server
COPY --from=build --chown=node:node /app/scripts ./admin/scripts
RUN mkdir -p /data \
    && chown node:node /data \
    && ln -s /app/.output/server/node_modules /app/admin/node_modules
USER node
EXPOSE 4173
STOPSIGNAL SIGTERM
CMD ["node", ".output/server/index.mjs"]
