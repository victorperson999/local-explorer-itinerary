-- CreateTable
CREATE TABLE "PlacesQueryCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "q" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "radius" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION,
    "long" DOUBLE PRECISION,
    "results" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacesQueryCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlacesQueryCache_key_key" ON "PlacesQueryCache"("key");

-- CreateIndex
CREATE INDEX "PlacesQueryCache_expiresAt_idx" ON "PlacesQueryCache"("expiresAt");
