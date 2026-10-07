# Gulshan Bazar SEO implementation

Implemented in the web app:
- Dynamic product metadata, canonical URLs and social cards.
- Product, offer, breadcrumb and safe structured data.
- Valid GTIN output only for 8/12/13/14 digit barcodes.
- XML escaping for sitemap values.
- Product sitemap index with 100 products per sitemap and image sitemap entries.
- Category and brand sitemaps with `lastmod`.
- Robots rules for private/admin/search areas.
- Query-string versions of product/category/brand URLs are `noindex,follow` with a clean canonical.
- Product listing image dimensions for layout stability.
- Custom 404 page.

Before production:
1. Set `NEXT_PUBLIC_SITE_URL` to the real HTTPS domain.
2. Set `NEXT_PUBLIC_API_URL` to the production API.
3. Run `npm ci` and `npm run build` in `apps/web`.
4. Deploy and submit `/sitemap.xml` in Google Search Console.
5. Validate structured data and Core Web Vitals after real products/images are imported.

## Automatic Product SEO on Import

Bulk CSV imports now automatically generate SEO data when the CSV leaves these fields blank:
- SEO-friendly slug from product name
- unique slug suffix when a collision exists
- meta title
- meta description
- SEO keywords
- barcode, unit and weight are preserved from the import template

Manual product create/update uses the same SEO generator. When a product slug changes, the API automatically creates a 301 redirect from the previous `/product/<slug>` URL to the new URL.

Explicit `metaTitle`, `metaDescription`, `seoKeywords`, or `slug` values in CSV/API requests are respected (and normalized), so custom SEO can still override the automatic defaults.
