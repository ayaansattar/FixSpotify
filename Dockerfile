# Debian (not Alpine) so the native better-sqlite3 module compiles cleanly.
# Building on the target host means this image is correct for that host's CPU
# architecture (e.g. Oracle Ampere is arm64).
FROM node:22-bookworm-slim

# Build toolchain required to compile better-sqlite3's native binding.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
# SQLite lives on a mounted volume so data survives container rebuilds.
ENV DATABASE_URL="file:/app/data/prod.db"

# Install dependencies first for better layer caching. Dev dependencies are
# kept because the Prisma CLI (used for migrations at startup) lives there.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate the Prisma client, then build Next.js. The scheduler in
# instrumentation.ts intentionally no-ops during the build phase.
RUN npx prisma generate \
  && npm run build

EXPOSE 3000

# Apply any pending migrations against the mounted database, then start Next.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
