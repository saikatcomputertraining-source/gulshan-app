import { prisma } from "./prisma";

const host = process.env.MEILI_HOST || "http://localhost:7700";
const key = process.env.MEILI_MASTER_KEY || "";

function headers() {
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {})
  };
}

export async function configureSearch() {
  const common = { filterableAttributes: ["categoryId", "brandId", "isActive", "featured", "price", "stock"] };
  await fetch(`${host}/indexes/products/settings/filterable-attributes`, {
    method: "PUT", headers: headers(), body: JSON.stringify(common.filterableAttributes)
  });
  await fetch(`${host}/indexes/products/settings/searchable-attributes`, {
    method: "PUT", headers: headers(),
    body: JSON.stringify(["name", "sku", "brand", "category", "description"])
  });
  await fetch(`${host}/indexes/products/settings/sortable-attributes`, {
    method: "PUT", headers: headers(), body: JSON.stringify(["price", "stock", "createdAt"])
  });
}

function toDoc(p: any) {
  return {
    id: p.id, sku: p.sku, name: p.name, slug: p.slug,
    description: p.description, shortDescription: p.shortDescription || "", price: Number(p.price), salePrice: p.salePrice ? Number(p.salePrice) : null, stock: p.stock,
    imageUrl: p.imageUrl, images: p.images, isActive: p.isActive,
    categoryId: p.categoryId, brandId: p.brandId, featured: p.featured, metaTitle: p.metaTitle || "", metaDescription: p.metaDescription || "", sourceUrl: p.sourceUrl || "",
    category: p.category?.name || "", brand: p.brand?.name || "",
    createdAt: p.createdAt
  };
}

export async function indexProducts(products: any[]) {
  if (!products.length) return;
  await configureSearch();
  const docs = products.map(toDoc);
  const response = await fetch(`${host}/indexes/products/documents?primaryKey=id`, {
    method: "POST", headers: headers(), body: JSON.stringify(docs)
  });
  if (!response.ok) throw new Error(`Meilisearch indexing failed: ${response.status}`);
}

export async function indexProduct(product: any) {
  await indexProducts([product]);
}

export async function deleteIndexedProduct(id: string) {
  await fetch(`${host}/indexes/products/documents/${id}`, {
    method: "DELETE", headers: headers()
  });
}

export async function searchProducts(q: string) {
  const response = await fetch(`${host}/indexes/products/search`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      q, limit: 30,
      attributesToRetrieve: ["id","sku","name","slug","price","salePrice","stock","category","brand","imageUrl","images","featured"]
    })
  });
  if (!response.ok) throw new Error("Meilisearch request failed");
  return response.json();
}

export async function rebuildSearchIndex() {
  await configureSearch();
  const batchSize = 1000;
  let total = 0;
  let lastId: string | undefined;
  while (true) {
    const products = await prisma.product.findMany({
      include: { category: true, brand: true },
      orderBy: { id: "asc" },
      ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
      take: batchSize
    });
    if (!products.length) break;
    await indexProducts(products);
    total += products.length;
    lastId = products[products.length - 1].id;
    if (products.length < batchSize) break;
  }
  return total;
}
