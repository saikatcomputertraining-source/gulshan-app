import { Worker } from "bullmq";
import { prisma } from "./prisma";
import { scrapeProduct } from "./scraper";
import { resolveBrand, resolveCategory } from "./catalogHelpers";
import { indexProduct } from "./meili";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const u = new URL(redisUrl);
const connection = { host: u.hostname, port: Number(u.port || 6379), username: u.username || undefined, password: u.password || undefined, db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined };
function slugify(v: string) { return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product"; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function processScrapeItem(itemId: string, jobId: string, url: string) {
  await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });
  await prisma.scrapeJobItem.update({ where: { id: itemId }, data: { status: "PROCESSING", error: null } });
  try {
    const data = await scrapeProduct(url);
    const category = await resolveCategory(data.category);
    const brand = await resolveBrand(data.brand);
    const baseSku = data.sku || `GB-SCR-${Date.now()}-${itemId.slice(-6)}`;
    const slug = `${slugify(data.name)}-${itemId.slice(-6)}`;
    const product = await prisma.product.upsert({
      where: { sku: baseSku },
      update: { name: data.name, slug, description: data.description, price: String(data.price), stock: data.stock, imageUrl: data.images[0] || null, images: data.images.slice(0, 5), categoryId: category?.id || null, brandId: brand?.id || null, isActive: true },
      create: { sku: baseSku, name: data.name, slug, description: data.description, price: String(data.price), stock: data.stock, imageUrl: data.images[0] || null, images: data.images.slice(0, 5), categoryId: category?.id || null, brandId: brand?.id || null, isActive: true },
      include: { category: true, brand: true },
    });
    await indexProduct(product);
    await prisma.scrapeJobItem.update({ where: { id: itemId }, data: { status: "IMPORTED", productId: product.id, productName: product.name } });
    await prisma.scrapeJob.update({ where: { id: jobId }, data: { processed: { increment: 1 }, imported: { increment: 1 } } });
  } catch (e: any) {
    await prisma.scrapeJobItem.update({ where: { id: itemId }, data: { status: "FAILED", error: String(e?.message || "Scrape failed").slice(0, 1000) } });
    await prisma.scrapeJob.update({ where: { id: jobId }, data: { processed: { increment: 1 }, failed: { increment: 1 } } });
  } finally {
    await sleep(Math.max(0, Number(process.env.SCRAPER_DELAY_MS || 750)));
    const remaining = await prisma.scrapeJobItem.count({ where: { jobId, status: { in: ["QUEUED", "PROCESSING"] } } });
    if (!remaining) await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
  }
}

export function startScrapeWorker() {
  const concurrency = Math.max(1, Math.min(6, Number(process.env.SCRAPER_CONCURRENCY || 3)));
  const worker = new Worker("product-scrape", async job => processScrapeItem(String(job.data.itemId), String(job.data.jobId), String(job.data.url)), { connection, concurrency, lockDuration: 180000 });
  worker.on("failed", (job, err) => console.error("Scrape job failed", job?.id, err));
  return worker;
}
