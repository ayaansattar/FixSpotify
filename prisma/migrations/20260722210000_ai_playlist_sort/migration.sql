-- AlterTable
ALTER TABLE "PlaylistPreference" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PlaylistTrackNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artistNames" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaylistTrackNote_playlistId_trackId_key" UNIQUE ("playlistId", "trackId")
);

-- CreateTable
CREATE TABLE "AiSortCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "sourcePlaylistId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "belongs" BOOLEAN NOT NULL,
    "suggestedPlaylistId" TEXT,
    "reason" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiSortCache_trackId_sourcePlaylistId_inputHash_key" UNIQUE ("trackId", "sourcePlaylistId", "inputHash")
);

-- CreateIndex
CREATE INDEX "PlaylistTrackNote_playlistId_idx" ON "PlaylistTrackNote"("playlistId");

-- CreateIndex
CREATE INDEX "AiSortCache_sourcePlaylistId_inputHash_idx" ON "AiSortCache"("sourcePlaylistId", "inputHash");

-- DropTable
DROP TABLE IF EXISTS "GenreCache";
