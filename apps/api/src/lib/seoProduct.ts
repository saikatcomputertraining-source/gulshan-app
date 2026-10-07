export function seoSlug(value: string) {
  return String(value || "product")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "product";
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export function buildProductSeo(input: {
  name: string;
  description?: string;
  shortDescription?: string;
  categoryName?: string | null;
  brandName?: string | null;
  slug?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  seoKeywords?: string | null;
}) {
  const name = cleanText(input.name, 160) || "Product";
  const brand = cleanText(input.brandName, 80);
  const category = cleanText(input.categoryName, 80);
  const slug = seoSlug(input.slug || name);

  const autoTitle = `${name}${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? ` | ${brand}` : ""} | Gulshan Bazar`;
  const title = cleanText(input.metaTitle || autoTitle, 60);

  const source = cleanText(input.metaDescription || input.shortDescription || input.description, 240);
  const context = [brand, category].filter(Boolean).join(" • ");
  const autoDescription = source
    ? `${source}${context ? ` ${context}.` : ""} Shop online at Gulshan Bazar.`
    : `Buy ${name}${brand ? ` by ${brand}` : ""}${category ? ` in ${category}` : ""} from Gulshan Bazar. Check price, availability and product details online.`;
  const description = cleanText(autoDescription, 155);

  const keywords = cleanText(input.seoKeywords || [name, brand, category, "Gulshan Bazar", "Bangladesh"].filter(Boolean).join(", "), 255);

  return { slug, metaTitle: title, metaDescription: description, seoKeywords: keywords };
}
