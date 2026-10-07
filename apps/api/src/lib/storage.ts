import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { objectStorageEnabled, putObject } from "./objectStorage";
const root=path.resolve(process.env.STORAGE_DIR||"./storage");
const publicBase=process.env.PUBLIC_UPLOAD_URL||"http://localhost:4000/uploads";
export async function saveProductImage(buffer:Buffer,originalName:string){
  const ext=path.extname(originalName);const safe=path.basename(originalName,ext).replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,80)||"image";
  const id=`${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${safe}`;
  const webpName=`${id}.webp`,avifName=`${id}.avif`;
  const base=sharp(buffer).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true});
  const webp=await base.clone().webp({quality:82}).toBuffer();
  const avif=await base.clone().avif({quality:60}).toBuffer();
  if(objectStorageEnabled()){
    const [webpUrl,avifUrl]=await Promise.all([putObject(`products/${webpName}`,webp,"image/webp"),putObject(`products/${avifName}`,avif,"image/avif")]);
    return {webp:webpUrl,avif:avifUrl};
  }
  const dir=path.join(root,"products");await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,webpName),webp);await fs.writeFile(path.join(dir,avifName),avif);
  return{webp:`${publicBase}/products/${webpName}`,avif:`${publicBase}/products/${avifName}`};
}
