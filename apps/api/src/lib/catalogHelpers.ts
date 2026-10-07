import { prisma } from "./prisma";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}
export async function resolveCategory(name?: string) {
  if (!name) return null;
  const slug = slugify(name);
  return prisma.category.upsert({ where: { slug }, update: { name }, create: { name, slug } });
}
export async function resolveBrand(name?: string) {
  if (!name) return null;
  const slug = slugify(name);
  return prisma.brand.upsert({ where: { slug }, update: { name }, create: { name, slug } });
}
