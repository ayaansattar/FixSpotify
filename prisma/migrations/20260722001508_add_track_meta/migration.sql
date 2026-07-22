-- CreateTable
CREATE TABLE "TrackMeta" (
    "trackId" TEXT NOT NULL PRIMARY KEY,
    "isrc" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "artistName" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TrackMeta_isrc_idx" ON "TrackMeta"("isrc");
