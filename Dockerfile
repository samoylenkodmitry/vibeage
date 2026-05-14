FROM node:20-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

ENV NODE_ENV=production PORT=3001

RUN addgroup -S vibeage && adduser -S vibeage -G vibeage
COPY --chown=vibeage:vibeage tsconfig.json tsconfig.server.json ./
COPY --chown=vibeage:vibeage apps/server ./apps/server
COPY --chown=vibeage:vibeage server ./server
COPY --chown=vibeage:vibeage shared ./shared
COPY --chown=vibeage:vibeage packages ./packages

USER vibeage
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "exec", "tsx", "apps/server/src/main.ts"]
