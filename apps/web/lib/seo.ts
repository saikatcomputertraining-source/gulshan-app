export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "Gulshan Bazar";
export const DEFAULT_DESCRIPTION = "Shop products online in Bangladesh from Gulshan Bazar. Discover products, brands and categories with fast search and convenient delivery.";

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function imageUrl(value: unknown) {
  if (!value) return undefined;
  return absoluteUrl(String(value));
}

export function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function validGtin(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits) ? digits : undefined;
}

export function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function truncate(value: unknown, max = 160, fallback = DEFAULT_DESCRIPTION) {
  const text = cleanText(value, fallback);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function productTitle(p: any) {
  return truncate(p?.metaTitle || `Buy ${p?.name || "Product"} in Bangladesh | ${SITE_NAME}`, 70, SITE_NAME);
}

export function productDescription(p: any) {
  return truncate(p?.metaDescription || p?.shortDescription || p?.description, 160);
}

export function categoryTitle(c: any) {
  return truncate(c?.metaTitle || `${c?.name || "Category"} | ${SITE_NAME}`, 70, SITE_NAME);
}

export function brandTitle(b: any) {
  return truncate(b?.metaTitle || `${b?.name || "Brand"} Products in Bangladesh | ${SITE_NAME}`, 70, SITE_NAME);
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
