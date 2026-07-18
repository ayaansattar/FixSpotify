-- CreateTable
CREATE TABLE "ShuffleDeck" (
    "playlistId" TEXT NOT NULL PRIMARY KEY,
    "usedTrackIds" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
