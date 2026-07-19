# FixSpotify

A private, single-user Spotify manager for understanding listening habits,
cleaning playlists, and improving shuffle behavior.

FixSpotify connects to Spotify through OAuth, stores listening history in a
local SQLite database, and runs continuously in Docker. It is designed for one
Spotify account and works with Spotify's Development Mode.

## Features

- Imports Spotify Extended Streaming History.
- Automatically syncs recent plays every hour.
- Ranks playlist tracks by least-listened over 7 days, 30 days, or 1 year.
- Removes tracks and keeps a seven-day recently deleted list.
- Restores deleted tracks without adding duplicates.
- Provides Fisher–Yates fair shuffle.
- Supports fresh shuffles and persistent no-repeat shuffle decks.
- Analyzes artist genres and suggests better matching playlists.
- Adds tracks to suggested playlists without duplicates.
- Lets you select and order the playlists shown in the app.
- Caches large playlist track lists in SQLite to reduce Spotify API usage.

## Stack

- Next.js with TypeScript and the App Router
- NextAuth with the Spotify provider
- Prisma and SQLite
- Tailwind CSS
- `node-cron` for scheduled synchronization and cleanup
- Docker Compose and Caddy for production deployment and HTTPS

## Requirements

- Node.js 22+
- npm
- A Spotify Developer application
- Spotify Premium for playback controls
- Docker and Docker Compose for production deployment

## Spotify configuration

Create an application in the
[Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

For local development, register:

```text
http://127.0.0.1:3000/api/auth/callback/spotify
```

For production, register:

```text
https://your-domain.example.com/api/auth/callback/spotify
```

The app requests permissions for private playlist access, playlist editing,
recent listening history, and playback control.

## Local setup

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in `.env`:

```dotenv
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
NEXTAUTH_URL=http://127.0.0.1:3000
NEXTAUTH_SECRET=
DATABASE_URL="file:./prisma/dev.db"
```

Generate a NextAuth secret with:

```bash
openssl rand -base64 32
```

Create the database and generate the Prisma client:

```bash
npm run db:migrate
npm run db:generate
```

Start the development server:

```bash
npm run dev
```

Open <http://127.0.0.1:3000>.

## Listening history

The hourly scheduler only has access to Spotify's 50 most recent plays.
FixSpotify therefore includes a one-time importer for Spotify Extended
Streaming History exports.

Place the extracted export files in:

```text
spotify_history/
```

Then run:

```bash
npm run history:import
```

The importer:

- Reads audio and video streaming-history JSON files.
- Imports only tracks played for more than 30 seconds.
- Ignores podcasts, audiobooks, and invalid records.
- Deduplicates records within the export.
- Deduplicates against plays already stored in SQLite.
- Can be run repeatedly without creating duplicates.

After the initial import, the hourly scheduler keeps the database current.
Running the importer again is only necessary when importing a newer export or
rebuilding the database.

## Available commands

```bash
npm run dev             # Start the development server
npm run build           # Create a production build
npm run start           # Start the production server
npm run lint            # Run ESLint
npm run db:generate     # Generate the Prisma client
npm run db:migrate      # Create and apply a development migration
npm run history:import  # Import extended Spotify history
```

## Data and caching

SQLite stores:

- Listening history
- Spotify refresh/access tokens for scheduled synchronization
- Playlist preferences
- Recently deleted tracks
- No-repeat shuffle deck progress
- Artist genre cache
- Playlist track cache

Playlist track lists are cached for six hours. Changes made inside FixSpotify
invalidate the relevant cache immediately. The dashboard also has a
**Refresh from Spotify** button for changes made in the Spotify client.

The database contains sensitive listening and authentication data. Do not
commit it or expose it publicly.

## Production deployment with Docker

Copy the production environment template:

```bash
cp .env.production.example .env.production
```

Set:

```dotenv
APP_DOMAIN=your-domain.example.com
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
NEXTAUTH_URL=https://your-domain.example.com
NEXTAUTH_SECRET=
DATABASE_URL=file:/app/data/prod.db
```

Build and start:

```bash
docker compose --env-file .env.production up -d --build
```

The Compose stack includes:

- The Next.js application
- Caddy as an HTTPS reverse proxy
- A persistent Docker volume for SQLite
- Persistent Caddy certificate storage

Pending Prisma migrations are applied automatically when the app container
starts.

Useful production commands:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f app
docker compose --env-file .env.production restart
docker compose --env-file .env.production up -d --build
```

## Automatic deployment

`.github/workflows/deploy.yml` deploys every push to `main`. It synchronizes
the repository to the server over SSH and rebuilds the Docker Compose stack.

Add these GitHub repository secrets:

```text
SSH_HOST
SSH_USER
SSH_PRIVATE_KEY
```

The workflow excludes `.env.production`, SQLite database files, build output,
and Spotify history exports. Production data remains in the Docker volume
across deployments.

## Scheduled tasks

The app runs two in-process cron tasks:

- Every hour: fetch and store recent Spotify plays.
- Daily: delete recently deleted records older than seven days.

The application container must remain running for these jobs to execute.

## Updating production manually

If automatic deployment is unavailable:

```bash
cd ~/FixSpotify
docker compose --env-file .env.production up -d --build
```

If the server is a Git checkout, pull first:

```bash
git pull
```

## Security notes

- Keep `.env`, `.env.production`, the SQLite database, and SSH keys private.
- Restrict the Spotify app to your own account in Development Mode.
- Caddy automatically obtains and renews TLS certificates.
- The application is intended for private, single-user use.

