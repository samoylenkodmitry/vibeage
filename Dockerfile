FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY tsconfig.json tsconfig.server.json ./
COPY server ./server
COPY shared ./shared
RUN pnpm run build:server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3001

RUN addgroup -S vibeage && adduser -S vibeage -G vibeage
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY --from=build --chown=vibeage:vibeage /app/dist ./dist

USER vibeage
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-specifier-resolution=node", "dist/server/server.js"]
