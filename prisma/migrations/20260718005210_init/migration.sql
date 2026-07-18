-- CreateTable
CREATE TABLE "Play" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "playedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GenreCache" (
    "artistId" TEXT NOT NULL PRIMARY KEY,
    "genres" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlaylistSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Play_trackId_idx" ON "Play"("trackId");

-- CreateIndex
CREATE INDEX "Play_playedAt_idx" ON "Play"("playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Play_trackId_playedAt_key" ON "Play"("trackId", "playedAt");

-- CreateIndex
CREATE INDEX "PlaylistSnapshot_playlistId_idx" ON "PlaylistSnapshot"("playlistId");
