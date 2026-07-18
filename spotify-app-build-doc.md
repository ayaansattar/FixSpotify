# Personal Spotify Manager — Build Document

## 1. Overview

An internal, single-user web app that connects to your Spotify account and:

1. Pulls your listening data
2. Surfaces least-listened songs per playlist (week / month / year)
3. Lets you preview and remove tracks from playlists
4. Replaces Spotify's shuffle with a true uniform-random shuffle
5. Suggests a genre-based playlist for each track and lets you move it

**Scope note:** this is built for one Spotify account (yours). It runs in Spotify's Development Mode, which is designed exactly for this — no app review or business registration needed.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (TypeScript, App Router) | Frontend + backend API routes in one codebase |
| Auth | `next-auth` w/ Spotify provider | Handles OAuth + token refresh, the most error-prone part to hand-roll |
| Database | SQLite + Prisma ORM | Zero-config, single-writer workload, easy schema migrations |
| Scheduler | `node-cron` (in-process) | No separate worker service to deploy/maintain |
| Playback control | Spotify Web Playback SDK (client-side) | Required to drive your own shuffle queue |
| Styling | Tailwind CSS | Fast to build a clean internal tool without design overhead |
| Hosting | Docker container on a small VPS or home server | Long-running process + local file DB fit "always-on," not serverless |

---

## 3. Spotify App Registration

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Set the Redirect URI to match your deployment, e.g. `https://your-domain.com/api/auth/callback/spotify` (or `http://localhost:3000/...` for local dev).
3. Note your **Client ID** and **Client Secret**.
4. App starts in **Development Mode** — fine as-is, since you're the only user (limit is 5 test users, no action needed).
5. Under app settings, add yourself as an allowed user if prompted.

**OAuth scopes to request:**
```
user-read-recently-played
user-top-read
playlist-read-private
playlist-modify-private
playlist-modify-public
user-read-playback-state
user-modify-playback-state
streaming
```

---

## 4. Project Structure

```
spotify-manager/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── sync/route.ts          # cron-triggered play-log poll
│   │   │   ├── playlists/route.ts     # list/read playlists
│   │   │   ├── tracks/[id]/route.ts   # remove track, etc.
│   │   │   ├── shuffle/route.ts       # generate shuffled queue
│   │   │   └── genre-sort/route.ts    # suggest playlist by genre
│   │   ├── dashboard/page.tsx         # least-listened view
│   │   ├── genre-sort/page.tsx
│   │   └── shuffle/page.tsx
│   ├── lib/
│   │   ├── spotify.ts                 # thin API client wrapper
│   │   ├── db.ts                      # Prisma client instance
│   │   └── scheduler.ts               # node-cron job definitions
│   └── components/
├── docker-compose.yml
├── Dockerfile
└── .env
```

---

## 5. Data Model (Prisma schema)

```prisma
model Play {
  id        String   @id @default(cuid())
  trackId   String
  trackName String
  artistId  String
  playedAt  DateTime
  createdAt DateTime @default(now())

  @@index([trackId])
  @@index([playedAt])
}

model GenreCache {
  artistId   String   @id
  genres     String   // JSON-encoded array
  updatedAt  DateTime @updatedAt
}

model PlaylistSnapshot {
  id         String   @id @default(cuid())
  playlistId String
  trackId    String
  addedAt    DateTime @default(now())

  @@index([playlistId])
}
```

---

## 6. Environment Variables

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=            # generate with `openssl rand -base64 32`
DATABASE_URL="file:./dev.db"
```

---

## 7. Feature Implementation

### 7.1 Pull listening data
- `GET /me/player/recently-played` (last 50 tracks) — poll on a schedule, don't rely on it for history.
- `GET /me/top/tracks?time_range=short_term|medium_term|long_term` — for "most played" context.
- **One-time seed:** request your extended streaming history from Spotify's privacy/account data page, and write an import script to bulk-load it into the `Play` table before you start polling live.

### 7.2 Least-listened report
- `src/lib/scheduler.ts` runs `node-cron` on an hourly schedule, calling `/api/sync`, which:
  1. Fetches `recently-played`
  2. Inserts any `playedAt` timestamps not already in the `Play` table (dedupe on `trackId` + `playedAt`)
- Dashboard query: for a selected playlist and window (7 / 30 / 365 days), join playlist tracks against `Play` counts in that window, sort ascending — tracks with zero plays float to the top.

### 7.3 Preview + remove
- Preview: Web Playback SDK `player.play()` targeting the track URI (or open a 30-second preview if available on the track object).
- Remove: `DELETE /playlists/{playlist_id}/tracks` with the track URI in the body, triggered from a button next to each flagged song.

### 7.4 Fair shuffle
- `/api/shuffle` takes a playlist ID, fetches all track URIs, and runs a Fisher–Yates shuffle server-side.
- Frontend takes the returned ordered URI list and calls `PUT /me/player/play` with that exact `uris` array via the Web Playback SDK-connected device — this is playback you're controlling directly, not Spotify's shuffle toggle.
- Re-shuffle button re-runs the same route for a fresh random order any time.

### 7.5 Genre detection + sorting
- For each track, look up primary artist → `GET /artists/{id}` → cache the `genres` array in `GenreCache` (avoid refetching).
- Fuzzy-match returned genre strings against your existing genre-playlist names (simple substring/Levenshtein match is enough at this scale).
- Present suggestion in UI ("this looks like Indie Folk → add to 'Folk'?") — on confirm, call `POST /playlists/{playlist_id}/tracks` to add and optionally remove from the source playlist.

---

## 8. Build Order (suggested milestones)

1. **Scaffold**: Next.js + Prisma + next-auth Spotify login working, can see your display name.
2. **Data pipeline**: sync route + cron job logging plays into SQLite; verify with a manual `/api/sync` hit.
3. **Dashboard**: least-listened view for one playlist, one time window.
4. **Remove flow**: preview + delete button wired to a real playlist.
5. **Shuffle**: shuffle route + Web Playback SDK integration (this is the most fiddly part — budget extra time for SDK device registration).
6. **Genre sort**: artist genre fetch/cache + suggestion UI + move action.
7. **Polish**: multiple time windows, multiple playlists, error handling/retries around 429s and token refresh.

---

## 9. Robustness Notes (keep it simple, not fragile)

- Wrap all Spotify calls in a retry helper that backs off on `429` (respect the `Retry-After` header) and refreshes the token on `401`.
- No queue/worker system needed — the cron job calling your own API route directly is sufficient at this scale.
- SQLite is fine as-is; no need for Postgres unless you outgrow single-writer usage (unlikely for a personal tool).

---

## 10. Deployment

```dockerfile
# Dockerfile (sketch)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
CMD ["npm", "start"]
```

Run with `docker compose up -d` on your VPS or home server, mounting a volume for the SQLite file so data persists across container restarts.
