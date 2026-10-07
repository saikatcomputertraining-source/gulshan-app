# Gulshan Bazar E-commerce — Production Foundation

## Stack
- Next.js 15 storefront
- Express API
- PostgreSQL 16 + Prisma
- Redis 7
- Meilisearch 1.15
- Docker Compose
- Background import worker
- CSV + uploaded images -> WebP/AVIF -> PostgreSQL -> Meilisearch

## Production deployment
1. Install Docker and Nginx on Ubuntu 24.04.
2. Copy this folder to `/var/www/gulshan`.
3. `cp .env.example .env`
4. Replace every `CHANGE_...` value with strong random secrets.
5. Confirm DNS: `gulshanbazarbd.com`, `www.gulshanbazarbd.com`, and `api.gulshanbazarbd.com` point to the VPS.
6. Run `./deploy.sh`.
7. Copy `deploy/nginx/gulshan.conf` to `/etc/nginx/sites-available/gulshan`, enable it, then run `nginx -t && systemctl reload nginx`.
8. Run Certbot for all three domains to enable HTTPS.
9. Verify `https://api.gulshanbazarbd.com/api/health` and `https://gulshanbazarbd.com`.

## Important
- Never expose PostgreSQL, Redis, or Meilisearch directly to the Internet.
- Back up PostgreSQL and `/app/storage` before production imports.
- The current local filesystem image storage is suitable for a first production launch, but for very large catalogs use S3-compatible object storage + CDN.
- A million-product catalog needs a VPS sized for the workload and staged imports; do not attempt a million-row upload in one browser request.
- Payment gateway, courier API, tax/invoice rules, and advanced order management still require integration before accepting real customer orders.

## Operations

Create a database backup:

```bash
./deploy/scripts/backup.sh
```

Restore a backup (destructive; confirm first):

```bash
./deploy/scripts/restore-db.sh /var/www/gulshan /var/www/gulshan/backups/postgres-YYYYMMDD-HHMMSS.sql.gz
```

Enable the VPS firewall (run from a root SSH session and keep SSH allowed):

```bash
./deploy/scripts/security-ufw.sh
```

Backups should also be copied off-server (S3-compatible storage or another machine). A backup kept only on the same VPS is not disaster recovery.

## Large-catalog production architecture

For a large catalog, set `S3_ENABLED=true` and configure an S3-compatible bucket plus a CDN/public base URL. The API will generate WebP/AVIF and upload them to object storage instead of filling the VPS disk.

The import queue uses BullMQ backed by Redis. Set `IMPORT_WORKER_CONCURRENCY` conservatively based on CPU/RAM and image-processing capacity.

Run the included load test after deployment:

```bash
./load-test/run.sh https://gulshanbazarbd.com
```

Start with the default test and only increase load after checking CPU, RAM, PostgreSQL connections, Redis memory, Meilisearch memory and disk I/O. Do not run load tests against a live store while real customers are ordering.


## Invoice system
Admin users can open **Admin → Orders & Invoices → View / Print**. The API assigns a unique invoice number when an invoice is first opened and stores it on the order. The invoice page is print-friendly and browsers can use **Print → Save as PDF** to create a PDF copy.


## Auto Scrape Import (up to 1,000 URLs)

Admin → **Auto Scrape 1,000 URLs** accepts one product URL per line. URLs are deduplicated and queued in Redis/BullMQ. Each worker fetches the public product page, reads Product JSON-LD/OpenGraph/meta/HTML signals, imports name/price/brand/category/description, downloads up to five product images, converts them to WebP/AVIF through the existing storage pipeline, saves the product in PostgreSQL, and indexes it in Meilisearch.

Environment controls: `SCRAPER_CONCURRENCY` (default 3), `SCRAPER_DELAY_MS` (default 750), `SCRAPER_TIMEOUT_MS` (default 20000). The scraper rejects localhost/private IP targets to reduce SSRF risk. Use scraping only where you have permission and in accordance with the source site's robots.txt/terms.

## Complete e-commerce additions
- Customer registration/login/account/order history
- Wishlist and product reviews with admin approval
- Product detail pages, categories, brands, filters, sorting and pagination
- Sale price, featured products and SEO meta fields
- Admin order status + courier tracking fields
- Store settings for SSLCommerz/courier credentials and SEO verification
- Fallback database search when Meilisearch is unavailable
- robots.txt and sitemap.xml endpoints
- Existing CSV bulk import, image conversion, Redis/BullMQ, 1,000 URL scraper and Meilisearch retained

### Live provider setup
Payment/courier adapters are configuration-ready but require merchant credentials/API approval. Do not put real secrets in Git; use `.env.production` and the Admin Settings screen for non-secret store settings.

## Bulk product import
- Download the admin CSV template from `/api/admin/import-template`.
- Upload one CSV (max 8 MB) plus up to 3000 product images per batch; total CSV + images max 512 MB.
- Match `imageFile`, `image2`, and `image3` values to the uploaded image filenames.
- Import runs through BullMQ/Redis in the background, so large imports do not block the web request.
- Admin can monitor progress, inspect recent errors, download an error CSV, and retry a failed/completed job.
- Product SEO fields are auto-generated when omitted.
