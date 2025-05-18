# --- builder ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm i --production=false
COPY . .
RUN npm run build:server

# --- runner ---
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3001
ENV PORT=3001
CMD ["node", "--experimental-specifier-resolution=node", "dist/server/server.js"]
