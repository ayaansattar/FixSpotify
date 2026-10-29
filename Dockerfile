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

# Install dependencies first for better layer caching. --include=dev is
# required because NODE_ENV=production would otherwise skip devDependencies,
# and the build needs them (Tailwind/PostCSS, TypeScript, Prisma CLI).
COPY package.json package-lock.json ./
# The host's link to the npm registry occasionally times out (ETIMEDOUT), so
# retry patiently and keep npm's download cache between builds; a rebuild then
# only fetches what changed instead of every package again.
RUN --mount=type=cache,target=/root/.npm \
  npm ci --include=dev \
    --fetch-retries=5 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=600000

COPY . .

# Generate the Prisma client, then build Next.js. The scheduler in
# instrumentation.ts intentionally no-ops during the build phase.
RUN npx prisma generate \
  && npm run build

EXPOSE 3000

# Apply any pending migrations against the mounted database, then start Next.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
