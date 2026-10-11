-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "imageId" TEXT;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
