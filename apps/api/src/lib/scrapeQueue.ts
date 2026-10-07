import { Queue } from "bullmq";
import { prisma } from "./prisma";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const u = new URL(redisUrl);
const connection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  username: u.username || undefined,
  password: u.password || undefined,
  db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
};

export const scrapeQueue = new Queue("product-scrape", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
  },
});

export async function createScrapeJob(urls: string[]) {
  const clean = [...new Set(urls.map(x => String(x).trim()).filter(Boolean))];
  if (!clean.length) throw new Error("At least one product URL is required");
  if (clean.length > 1000) throw new Error("Maximum 1,000 URLs per job");
  for (const raw of clean) {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Only HTTP/HTTPS URLs are allowed: ${raw}`);
  }
  const job = await prisma.scrapeJob.create({ data: { total: clean.length } });
  await prisma.scrapeJobItem.createMany({ data: clean.map(url => ({ jobId: job.id, url })) });
  const items = await prisma.scrapeJobItem.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" }, select: { id: true, url: true } });
  await scrapeQueue.addBulk(items.map((item, index) => ({ name: "scrape", data: { itemId: item.id, jobId: job.id, url: item.url, index } })));
  return job;
}
