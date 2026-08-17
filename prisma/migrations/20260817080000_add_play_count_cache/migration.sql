-- CreateTable
CREATE TABLE "PlayCountCache" (
    "cacheKey" TEXT NOT NULL PRIMARY KEY,
    "counts" TEXT NOT NULL,
    "historyVersion" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
