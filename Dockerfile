# build stage
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:server          # should output dist/server

# runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /src/dist/server ./dist
COPY --from=build /src/package.json ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
CMD ["node", "dist/server/server.js"]
EXPOSE 3001
