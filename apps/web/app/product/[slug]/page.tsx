import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductClient from "./product-client";
import { absoluteUrl, imageUrl, productDescription, productTitle, safeJsonLd, SITE_URL, validGtin } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

async function getProduct(slug: string) {
  try {
    const r = await fetch(`${API}/products/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  if (Object.keys(sp).length) return { title: "Product", robots: { index: false, follow: true }, alternates: { canonical: absoluteUrl(`/product/${slug}`) } };
  const p = await getProduct(slug);
  if (!p) return { title: "Product not found", robots: { index: false, follow: true } };
  const url = absoluteUrl(`/product/${p.slug}`);
  return {
    title: productTitle(p), description: productDescription(p),
    alternates: { canonical: url },
    robots: { index: Boolean(p.isActive !== false), follow: true, "max-image-preview": "large" },
    openGraph: { type: "website", url, title: productTitle(p), description: productDescription(p), images: p.imageUrl ? [{ url: imageUrl(p.imageUrl)!, alt: p.name }] : undefined },
    twitter: { card: "summary_large_image", title: productTitle(p), description: productDescription(p), images: p.imageUrl ? [imageUrl(p.imageUrl)!] : undefined }
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p || p.isActive === false) notFound();
  const price = Number(p.salePrice && Number(p.salePrice) < Number(p.price) ? p.salePrice : p.price || 0);
  const stock = p.variants?.length ? p.variants.reduce((n: number, v: any) => n + Number(v.stock || 0), 0) : Number(p.stock || 0);
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name,
    url: absoluteUrl(`/product/${p.slug}`),
    mainEntityOfPage: absoluteUrl(`/product/${p.slug}`),
    image: (p.images?.length ? p.images : (p.imageUrl ? [p.imageUrl] : [])).map((x:string) => imageUrl(x)).filter(Boolean),
    description: productDescription(p), sku: p.sku || undefined, mpn: p.sku || undefined,
    ...(validGtin(p.barcode) ? { gtin: validGtin(p.barcode) } : {}),
    brand: p.brand?.name ? { "@type": "Brand", name: p.brand.name } : undefined,
    offers: { "@type": "Offer", url: absoluteUrl(`/product/${p.slug}`), price: String(price), priceCurrency: "BDT", availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition" },
    aggregateRating: p.reviews?.length ? { "@type": "AggregateRating", ratingValue: (p.reviews.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / p.reviews.length).toFixed(1), reviewCount: p.reviews.length } : undefined
  };
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    ...(p.category ? [{ "@type": "ListItem", position: 2, name: p.category.name, item: absoluteUrl(`/category/${p.category.slug}`) }] : []),
    { "@type": "ListItem", position: p.category ? 3 : 2, name: p.name, item: absoluteUrl(`/product/${p.slug}`) }
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(jsonLd)}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(breadcrumb)}}/><ProductClient product={p}/></>;
}
