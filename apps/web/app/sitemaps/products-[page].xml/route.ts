import { SITE_URL, absoluteUrl, xmlEscape, imageUrl } from "../../../lib/seo";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const n = Math.max(1, Number(page) || 1);
  let items: any[] = [];
  try {
    const r = await fetch(`${API}/products?page=${n}&limit=100`, { cache: "no-store" });
    if (r.ok) { const d = await r.json(); items = d.items || []; }
  } catch {}
  const rows = items.map(p => {
    const imgs = [p.imageUrl, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);
    const imageXml = imgs.map((x:string) => `<image:image><image:loc>${xmlEscape(imageUrl(x))}</image:loc><image:title>${xmlEscape(p.name)}</image:title></image:image>`).join("");
    return `<url><loc>${xmlEscape(absoluteUrl(`/product/${p.slug}`))}</loc><lastmod>${new Date(p.updatedAt || p.createdAt || Date.now()).toISOString()}</lastmod>${imageXml}</url>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${rows}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
