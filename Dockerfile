FROM node:26.7.0-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY config ./config
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS runtime

ARG VERSION=dev
ARG REVISION=unknown
ARG SOURCE=unknown

LABEL org.opencontainers.image.title="National Library of Armenia MCP Server (unofficial)" \
      org.opencontainers.image.description="Independent research MCP integration for the National Library of Armenia public DSpace repository" \
      org.opencontainers.image.authors="Suren Karapetyan <surenakar@gmail.com>" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION" \
      org.opencontainers.image.source="$SOURCE"

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=3000 \
    MCP_ALLOWED_HOSTS=localhost,127.0.0.1 \
    MCP_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 \
    MCP_TRUST_PROXY=false

WORKDIR /app

COPY --from=build --chown=65532:65532 /app/package.json /app/package-lock.json ./
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/dist ./dist
COPY --from=build --chown=65532:65532 /app/config ./config
COPY --chown=65532:65532 LICENSE NOTICE DATA_AND_CONTENT_RIGHTS.md PRIVACY.md TAKEDOWN.md THIRD_PARTY_NOTICES.md ./

USER 65532:65532
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["dist/index.js"]
