/*
  Warnings:

  - You are about to drop the column `rating` on the `Review` table. All the data in the column will be lost.
  - You are about to drop the `CoAuthor` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Salutation" AS ENUM ('Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Mx');

-- DropForeignKey
ALTER TABLE "public"."CoAuthor" DROP CONSTRAINT "CoAuthor_paperId_fkey";

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "rating";

-- DropTable
DROP TABLE "public"."CoAuthor";

-- CreateTable
CREATE TABLE "Author" (
    "id" SERIAL NOT NULL,
    "paperId" INTEGER NOT NULL,
    "salutation" "Salutation",
    "name" TEXT NOT NULL,
    "email" TEXT,
    "institute" TEXT,
    "isCorresponding" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Author" ADD CONSTRAINT "Author_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
