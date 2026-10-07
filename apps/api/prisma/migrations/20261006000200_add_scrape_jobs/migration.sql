CREATE TABLE "ScrapeJob" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "total" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrapeJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ScrapeJobItem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "productId" TEXT,
  "productName" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrapeJobItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScrapeJob_status_idx" ON "ScrapeJob"("status");
CREATE INDEX "ScrapeJob_createdAt_idx" ON "ScrapeJob"("createdAt");
CREATE INDEX "ScrapeJobItem_jobId_status_idx" ON "ScrapeJobItem"("jobId", "status");
CREATE INDEX "ScrapeJobItem_createdAt_idx" ON "ScrapeJobItem"("createdAt");
ALTER TABLE "ScrapeJobItem" ADD CONSTRAINT "ScrapeJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScrapeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
