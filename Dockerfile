# syntax=docker/dockerfile:1

# Build stage. No build-time variables are passed in, so nothing secret can be compiled into the bundle.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY contracts ./contracts
RUN npx vite build

# Runtime stage: the static build served by Caddy, as an unprivileged user.
# The default configuration only serves the files; the production Compose example mounts a Caddyfile
# that adds TLS, the /api proxy and the security headers.
FROM caddy:2-alpine AS runtime
RUN addgroup -S app && adduser -S -G app -u 10001 app \
  && mkdir -p /data /config \
  && chown -R app:app /data /config
COPY --from=build --chown=app:app /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
ENV XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config
USER app
EXPOSE 80 443
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:2019/config/ || exit 1
