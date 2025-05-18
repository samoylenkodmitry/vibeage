# Single stage build for development
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Install tsx globally for running TypeScript directly
RUN npm install -g tsx

# Run the server directly with tsx (no build step)
CMD ["tsx", "server/server.ts"]
EXPOSE 3001
