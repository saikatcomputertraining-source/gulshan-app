import dns from "dns/promises";
import net from "net";
import { saveProductImage } from "./storage";

const timeoutMs = Math.max(5000, Number(process.env.SCRAPER_TIMEOUT_MS || 20000));
const userAgent = process.env.SCRAPER_USER_AGENT || "GulshanBazarProductImporter/1.0 (+admin product import)";

function cleanText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").replace(/&nbsp;/gi, " ").trim();
}
function decodeHtml(v: string) {
  return v.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function stripHtml(v: string) { return cleanText(decodeHtml(v.replace(/<[^>]*>/g, " "))); }
function absolute(raw: string, base: string) { try { return new URL(raw, base).toString(); } catch { return ""; } }
function firstMeta(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i");
    const m = html.match(re1) || html.match(re2);
    if (m?.[1]) return decodeHtml(m[1]);
  }
  return "";
}
function firstTagText(html: string, tag: string) { const m = html.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "i")); return m ? stripHtml(m[1]) : ""; }
function parseJsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed); else out.push(parsed);
    } catch {}
  }
  return out;
}
function findProductJson(nodes: any[]): any {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some((x: any) => String(x).toLowerCase() === "product")) return node;
    if (Array.isArray(node.itemListElement)) { const p = findProductJson(node.itemListElement.map((x: any) => x?.item || x)); if (p) return p; }
    if (node.mainEntity) { const p = findProductJson([node.mainEntity]); if (p) return p; }
  }
  return undefined;
}
function priceFromOffer(offer: any) { return offer?.price ?? offer?.lowPrice ?? offer?.highPrice ?? ""; }
function extractImages(product: any, html: string, base: string) {
  const candidates: string[] = [];
  const push = (x: any) => { if (typeof x === "string") candidates.push(x); else if (x?.url) candidates.push(String(x.url)); };
  const imgs = product?.image; if (Array.isArray(imgs)) imgs.forEach(push); else push(imgs);
  push(firstMeta(html, ["og:image", "twitter:image"]));
  for (const m of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)) candidates.push(m[1]);
  return [...new Set(candidates.map(x => absolute(x, base)).filter(x => /^https?:\/\//i.test(x)))].slice(0, 5);
}
async function assertPublicHost(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(hostname) || hostname.endsWith(".local")) throw new Error("Private/local URLs are not allowed");
  const ips = net.isIP(hostname) ? [hostname] : await dns.lookup(hostname, { all: true }).then(rows => rows.map(x => x.address));
  for (const ip of ips) {
    if (net.isIPv4(ip)) {
      const [a,b] = ip.split(".").map(Number);
      if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) throw new Error("Private/local IP is not allowed");
    } else if (net.isIPv6(ip) && (ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80:"))) throw new Error("Private/local IP is not allowed");
  }
}
async function fetchBuffer(url: string, maxBytes: number, expectedImage=false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current=url;
    for(let hop=0; hop<6; hop++){
      const parsed=new URL(current);
      if(parsed.protocol!=="http:" && parsed.protocol!=="https:") throw new Error("Only HTTP(S) URLs are allowed");
      await assertPublicHost(parsed);
      const r=await fetch(parsed.toString(), {headers:{"user-agent":userAgent,accept:expectedImage?"image/avif,image/webp,image/png,image/jpeg,image/*":"text/html,application/xhtml+xml,*/*"},redirect:"manual",signal:controller.signal});
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get("location");
        if(!location) throw new Error("Redirect without location");
        current=new URL(location,parsed).toString();
        continue;
      }
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const type=r.headers.get("content-type")||"";
      if(expectedImage && !type.toLowerCase().startsWith("image/")) throw new Error("Expected image content");
      const len=Number(r.headers.get("content-length")||0); if(len>maxBytes) throw new Error("Response too large");
      const b=Buffer.from(await r.arrayBuffer()); if(b.length>maxBytes) throw new Error("Response too large");
      await assertPublicHost(new URL(current));
      return {buffer:b,contentType:type,finalUrl:current};
    }
    throw new Error("Too many redirects");
  } finally { clearTimeout(timer); }
}
export async function scrapeProduct(url: string) {
  const source = new URL(url); await assertPublicHost(source);
  const page = await fetchBuffer(source.toString(), 5 * 1024 * 1024, false);
  const html = page.buffer.toString("utf8");
  const nodes = parseJsonLd(html); const product = findProductJson(nodes) || {};
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const name = cleanText(product.name) || firstMeta(html, ["og:title", "twitter:title"]) || firstTagText(html, "title");
  if (!name) throw new Error("Product name not found");
  const description = cleanText(product.description) || firstMeta(html, ["description", "og:description"]) || "";
  const brand = cleanText(typeof product.brand === "object" ? product.brand?.name : product.brand) || "";
  const category = cleanText(product.category) || "";
  const price = priceFromOffer(offers) || firstMeta(html, ["product:price:amount", "og:price:amount"]);
  const sku = cleanText(product.sku || product.mpn || product.productID) || "";
  const stock = /outofstock/i.test(String(offers?.availability || "")) ? 0 : Number(product.inventoryLevel || product.stock || 0) || 0;
  const imageUrls = extractImages(product, html, page.finalUrl || source.toString());
  const images: string[] = [];
  for (const imageUrl of imageUrls) {
    try {
      const image = await fetchBuffer(imageUrl, 8 * 1024 * 1024, true);
      if (!image.contentType.toLowerCase().startsWith("image/") && !/\.(jpe?g|png|webp|avif|gif)(?:\?|$)/i.test(imageUrl)) continue;
      const saved = await saveProductImage(image.buffer, imageUrl.split("/").pop() || "product-image.jpg");
      images.push(saved.webp);
    } catch {}
  }
  const finalPrice = Number(String(price).replace(/[^0-9.]/g, ""));
  return {
    sourceUrl: url,
    name,
    sku,
    price: Number.isFinite(finalPrice) ? finalPrice : 0,
    stock,
    description,
    brand,
    category,
    imageUrls,
    images: images.slice(0, 5),
  };
}
