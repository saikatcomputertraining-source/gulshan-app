import type { Metadata } from "next";
import ProductGrid from "./product-grid";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, safeJsonLd } from "../lib/seo";
import { SiteHeader } from "./site-shell";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: SITE_NAME, description: DEFAULT_DESCRIPTION, url: SITE_URL, type: "website" }
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      { "@type": "WebSite", name: SITE_NAME, url: SITE_URL, potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } }
    ]
  };
  return <main><SiteHeader /><section className="hero"><div className="container"><span className="badge">Fast • COD • Bulk Import • Meilisearch</span><h1>Everything you need, in one place.</h1><p>Shop products online in Bangladesh with fast search, useful categories and convenient delivery.</p><a className="button" href="#products">Shop products</a></div></section><section className="container trustStrip"><div><b>Cash on Delivery</b><span>Convenient checkout</span></div><div><b>Secure Shopping</b><span>Protected customer data</span></div><div><b>Order Tracking</b><span>Track from one place</span></div><div><b>Easy Returns</b><span>Request returns after delivery</span></div></section><section id="products" className="container section"><div className="sectionHead"><div><span className="eyebrow">GULSHAN BAZAR</span><h2>Latest Products</h2><p>Discover active products, useful categories and current offers.</p></div><a className="textLink" href="/search">View all products →</a></div><ProductGrid/></section><script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(jsonLd)}} /></main>;
}
