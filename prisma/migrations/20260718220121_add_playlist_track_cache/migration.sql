-- CreateTable
CREATE TABLE "PlaylistTrackCache" (
    "playlistId" TEXT NOT NULL PRIMARY KEY,
    "tracks" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
