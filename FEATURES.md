# Gulshan Bazar — Final Feature Set

## Catalog
- Product CRUD, sale pricing, SKU/barcode/unit/weight, SEO fields
- Categories, nested categories, brands
- Product variants with per-variant SKU/price/sale price/stock/attributes
- CSV + ZIP-style multi-image bulk workflow
- Background BullMQ imports, progress, retry/resume behavior, failed-row log
- 1,000 URL scraper queue with image processing
- WebP/AVIF conversion and local/S3-compatible storage

## Storefront
- Product detail, cart, Buy Now, search, category/brand browsing
- Meilisearch + database fallback
- Wishlist, reviews, customer account, saved addresses, notifications
- COD checkout, sale-price checkout, coupon and shipping quote
- Product JSON-LD, sitemap, robots and redirect manager

## Orders
- Transactional stock reservation/decrement
- Sale price used for order totals
- Coupon discount + shipping charge + subtotal stored separately
- Order status workflow and automatic stock restoration on cancellation/return
- Invoice numbering
- Courier configuration + generic courier create/webhook adapter
- Payment webhook status adapter; SSLCommerz/bKash/Nagad credentials remain provider-dependent

## Admin
- Dashboard, products, bulk import, scraper, search rebuild
- Order management, invoices, commerce settings
- Coupons, shipping zones, 301 redirects, analytics, audit logs
- TOTP 2FA setup/enable/disable
- Rate limiting, security headers, strict customer/order ownership

## Production requirements
- PostgreSQL, Redis, Meilisearch
- Use S3/R2-compatible object storage for large catalogs
- Configure real payment/courier merchant credentials before live transactions
- Run Prisma migration before starting API/worker
