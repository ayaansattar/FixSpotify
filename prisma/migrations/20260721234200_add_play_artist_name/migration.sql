-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Play" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL DEFAULT '',
    "playedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Play" ("artistId", "createdAt", "id", "playedAt", "trackId", "trackName") SELECT "artistId", "createdAt", "id", "playedAt", "trackId", "trackName" FROM "Play";
DROP TABLE "Play";
ALTER TABLE "new_Play" RENAME TO "Play";
CREATE INDEX "Play_trackId_idx" ON "Play"("trackId");
CREATE INDEX "Play_playedAt_idx" ON "Play"("playedAt");
CREATE INDEX "Play_trackName_idx" ON "Play"("trackName");
CREATE UNIQUE INDEX "Play_trackId_playedAt_key" ON "Play"("trackId", "playedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
