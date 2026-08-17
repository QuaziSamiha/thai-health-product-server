# syntax=docker/dockerfile:1.7

#* ═════════════════════════════════════════════════════════════════════════
#* THAI HEALTH PRODUCT — NESTJS API (MULTI-STAGE BUILD)
#*
#* BASE IMAGE CHOICE: DEBIAN SLIM, NOT ALPINE. TWO HARD DEPENDENCIES FORCE
#* THIS — `bcrypt` IS A NATIVE ADDON AND PRISMA'S SCHEMA ENGINE (USED BY
#* `prisma migrate deploy` AT STARTUP) IS A GLIBC/OPENSSL BINARY. ON MUSL
#* BOTH FAIL AT *RUNTIME*, NOT BUILD TIME, WHICH IS THE WORST PLACE TO
#* DISCOVER IT.
#* ═════════════════════════════════════════════════════════════════════════
ARG NODE_VERSION=22-bookworm-slim


#* ─────────────────────────────────────────────────────────────────────────
#* STAGE 1: base — SHARED OS LAYER FOR EVERY OTHER STAGE
#* ─────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      dumb-init \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV YARN_CACHE_FOLDER=/root/.yarn-cache


#* ─────────────────────────────────────────────────────────────────────────
#* STAGE 2: deps — DEPENDENCY INSTALL, CACHED ON package.json + yarn.lock
#* ONLY. SOURCE CHANGES DO NOT INVALIDATE THIS LAYER, SO A CODE-ONLY REBUILD
#* SKIPS THE (SLOW) NATIVE COMPILE OF bcrypt ENTIRELY.
#* ─────────────────────────────────────────────────────────────────────────
FROM base AS deps
#* node-gyp TOOLCHAIN — ONLY NEEDED IF bcrypt HAS NO PREBUILT BINARY FOR THIS
#* PLATFORM. LIVES IN THIS STAGE ALONE AND NEVER REACHES THE RUNTIME IMAGE.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/root/.yarn-cache \
    yarn install --frozen-lockfile --network-timeout 600000


#* ─────────────────────────────────────────────────────────────────────────
#* STAGE 3: builder — PRISMA CLIENT GENERATION + `nest build`
#* ─────────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

#* THE GENERATOR ONLY NEEDS THE DATASOURCE *SHAPE*, NOT A REACHABLE SERVER —
#* BUT prisma.config.ts READS process.env.DATABASE_URL EAGERLY, SO A SYNTACTICALLY
#* VALID PLACEHOLDER MUST EXIST OR THE CONFIG FILE THROWS BEFORE GENERATION STARTS.
#* THE REAL URL IS INJECTED AT RUNTIME BY COMPOSE AND NEVER BAKED INTO A LAYER.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"

#* EMITS TYPESCRIPT SOURCES INTO src/generated/prisma (SEE prisma/schema/schema.prisma),
#* WHICH THE NEXT STEP THEN COMPILES ALONGSIDE THE REST OF THE APP.
RUN yarn prisma generate

#* NOTE ON THE OUTPUT PATH: tsconfig.json DECLARES NO `rootDir`, AND THE PROGRAM
#* INCLUDES prisma.config.ts AT THE REPO ROOT — SO TSC'S COMMON SOURCE DIRECTORY
#* IS THE PROJECT ROOT AND main.js LANDS AT dist/src/main.js, NOT dist/main.js.
#* (package.json's `start` SCRIPT SAYS `node dist/main` AND IS THEREFORE STALE —
#* THE CMD AT THE BOTTOM OF THIS FILE USES THE PATH THAT ACTUALLY EXISTS.)
RUN yarn build


#* ─────────────────────────────────────────────────────────────────────────
#* STAGE 4: runner — FINAL RUNTIME IMAGE
#*
#* node_modules IS COPIED WHOLE FROM `deps` RATHER THAN RE-RESOLVED WITH
#* `--production`. THIS IS A CONSCIOUS SIZE-FOR-CAPABILITY TRADE: THE
#* CONTAINER OWNS ITS OWN SCHEMA MIGRATION (`prisma migrate deploy`) AND
#* SEEDING (`tsx prisma/seed.ts`), AND BOTH TOOLS ARE devDependencies.
#* DROPPING THEM WOULD MEAN A SEPARATE MIGRATION IMAGE FOR NO REAL GAIN ON
#* AN INTERNALLY DEPLOYED SERVICE.
#* ─────────────────────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production \
    PORT=5001 \
    NODE_OPTIONS=--enable-source-maps

#* THE STOCK `node` USER (uid 1000) SHIPS WITH THE BASE IMAGE — NO NEED TO MINT
#* ANOTHER ONE. THE TWO WRITABLE PATHS ARE PRE-CREATED AND CHOWNED *BEFORE* THE
#* VOLUMES MOUNT, SO DOCKER PROPAGATES THE RIGHT OWNERSHIP INTO EMPTY VOLUMES.
RUN mkdir -p /app/uploads /app/logs && chown -R node:node /app

COPY --from=deps    --chown=node:node /app/node_modules            ./node_modules
COPY --from=builder --chown=node:node /app/dist                    ./dist
COPY --from=builder --chown=node:node /app/src/generated/prisma    ./src/generated/prisma
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

#* CRLF-PROOFING: THIS REPO IS EDITED ON WINDOWS AND GIT MAY HAND US A SCRIPT
#* WITH \r\n LINE ENDINGS, WHICH MAKES THE KERNEL REPORT THE SHEBANG AS
#* "/bin/sh\r: no such file or directory". STRIPPING THEM HERE IS CHEAPER THAN
#* RELYING ON EVERY CONTRIBUTOR HAVING .gitattributes CONFIGURED CORRECTLY.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 5001

#* PROBES THE *READINESS* ROUTE, NOT LIVENESS — READINESS INCLUDES THE DATABASE
#* INDICATOR, SO COMPOSE'S `depends_on: service_healthy` ON THIS SERVICE MEANS
#* "API IS UP **AND** TALKING TO POSTGRES". THESE PATHS ARE EXEMPT FROM THE
#* GLOBAL PREFIX AND FROM THE THROTTLER (SEE main.ts / health.controller.ts).
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

#* dumb-init IS PID 1 SO SIGTERM REACHES NODE AND app.enableShutdownHooks()
#* CAN ACTUALLY DRAIN THE PRISMA POOL INSTEAD OF BEING SIGKILLED AFTER 10s.
ENTRYPOINT ["/usr/bin/dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
