import { SITE_URL, xmlEscape, absoluteUrl } from "../../../lib/seo";
const API=process.env.NEXT_PUBLIC_API_URL||"http://localhost:4000/api";
export const dynamic="force-dynamic";
export async function GET(){
  let xs:any[]=[];
  try{const r=await fetch(`${API}/brands`,{cache:"no-store"});if(r.ok)xs=await r.json()}catch{}
  const rows=xs.map(x=>`<url><loc>${xmlEscape(absoluteUrl(`/brand/${x.slug}`))}</loc><lastmod>${new Date(x.updatedAt||x.createdAt||Date.now()).toISOString()}</lastmod></url>`).join("");
  const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`;
  return new Response(xml,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=300, stale-while-revalidate=3600"}});
}
