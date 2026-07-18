-- CreateTable
CREATE TABLE "PlaylistPreference" (
    "playlistId" TEXT NOT NULL PRIMARY KEY,
    "position" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistPreference_position_key" ON "PlaylistPreference"("position");
