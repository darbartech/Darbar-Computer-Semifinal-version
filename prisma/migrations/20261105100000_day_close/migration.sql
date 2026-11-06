-- Day close (fix guide §2). A counted day has to stop taking writes: without this
-- table a receipt could be dated into a day whose cash was already handed over,
-- and the day book would no longer match the drawer. `day` is the Kathmandu
-- calendar date as UTC midnight, which is what a `@db.Date` column holds.

-- CreateTable
CREATE TABLE "DayClose" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "cashCounted" INTEGER,
    "note" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayClose_day_key" ON "DayClose"("day");

-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
