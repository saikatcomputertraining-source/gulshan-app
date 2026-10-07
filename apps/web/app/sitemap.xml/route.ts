import { SITE_URL, xmlEscape } from "../../lib/seo";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
export const dynamic = "force-dynamic";

async function getProductPages() {
  try {
    const r = await fetch(`${API}/products?page=1&limit=1`, { cache: "no-store" });
    if (!r.ok) return 1;
    const d = await r.json();
    return Math.max(1, Math.ceil(Number(d.total || 0) / 100));
  } catch { return 1; }
}

export async function GET() {
  const pages = await getProductPages();
  const urls = Array.from({ length: pages }, (_, i) => `${SITE_URL}/sitemaps/products-${i + 1}.xml`);
  urls.push(`${SITE_URL}/sitemaps/categories.xml`, `${SITE_URL}/sitemaps/brands.xml`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<sitemap><loc>${xmlEscape(u)}</loc></sitemap>`).join("")}</sitemapindex>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
