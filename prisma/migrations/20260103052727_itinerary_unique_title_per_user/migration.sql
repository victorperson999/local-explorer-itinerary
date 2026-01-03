/*
  Warnings:

  - A unique constraint covering the columns `[userId,title]` on the table `Itinerary` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Itinerary_userId_title_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Itinerary_userId_title_key" ON "Itinerary"("userId", "title");
