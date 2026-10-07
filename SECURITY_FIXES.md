# Security / Bug Fixes

This build includes fixes for the audit findings:

- Docker web build no longer fails because `apps/web/public` is present.
- Admin TOTP now uses a real Base32 secret and validates 20-byte decoded secrets.
- Payment and courier webhooks require HMAC-SHA256 `X-Webhook-Signature` using their configured secrets.
- Courier settings saved in Admin Settings are used by the courier create endpoint, with environment fallback.
- Scraper redirects are manually followed with public-host validation at every hop; image downloads are validated as images.
- Product descriptions are sanitized server-side before storage/import to reduce HTML/XSS risk.
- Duplicate commerce routes were removed.
- Product variants now flow through product detail, cart, checkout quote, order creation, stock decrement, and cancellation stock restore.
- Bulk image import processes imageFile/image2/image3 instead of leaving secondary filenames unresolved.
- Product JSON-LD escapes `<`, `>`, and `&` before insertion into the script element.

## Webhook signing

For both payment and courier webhooks send:

`X-Webhook-Signature: <hex HMAC-SHA256(raw-request-body, secret)>`

Set `PAYMENT_WEBHOOK_SECRET` and `COURIER_WEBHOOK_SECRET` in production, or save the same values as `paymentWebhookSecret` / `courierWebhookSecret` in Admin Settings.

## Validation note

The source was statically checked in this environment. Full npm dependency installation and Docker image builds could not be completed here because package installation timed out and Docker is unavailable in the execution environment. Run `npm ci`, `npm run build:api`, `npm run build:web`, and `docker compose build` on the deployment machine before going live.
