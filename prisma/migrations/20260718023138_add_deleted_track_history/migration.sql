-- CreateTable
CREATE TABLE "DeletedTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "playlistName" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artistNames" TEXT NOT NULL,
    "trackUri" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DeletedTrack_deletedAt_idx" ON "DeletedTrack"("deletedAt");

-- CreateIndex
CREATE INDEX "DeletedTrack_playlistId_idx" ON "DeletedTrack"("playlistId");
