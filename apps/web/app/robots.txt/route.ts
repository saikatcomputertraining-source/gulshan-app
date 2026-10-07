import { SITE_URL } from "../../lib/seo";

export const dynamic = "force-static";

export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /account",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /checkout",
    "Disallow: /wishlist",
    "Disallow: /search",
    "Disallow: /_next/",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ""
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
