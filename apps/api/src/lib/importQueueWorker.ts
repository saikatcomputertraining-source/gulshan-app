import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { parse } from "csv-parse";
import { prisma } from "./prisma";
import { indexProducts } from "./meili";
import { resolveCategory, resolveBrand } from "./catalogHelpers";
import { saveProductImage } from "./storage";
import { sanitizeHtml } from "./sanitize";
import { buildProductSeo, seoSlug } from "./seoProduct";
function slugify(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"item";}
const importRoot=()=>path.resolve(process.env.STORAGE_DIR||"./storage","imports");
async function imageUrlFor(jobId:string,row:any,field:string){
  if(row[field] && /^https?:\/\//i.test(String(row[field]))) return String(row[field]);
  const name=row[field] || (field==="imageUrl" ? row.imageFile : "");
  if(!name)return null;
  const file=path.join(importRoot(),jobId,"images",path.basename(String(name)));
  try{const b=await fs.readFile(file);const out=await saveProductImage(b,path.basename(file));return out.webp;}catch{return null;}
}
export async function processImportJob(jobId:string){
  const job=await prisma.importJob.findUnique({where:{id:jobId}}); if(!job)return;
  const csvFile=path.join(importRoot(),`${jobId}.csv`);
  try{
    await prisma.importJob.update({where:{id:jobId},data:{status:"PROCESSING"}});
    const parser=Readable.from(await fs.readFile(csvFile)).pipe(parse({columns:true,skip_empty_lines:true,trim:true}));
    let processed=job.processed||0,imported=job.imported||0,failed=job.failed||0,total=job.total||0; const errors:any[]=[]; let batch:any[]=[]; let rowNo=0;
    for await(const row of parser as any){rowNo++; if(rowNo<=processed) { total=Math.max(total,rowNo); continue; } batch.push(row); total++;if(batch.length>=100) {const result=await processBatch(jobId,batch);processed+=result.processed;imported+=result.imported;failed+=result.failed;errors.push(...result.errors);batch=[];await prisma.importJob.update({where:{id:jobId},data:{total,processed,imported,failed,errorLog:JSON.stringify(errors.slice(-100))}});}}
    if(batch.length){const result=await processBatch(jobId,batch);processed+=result.processed;imported+=result.imported;failed+=result.failed;errors.push(...result.errors);}
    await prisma.importJob.update({where:{id:jobId},data:{status:"COMPLETED",total,processed,imported,failed,errorLog:JSON.stringify(errors.slice(-100))}});
    // Keep source CSV/images until the admin explicitly cleans the job; this enables retry/resume after worker failures.
  }catch(e:any){await prisma.importJob.update({where:{id:jobId},data:{status:"FAILED",errorLog:String(e?.message||e)}}).catch(()=>{}); throw e;}
}

async function processBatch(jobId:string,rows:any[]){
  let processed=0,imported=0,failed=0;const errors:any[]=[];const docs:any[]=[];
  for(const row of rows){
    processed++;
    try{
      const name=String(row.name||"Untitled Product").trim()||"Untitled Product";
      const sku=String(row.sku||`GB-${Date.now()}-${processed}`).trim();
      const price=Number(row.price||0);
      const salePrice=row.salePrice===""||row.salePrice==null?null:Number(row.salePrice);
      const stock=Number(row.stock||0);
      if(!Number.isFinite(price)||price<0)throw new Error("Invalid price");
      if(salePrice!==null&&(!Number.isFinite(salePrice)||salePrice<0))throw new Error("Invalid sale price");
      if(!Number.isFinite(stock)||stock<0)throw new Error("Invalid stock");
      const [category,brand,imageUrl,image2,image3]=await Promise.all([resolveCategory(row.category),resolveBrand(row.brand),imageUrlFor(jobId,row,"imageUrl"),imageUrlFor(jobId,row,"image2"),imageUrlFor(jobId,row,"image3")]);
      const images=[imageUrl,image2,image3].filter(Boolean);
      const requestedSlug=String(row.slug||"").trim();
      const baseSlug=seoSlug(requestedSlug||name);
      let slug=baseSlug;
      const existing=await prisma.product.findFirst({where:{slug,NOT:{sku}},select:{id:true}});
      if(existing) slug=`${baseSlug}-${seoSlug(sku).slice(0,24)}`;
      const description=sanitizeHtml(String(row.description||""));
      const shortDescription=String(row.shortDescription||"").trim();
      const seo=buildProductSeo({name,description,shortDescription,categoryName:category?.name||null,brandName:brand?.name||null,slug,metaTitle:row.metaTitle||null,metaDescription:row.metaDescription||null,seoKeywords:row.seoKeywords||null});
      const data:any={sku,name,slug:seo.slug,description,shortDescription,price:String(price),stock,imageUrl:images[0]||null,images,categoryId:category?.id||null,brandId:brand?.id||null,salePrice:salePrice===null?null:String(salePrice),featured:String(row.featured||"").toLowerCase()==="true",metaTitle:seo.metaTitle,metaDescription:seo.metaDescription,seoKeywords:seo.seoKeywords,sourceUrl:row.sourceUrl||null,barcode:row.barcode||null,unit:row.unit||null,weight:row.weight==null||row.weight===""?null:String(row.weight)};
      const product=await prisma.product.upsert({where:{sku:data.sku},update:data,create:data,include:{category:true,brand:true}});
      docs.push(product);imported++;
    }catch(e:any){failed++;errors.push({row:row.__line||processed+1,message:e?.message||"Import failed"});}
  }
  if(docs.length) await indexProducts(docs);
  return {processed,imported,failed,errors};
}
