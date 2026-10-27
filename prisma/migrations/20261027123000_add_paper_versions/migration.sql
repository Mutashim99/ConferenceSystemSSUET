-- CreateTable
CREATE TABLE "PaperVersion" (
    "id" SERIAL NOT NULL,
    "paperId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperVersion_pkey" PRIMARY KEY ("id")
);

-- Backfill existing submissions before adding the foreign key.
INSERT INTO "PaperVersion" ("paperId", "versionNumber", "fileUrl", "submittedAt")
SELECT "id", 1, "fileUrl", "submittedAt"
FROM "Paper";

-- CreateIndex
CREATE UNIQUE INDEX "PaperVersion_paperId_versionNumber_key"
ON "PaperVersion"("paperId", "versionNumber");

-- CreateIndex
CREATE INDEX "PaperVersion_paperId_idx" ON "PaperVersion"("paperId");

-- AddForeignKey
ALTER TABLE "PaperVersion"
ADD CONSTRAINT "PaperVersion_paperId_fkey"
FOREIGN KEY ("paperId") REFERENCES "Paper"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
