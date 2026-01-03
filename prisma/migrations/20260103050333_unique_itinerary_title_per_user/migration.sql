-- DropIndex
DROP INDEX "Itinerary_userId_idx";

-- CreateIndex
CREATE INDEX "Itinerary_userId_title_idx" ON "Itinerary"("userId", "title");
