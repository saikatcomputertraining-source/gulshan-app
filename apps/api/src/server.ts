import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import { parse } from "csv-parse/sync";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { prisma } from "./lib/prisma";
import { indexProduct, searchProducts, deleteIndexedProduct, rebuildSearchIndex } from "./lib/meili";
import { verifyPassword, signAdminToken, requireAdmin, makeTotpSecret, verifyTotp } from "./lib/auth";
import { hashCustomerPassword, verifyCustomerPassword, signCustomerToken, requireCustomer, getCustomerId } from "./lib/customerAuth";
import { saveProductImage } from "./lib/storage";
import { createImportJob, importQueue } from "./lib/importQueue";
import { createScrapeJob } from "./lib/scrapeQueue";
import { sanitizeHtml } from "./lib/sanitize";
import { buildProductSeo, seoSlug } from "./lib/seoProduct";

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const allowedOrigins = corsOrigin.split(",").map(s => s.trim()).filter(Boolean);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(cors({ origin(origin, cb) { if (!origin || allowedOrigins.includes(origin)) return cb(null, true); return cb(new Error("CORS origin denied")); } }));
app.use(express.json({ limit: "2mb", strict: true, verify: (req:any, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use((req,res,next)=>{ if(["POST","PUT","PATCH","DELETE"].includes(req.method)) res.setHeader("Cache-Control","no-store"); next(); });
app.use("/uploads", express.static(path.resolve(process.env.STORAGE_DIR || "./storage"), { maxAge: "30d", immutable: true }));

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try { const dir = path.resolve(process.env.STORAGE_DIR || "./storage", "upload-tmp"); await fs.mkdir(dir, { recursive: true }); cb(null, dir); }
      catch (e) { cb(e as Error, ""); }
    },
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}-${path.basename(file.originalname)}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 3001, fields: 100 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "file" && !file.originalname.toLowerCase().endsWith(".csv")) return cb(new Error("CSV file required"));
    if (file.fieldname === "images" && !file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  }
});

const buckets = new Map<string, { count: number; reset: number }>();
function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now > b.reset) buckets.set(key, { count: 1, reset: now + windowMs });
    else { b.count++; if (b.count > max) return res.status(429).json({ message: "Too many requests" }); }
    next();
  };
}

app.get("/api/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, database: true }); }
  catch { res.status(503).json({ ok: false, database: false }); }
});

app.post("/api/admin/login", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ message: "Email and password required" });
  const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) return res.status(401).json({ message: "Invalid credentials" });
  if(admin.twoFactorEnabled && (!req.body?.otp || !admin.twoFactorSecret || !verifyTotp(admin.twoFactorSecret,String(req.body.otp)))) return res.status(401).json({message:"2FA code required or invalid"});
  res.json({ token: signAdminToken({ id: admin.id, email: admin.email, role: admin.role }), admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
});

app.post("/api/admin/2fa/setup", requireAdmin, async(req,res)=>{const secret=makeTotpSecret();const a=await prisma.adminUser.update({where:{id:(req as any).admin.id},data:{twoFactorSecret:secret,twoFactorEnabled:false}});res.json({secret,otpauth:`otpauth://totp/Gulshan%20Bazar:${encodeURIComponent(a.email)}?secret=${secret}&issuer=Gulshan%20Bazar`})});
app.post("/api/admin/2fa/enable", requireAdmin, async(req,res)=>{const a=await prisma.adminUser.findUnique({where:{id:(req as any).admin.id}});if(!a?.twoFactorSecret||!verifyTotp(a.twoFactorSecret,String(req.body?.otp||"")))return res.status(400).json({message:"Invalid 2FA code"});await prisma.adminUser.update({where:{id:a.id},data:{twoFactorEnabled:true}});res.json({ok:true})});
app.post("/api/admin/2fa/disable", requireAdmin, async(req,res)=>{const a=await prisma.adminUser.findUnique({where:{id:(req as any).admin.id}});if(!a)return res.status(404).json({message:"Admin not found"});if(a.twoFactorEnabled&&!verifyTotp(a.twoFactorSecret||"",String(req.body?.otp||"")))return res.status(400).json({message:"Invalid 2FA code"});await prisma.adminUser.update({where:{id:a.id},data:{twoFactorEnabled:false,twoFactorSecret:null}});res.json({ok:true})});
app.get("/api/admin/me", requireAdmin, async (req, res) => {
  const a = await prisma.adminUser.findUnique({ where: { id: (req as any).admin.id }, select: { id: true, email: true, name: true, role: true } });
  if (!a) return res.status(401).json({ message: "Admin not found" });
  res.json(a);
});

app.post("/api/admin/upload-image", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Image required" });
  try { const buffer = await fs.readFile(req.file.path); const result = await saveProductImage(buffer, req.file.originalname); await fs.unlink(req.file.path).catch(() => {}); res.status(201).json(result); }
  catch { res.status(400).json({ message: "Image processing failed" }); }
});

app.get("/api/admin/import-jobs", requireAdmin, async (_req, res) => res.json(await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 50 })));
app.get("/api/admin/import-jobs/:id", requireAdmin, async (req, res) => {
  const job = await prisma.importJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ message: "Import job not found" });
  let errors: any[] = [];
  try { errors = job.errorLog ? JSON.parse(job.errorLog) : []; } catch { errors = [{ message: "Invalid error log" }]; }
  res.json({ ...job, errors });
});
app.get("/api/admin/import-jobs/:id/errors.csv", requireAdmin, async (req, res) => {
  const job = await prisma.importJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).send("Import job not found");
  let errors: any[] = [];
  try { errors = job.errorLog ? JSON.parse(job.errorLog) : []; } catch {}
  const csv = ["row,message", ...errors.map((e: any) => `${JSON.stringify(e.row ?? "")},${JSON.stringify(String(e.message ?? "Import failed").replace(/\r?\n/g, " "))}`)].join("\n") + "\n";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=import-errors-${job.id}.csv`);
  res.send(csv);
});
app.post("/api/admin/import-jobs/:id/retry", requireAdmin, async(req,res)=>{
  const job=await prisma.importJob.findUnique({where:{id:req.params.id}});
  if(!job)return res.status(404).json({message:"Import job not found"});
  if(["QUEUED","PROCESSING"].includes(job.status)) return res.status(409).json({message:"Import is already running"});
  if(job.status==="COMPLETED") return res.status(409).json({message:"Completed imports cannot be retried"});
  try{
    const csvPath=path.join(path.resolve(process.env.STORAGE_DIR||"./storage","imports"),`${job.id}.csv`);
    await fs.access(csvPath);
    await importQueue.add("process",{jobId:job.id},{jobId:`import-${job.id}-retry-${Date.now()}`});
    const j=await prisma.importJob.update({where:{id:job.id},data:{status:"QUEUED",processed:0,imported:0,failed:0,errorLog:null}});
    res.json(j);
  }catch{res.status(400).json({message:"Unable to retry import; source CSV may no longer exist"});}
});
app.post("/api/admin/scrape-import", requireAdmin, async (req, res) => {
  try {
    const raw = req.body?.urls;
    const urls = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [];
    const job = await createScrapeJob(urls);
    res.status(202).json(job);
  } catch (e: any) { res.status(400).json({ message: e?.message || "Unable to queue scrape import" }); }
});
app.get("/api/admin/scrape-jobs", requireAdmin, async (_req, res) => {
  const jobs = await prisma.scrapeJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  res.json(jobs);
});
app.get("/api/admin/scrape-jobs/:id", requireAdmin, async (req, res) => {
  const job = await prisma.scrapeJob.findUnique({ where: { id: req.params.id }, include: { items: { orderBy: { createdAt: "asc" }, take: 1000 } } });
  if (!job) return res.status(404).json({ message: "Scrape job not found" });
  res.json(job);
});
app.get("/api/admin/import-template", requireAdmin, (_req,res)=>{res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition","attachment; filename=products-template.csv");res.send("name,sku,slug,price,salePrice,stock,description,shortDescription,category,brand,featured,metaTitle,metaDescription,sourceUrl,barcode,unit,weight,seoKeywords,imageFile,image2,image3\nPepsi Cola,PEPSI-320,pepsi-cola-320,120,100,24,Imported soft drink,320ml,Beverages,Pepsi,true,Pepsi Cola,Imported soft drink,https://example.com/pepsi,123456789,pcs,0.32,soft drink,pepsi-320.jpg,,\n");});
app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  const [products, activeProducts, categories, brands, orders] = await Promise.all([
    prisma.product.count(), prisma.product.count({ where: { isActive: true } }), prisma.category.count(), prisma.brand.count(), prisma.order.count()
  ]);
  res.json({ products, activeProducts, categories, brands, orders });
});

app.post("/api/customer/register", rateLimit(8, 15*60*1000), async (req,res)=>{
  const {name,mobile,email,password}=req.body||{};
  if(typeof name!=="string"||typeof mobile!=="string"||typeof password!=="string"||password.length<8) return res.status(400).json({message:"Name, mobile and password (8+ chars) are required"});
  const normalizedEmail=typeof email==="string"&&email.trim()?email.trim().toLowerCase():null;
  try{
    if(normalizedEmail && await prisma.customer.findUnique({where:{email:normalizedEmail}})) return res.status(409).json({message:"Email already registered"});
    const customer=await prisma.customer.create({data:{name:name.trim(),mobile:mobile.trim(),email:normalizedEmail,passwordHash:await hashCustomerPassword(password)}});
    res.status(201).json({token:signCustomerToken({id:customer.id}),customer:{id:customer.id,name:customer.name,mobile:customer.mobile,email:customer.email}});
  }catch(e:any){res.status(400).json({message:e?.message||"Registration failed"});}
});
app.post("/api/customer/login", rateLimit(10, 15*60*1000), async(req,res)=>{
  const {email,password}=req.body||{}; const c=typeof email==="string"?await prisma.customer.findUnique({where:{email:email.toLowerCase().trim()}}):null;
  if(!c?.passwordHash || !(await verifyCustomerPassword(String(password||""),c.passwordHash))) return res.status(401).json({message:"Invalid credentials"});
  res.json({token:signCustomerToken({id:c.id}),customer:{id:c.id,name:c.name,mobile:c.mobile,email:c.email}});
});
app.get("/api/customer/me", requireCustomer, async(req,res)=>{const c=await prisma.customer.findUnique({where:{id:(req as any).customer.id},select:{id:true,name:true,mobile:true,email:true,createdAt:true}});if(!c)return res.status(404).json({message:"Customer not found"});res.json(c);});
app.get("/api/customer/orders", requireCustomer, async(req,res)=>res.json(await prisma.order.findMany({where:{customerId:(req as any).customer.id},include:{items:true},orderBy:{createdAt:"desc"}})));
app.get("/api/customer/wishlist", requireCustomer, async(req,res)=>res.json(await prisma.wishlist.findMany({where:{customerId:(req as any).customer.id},include:{product:true}})));
app.post("/api/customer/wishlist/:productId", requireCustomer, async(req,res)=>{try{const item=await prisma.wishlist.upsert({where:{customerId_productId:{customerId:(req as any).customer.id,productId:req.params.productId}},update:{},create:{customerId:(req as any).customer.id,productId:req.params.productId}});res.json(item);}catch{res.status(404).json({message:"Product not found"});}});
app.delete("/api/customer/wishlist/:productId", requireCustomer, async(req,res)=>{await prisma.wishlist.deleteMany({where:{customerId:(req as any).customer.id,productId:req.params.productId}});res.json({ok:true});});
app.post("/api/customer/reviews/:productId", requireCustomer, async(req,res)=>{const rating=Math.floor(Number(req.body?.rating));if(rating<1||rating>5)return res.status(400).json({message:"Rating must be 1-5"});try{const r=await prisma.productReview.upsert({where:{customerId_productId:{customerId:(req as any).customer.id,productId:req.params.productId}},update:{rating,title:req.body?.title||null,body:req.body?.body||null},create:{customerId:(req as any).customer.id,productId:req.params.productId,rating,title:req.body?.title||null,body:req.body?.body||null}});res.status(201).json(r);}catch{res.status(400).json({message:"Unable to review product"});}});

app.get("/api/products", async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 24)));
  const skip = (page - 1) * limit;
  const where:any = { isActive: true };
  if(req.query.categoryId) where.categoryId=String(req.query.categoryId);
  if(req.query.brandId) where.brandId=String(req.query.brandId);
  if(req.query.featured === "true") where.featured=true;
  if(req.query.minPrice) where.price={...(where.price||{}),gte:Number(req.query.minPrice)};
  if(req.query.maxPrice) where.price={...(where.price||{}),lte:Number(req.query.maxPrice)};
  if(req.query.q) where.OR=[{name:{contains:String(req.query.q),mode:"insensitive"}},{sku:{contains:String(req.query.q),mode:"insensitive"}}];
  const sort=String(req.query.sort||"newest");
  const orderBy:any=sort==="price_asc"?{price:"asc"}:sort==="price_desc"?{price:"desc"}:sort==="name"?{name:"asc"}:{createdAt:"desc"};
  const [items,total]=await Promise.all([
    prisma.product.findMany({where,include:{category:true,brand:true},orderBy,skip,take:limit}),
    prisma.product.count({where})
  ]);
  res.json({items,page,limit,total,pages:Math.ceil(total/limit)});
});

app.get("/api/products/:slug", async (req, res) => {
  const product = await prisma.product.findUnique({ where: { slug: req.params.slug }, include: { category: true, brand: true, variants: true, reviews: { where: { approved: true }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ hits: [] });
  try { res.json(await searchProducts(q)); } catch {
    const hits=await prisma.product.findMany({where:{isActive:true,OR:[{name:{contains:q,mode:"insensitive"}},{sku:{contains:q,mode:"insensitive"}}]},include:{category:true,brand:true},take:30});
    res.json({hits});
  }
});

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item"; }
function effectivePrice(p:any){ const sale=Number(p.salePrice); const regular=Number(p.price); return Number.isFinite(sale) && sale>0 && sale<regular ? sale : regular; }
async function audit(req:any, action:string, entity:string, entityId?:string, metadata?:any){ try{ await prisma.auditLog.create({data:{adminId:req?.admin?.id||null,action,entity,entityId:entityId||null,metadata:metadata??undefined}}); }catch{} }
async function quoteShipping(city?:string, area?:string, subtotal=0){ const zones=await prisma.shippingZone.findMany({where:{active:true}}); const hit=zones.find(z=>(!z.city||z.city.toLowerCase()===String(city||'').toLowerCase())&&(!z.area||z.area.toLowerCase()===String(area||'').toLowerCase())); if(!hit)return Number(process.env.DEFAULT_DELIVERY_CHARGE||0); if(hit.freeAbove!=null&&subtotal>=Number(hit.freeAbove))return 0; return Number(hit.charge); }
async function couponQuote(code:string|undefined, subtotal:number, customerId?:string|null){ if(!code)return {discount:0,coupon:null as any}; const coupon=await prisma.coupon.findUnique({where:{code:code.trim().toUpperCase()}}); if(!coupon||!coupon.active)return {discount:0,coupon:null}; const now=new Date(); if(coupon.startsAt&&now<coupon.startsAt || coupon.expiresAt&&now>coupon.expiresAt)return {discount:0,coupon:null}; if(coupon.usageLimit!=null&&coupon.usedCount>=coupon.usageLimit)return {discount:0,coupon:null}; if(coupon.minOrder!=null&&subtotal<Number(coupon.minOrder))return {discount:0,coupon:null}; if(customerId){const used=await prisma.couponRedemption.count({where:{couponId:coupon.id,customerId}}); if(used>=coupon.perCustomerLimit)return {discount:0,coupon:null};} let discount=coupon.type==='FIXED'?Number(coupon.value):subtotal*Number(coupon.value)/100; if(coupon.maxDiscount!=null)discount=Math.min(discount,Number(coupon.maxDiscount)); return {discount:Math.max(0,Math.min(discount,subtotal)),coupon}; }
async function resolveCategory(name?: string) { if (!name) return null; const slug=slugify(name); return prisma.category.upsert({where:{slug},update:{name},create:{name,slug}}); }
async function resolveBrand(name?: string) { if (!name) return null; const slug=slugify(name); return prisma.brand.upsert({where:{slug},update:{name},create:{name,slug}}); }
app.get("/api/categories", async (_req, res) => res.json(await prisma.category.findMany({ orderBy: { name: "asc" } })));
app.get("/api/brands", async (_req, res) => res.json(await prisma.brand.findMany({ orderBy: { name: "asc" } })));
app.post("/api/categories", requireAdmin, async (req,res)=>{const {name,slug}=req.body||{};if(!name)return res.status(400).json({message:"name required"});res.status(201).json(await prisma.category.create({data:{name,slug:slug||slugify(name)}}));});
app.post("/api/brands", requireAdmin, async (req,res)=>{const {name,slug}=req.body||{};if(!name)return res.status(400).json({message:"name required"});res.status(201).json(await prisma.brand.create({data:{name,slug:slug||slugify(name)}}));});

app.post("/api/products", requireAdmin, async (req, res) => {
  const { sku, name, slug, description = "", shortDescription = "", price = 0, salePrice, stock = 0, imageUrl, images = [], categoryId, brandId, featured=false, metaTitle, metaDescription, sourceUrl, barcode, unit, weight, seoKeywords } = req.body || {};
  const productName = String(name || "Untitled Product").trim() || "Untitled Product";
  const productSku = String(sku || `GB-${Date.now()}`).trim();
  try {
    const [category,brand] = await Promise.all([categoryId ? prisma.category.findUnique({where:{id:String(categoryId)}}) : null, brandId ? prisma.brand.findUnique({where:{id:String(brandId)}}) : null]);
    const productSlug = String(slug || seoSlug(productName)).trim();
    const seo=buildProductSeo({name:productName,description:String(description||""),shortDescription:String(shortDescription||""),categoryName:category?.name||null,brandName:brand?.name||null,slug:productSlug,metaTitle:metaTitle||null,metaDescription:metaDescription||null,seoKeywords:seoKeywords||null});
    const product=await prisma.product.create({data:{sku:productSku,name:productName,slug:seo.slug,description:sanitizeHtml(String(description||"")),price:String(price ?? 0),stock:Number(stock)||0,imageUrl:imageUrl||null,images:Array.isArray(images)?images:[],categoryId:categoryId||null,brandId:brandId||null,shortDescription:String(shortDescription||""),salePrice:salePrice===""||salePrice==null?null:String(salePrice),featured:Boolean(featured),metaTitle:seo.metaTitle,metaDescription:seo.metaDescription,sourceUrl:sourceUrl||null,barcode:barcode||null,unit:unit||null,weight:weight==null||weight===""?null:String(weight),seoKeywords:seo.seoKeywords},include:{category:true,brand:true}});
    await indexProduct(product); res.status(201).json(product);
  } catch(e:any){res.status(400).json({message:e?.message||"Unable to create product"});}
});
app.put("/api/products/:id", requireAdmin, async (req,res)=>{
  try{
    const {sku,name,slug,description="",shortDescription="",price,salePrice,stock=0,imageUrl,images=[],categoryId,brandId,isActive=true,featured=false,metaTitle,metaDescription,sourceUrl,barcode,unit,weight,seoKeywords}=req.body||{};
    const current=await prisma.product.findUnique({where:{id:req.params.id},select:{slug:true}});
    const [category,brand]=await Promise.all([categoryId?prisma.category.findUnique({where:{id:String(categoryId)}}):null,brandId?prisma.brand.findUnique({where:{id:String(brandId)}}):null]);
    const productName=String(name||"Untitled Product").trim()||"Untitled Product";
    const nextSlug=String(slug||seoSlug(productName)).trim();
    const seo=buildProductSeo({name:productName,description:String(description||""),shortDescription:String(shortDescription||""),categoryName:category?.name||null,brandName:brand?.name||null,slug:nextSlug,metaTitle:metaTitle||null,metaDescription:metaDescription||null,seoKeywords:seoKeywords||null});
    const p=await prisma.product.update({where:{id:req.params.id},data:{sku:String(sku),name:productName,slug:seo.slug,description:sanitizeHtml(String(description)),price:String(price),stock:Number(stock),imageUrl:imageUrl||null,images:Array.isArray(images)?images:[],categoryId:categoryId||null,brandId:brandId||null,isActive:Boolean(isActive),shortDescription:String(shortDescription||""),salePrice:salePrice===""||salePrice==null?null:String(salePrice),featured:Boolean(featured),metaTitle:seo.metaTitle,metaDescription:seo.metaDescription,sourceUrl:sourceUrl||null,barcode:barcode||null,unit:unit||null,weight:weight==null||weight===""?null:String(weight),seoKeywords:seo.seoKeywords},include:{category:true,brand:true}});
    if(current?.slug && current.slug!==p.slug){await prisma.redirect.upsert({where:{fromPath:`/product/${current.slug}`},update:{toPath:`/product/${p.slug}`,code:301,active:true},create:{fromPath:`/product/${current.slug}`,toPath:`/product/${p.slug}`,code:301,active:true}}).catch(()=>{});}
    await indexProduct(p);res.json(p);
  }catch(e:any){res.status(404).json({message:e?.message||"Product not found"});}
});
app.delete("/api/products/:id", requireAdmin, async (req,res)=>{try{await prisma.product.delete({where:{id:req.params.id}});await deleteIndexedProduct(req.params.id);res.json({ok:true});}catch{res.status(404).json({message:"Product not found"});}});

app.post("/api/products/import", requireAdmin, upload.fields([{name:"file",maxCount:1},{name:"images",maxCount:3000}]), async (req,res)=>{
  const files=req.files as { [fieldname:string]: Express.Multer.File[] } | undefined;
  const csv=files?.file?.[0];
  const images=files?.images||[];
  const filesToClean=[...(csv?[csv]:[]),...images];
  const cleanup=()=>Promise.all(filesToClean.map(f=>fs.unlink(f.path).catch(()=>{})));
  if(!csv){ await cleanup(); return res.status(400).json({message:"CSV file is required"}); }
  try {
    const totalBytes=csv.size+images.reduce((sum,f)=>sum+f.size,0);
    const maxBatchBytes=512*1024*1024;
    if(totalBytes>maxBatchBytes){ await cleanup(); return res.status(413).json({message:"Total CSV + images must be 512 MB or less per batch"}); }
    const job=await createImportJob(csv.originalname,csv.path,images.map(f=>({name:f.originalname,path:f.path,mimetype:f.mimetype})));
    res.status(202).json(job);
  } catch(e:any){
    await cleanup();
    res.status(400).json({message:e?.message||"Unable to queue import"});
  }
});

app.post("/api/admin/search/rebuild", requireAdmin, async (_req,res)=>{try{res.json({ok:true,indexed:await rebuildSearchIndex()});}catch(e:any){res.status(500).json({message:e?.message||"Index rebuild failed"});}});

app.post("/api/orders", rateLimit(30, 60*1000), async (req,res)=>{
  const {customerName,mobile,address,email,city,area,paymentMethod="COD",items,couponCode}=req.body||{};
  const authCustomerId=getCustomerId(req);
  if(typeof customerName!=="string"||typeof mobile!=="string"||typeof address!=="string"||!Array.isArray(items)||!items.length) return res.status(400).json({message:"customerName, mobile, address and items are required"});
  if(customerName.trim().length<2 || mobile.trim().length<7 || address.trim().length<5 || items.length>100) return res.status(400).json({message:"Invalid order data"});
  try {
    const normalized=items.map((item:any)=>({productId:String(item.productId),variantId:item.variantId?String(item.variantId):null,quantity:Math.max(1,Math.floor(Number(item.quantity)||0))}));
    const ids=[...new Set(normalized.map(x=>x.productId))];
    const products=await prisma.product.findMany({where:{id:{in:ids},isActive:true},include:{variants:true}});
    if(products.length!==ids.length)return res.status(400).json({message:"One or more products are unavailable"});
    const byId=new Map(products.map(p=>[p.id,p]));
    const lines=normalized.map(x=>{const product=byId.get(x.productId)!; const variant=x.variantId?product.variants.find(v=>v.id===x.variantId):null; if(x.variantId&&!variant) throw new Error("INVALID_VARIANT"); return {product,variant,quantity:x.quantity,price:variant?effectivePrice(variant):effectivePrice(product)};});
    if(lines.some(x=>x.quantity>(x.variant?.stock??x.product.stock)))return res.status(400).json({message:"Insufficient stock"});
    const subtotal=lines.reduce((sum,x)=>sum+x.price*x.quantity,0);
    const cq=await couponQuote(typeof couponCode==='string'?couponCode:undefined,subtotal,authCustomerId);
    if(couponCode&&!cq.coupon)return res.status(400).json({message:"Invalid, expired, or unavailable coupon"});
    const shipping=await quoteShipping(city,area,subtotal-cq.discount);
    const total=Math.max(0,subtotal-cq.discount+shipping);
    if(String(paymentMethod).toUpperCase()!=='COD'&&String(paymentMethod).toUpperCase()!=='ONLINE')return res.status(400).json({message:"Unsupported payment method"});
    const order=await prisma.$transaction(async tx=>{
      for(const line of lines){ if(line.variant){const updated=await tx.productVariant.updateMany({where:{id:line.variant.id,productId:line.product.id,stock:{gte:line.quantity}},data:{stock:{decrement:line.quantity}}});if(updated.count!==1)throw new Error("STOCK_CHANGED");} else {const updated=await tx.product.updateMany({where:{id:line.product.id,isActive:true,stock:{gte:line.quantity}},data:{stock:{decrement:line.quantity}}});if(updated.count!==1)throw new Error("STOCK_CHANGED");} }
      const o=await tx.order.create({data:{customerId:authCustomerId,customerName:customerName.trim(),mobile:mobile.trim(),email:email||null,city:city||null,area:area||null,address:address.trim(),paymentMethod:String(paymentMethod||"COD"),paymentStatus:String(paymentMethod||"COD")==="COD"?"UNPAID":"PENDING",subtotal,discount:cq.discount,shippingCharge:shipping,couponCode:cq.coupon?.code||null,total,items:{create:lines.map(x=>({productId:x.product.id,variantId:x.variant?.id||null,name:x.variant?`${x.product.name} - ${x.variant.name}`:x.product.name,sku:x.variant?.sku||x.product.sku,price:x.price,quantity:x.quantity}))}},include:{items:true}});
      if(cq.coupon) { await tx.coupon.update({where:{id:cq.coupon.id},data:{usedCount:{increment:1}}}); await tx.couponRedemption.create({data:{couponId:cq.coupon.id,customerId:authCustomerId,orderId:o.id,discount:cq.discount}}); }
      if(authCustomerId) await tx.notification.create({data:{customerId:authCustomerId,type:"ORDER",title:"Order placed",body:`Your order ${o.id} has been placed.`}});
      return o;
    });
    res.status(201).json(order);
  }catch(e:any){if(e?.message==="STOCK_CHANGED")return res.status(409).json({message:"Stock changed. Please try again."});if(e?.message==="INVALID_VARIANT")return res.status(400).json({message:"Invalid product variant"});res.status(500).json({message:e?.message||"Unable to create order"});}
});

app.get("/api/orders", requireAdmin, async (_req,res)=>res.json(await prisma.order.findMany({include:{items:true},orderBy:{createdAt:"desc"},take:100})));

app.put("/api/admin/orders/:id", requireAdmin, async(req,res)=>{try{const allowed=["PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED","RETURNED"];const status=String(req.body?.status||"");if(status&&!allowed.includes(status))return res.status(400).json({message:"Invalid order status"});const o=await prisma.$transaction(async tx=>{const current=await tx.order.findUnique({where:{id:req.params.id},include:{items:true}});if(!current)throw new Error("NOT_FOUND");const cancelling=(status==="CANCELLED"||status==="RETURNED")&&!current.stockRestored;if(cancelling){for(const item of current.items){if(item.variantId) await tx.productVariant.update({where:{id:item.variantId},data:{stock:{increment:item.quantity}}}); else await tx.product.update({where:{id:item.productId},data:{stock:{increment:item.quantity}}});}}const updated=await tx.order.update({where:{id:req.params.id},data:{...(status?{status}:{}),...(req.body?.paymentStatus?{paymentStatus:String(req.body.paymentStatus)}:{}),courierProvider:req.body?.courierProvider||null,courierTrackingId:req.body?.courierTrackingId||null,courierStatus:req.body?.courierStatus||null,notes:req.body?.notes||null,stockRestored:cancelling?true:current.stockRestored},include:{items:true}});if(updated.customerId&&status)await tx.notification.create({data:{customerId:updated.customerId,type:"ORDER_STATUS",title:`Order ${updated.status}`,body:`Your order ${updated.id} is now ${updated.status}.`}});return updated;});await audit(req,"ORDER_UPDATE","Order",o.id,{status});res.json(o);}catch(e:any){res.status(e?.message==="NOT_FOUND"?404:400).json({message:e?.message||"Order update failed"});}});
app.get("/api/admin/settings", requireAdmin, async(_req,res)=>{const rows=await prisma.storeSetting.findMany({orderBy:{key:"asc"}});res.json(Object.fromEntries(rows.map(x=>[x.key,x.value])));});
app.put("/api/admin/settings", requireAdmin, async(req,res)=>{const entries=req.body||{};for(const [key,value] of Object.entries(entries)){await prisma.storeSetting.upsert({where:{key},update:{value:String(value)},create:{key,value:String(value)}});}res.json({ok:true});});
app.get("/api/admin/reviews", requireAdmin, async(_req,res)=>res.json(await prisma.productReview.findMany({include:{product:{select:{name:true}},customer:{select:{name:true,mobile:true}},},orderBy:{createdAt:"desc"},take:200})));
app.put("/api/admin/reviews/:id", requireAdmin, async(req,res)=>{const r=await prisma.productReview.update({where:{id:req.params.id},data:{approved:Boolean(req.body?.approved)}});res.json(r);});

function makeInvoiceNumber(orderId: string) {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  return `GB-${date}-${orderId.slice(-8).toUpperCase()}`;
}

app.get("/api/admin/orders/:id/invoice", requireAdmin, async (req,res)=>{
  try {
    let order = await prisma.order.findUnique({where:{id:req.params.id},include:{items:true}});
    if(!order) return res.status(404).json({message:"Order not found"});
    if(!order.invoiceNumber) {
      const invoiceNumber = makeInvoiceNumber(order.id);
      order = await prisma.order.update({where:{id:order.id},data:{invoiceNumber,invoiceIssuedAt:new Date()},include:{items:true}});
    }
    res.json({order, invoiceNumber: order.invoiceNumber, invoiceIssuedAt: order.invoiceIssuedAt});
  } catch { res.status(500).json({message:"Unable to create invoice"}); }
});

// Customer return/refund workflow and public order tracking.
app.get("/api/orders/track", rateLimit(60, 60*1000), async (req,res)=>{
  const orderId=String(req.query.orderId||"").trim();
  const mobile=String(req.query.mobile||"").replace(/\s+/g,"");
  if(!orderId||mobile.length<7)return res.status(400).json({message:"Order ID and mobile are required"});
  const order=await prisma.order.findFirst({where:{id:orderId,mobile},select:{id:true,customerName:true,status:true,paymentStatus:true,paymentMethod:true,courierProvider:true,courierTrackingId:true,courierStatus:true,total:true,createdAt:true,updatedAt:true,items:{select:{id:true,name:true,quantity:true,sku:true,price:true}}}});
  if(!order)return res.status(404).json({message:"Order not found. Check your Order ID and mobile number."});
  res.json(order);
});

app.get("/api/customer/return-requests", requireCustomer, async(req,res)=>{
  const rows=await prisma.returnRequest.findMany({where:{customerId:(req as any).customer.id},include:{order:{select:{id:true,status:true}},orderItem:{select:{name:true,sku:true,quantity:true,price:true}}},orderBy:{createdAt:"desc"}});
  res.json(rows);
});
app.post("/api/customer/orders/:id/return-request", requireCustomer, async(req,res)=>{
  const customerId=(req as any).customer.id;
  const {orderItemId,quantity,reason}=req.body||{};
  const q=Math.floor(Number(quantity));
  if(!orderItemId||!reason||q<1)return res.status(400).json({message:"Order item, quantity and reason are required"});
  const order=await prisma.order.findFirst({where:{id:req.params.id,customerId},include:{items:true}});
  if(!order)return res.status(404).json({message:"Order not found"});
  if(order.status!=="DELIVERED")return res.status(400).json({message:"Returns can be requested after delivery."});
  const item=order.items.find(x=>x.id===String(orderItemId));
  if(!item||q>item.quantity)return res.status(400).json({message:"Invalid item or quantity"});
  const existing=await prisma.returnRequest.findFirst({where:{orderItemId:item.id,status:{in:["REQUESTED","APPROVED","PICKUP_SCHEDULED"]}}});
  if(existing)return res.status(409).json({message:"A return request is already active for this item."});
  const rr=await prisma.returnRequest.create({data:{customerId,orderId:order.id,orderItemId:item.id,quantity:q,reason:String(reason).trim().slice(0,1000)}});
  res.status(201).json(rr);
});

app.get("/api/admin/return-requests", requireAdmin, async(_req,res)=>res.json(await prisma.returnRequest.findMany({include:{order:{select:{id:true,customerName:true,mobile:true,status:true,total:true}},orderItem:{select:{name:true,sku:true,quantity:true,price:true}}},orderBy:{createdAt:"desc"},take:500})));
app.put("/api/admin/return-requests/:id", requireAdmin, async(req,res)=>{
  const allowed=["REQUESTED","APPROVED","PICKUP_SCHEDULED","RECEIVED","REFUNDED","REJECTED","CANCELLED"];
  const status=String(req.body?.status||"");
  if(!allowed.includes(status))return res.status(400).json({message:"Invalid return status"});
  try{
    const rr=await prisma.returnRequest.update({where:{id:req.params.id},data:{status,resolution:req.body?.resolution||null,refundAmount:req.body?.refundAmount==null?null:String(req.body.refundAmount),adminNote:req.body?.adminNote||null},include:{order:{select:{id:true,customerId:true}}}});
    if(rr.order.customerId)await prisma.notification.create({data:{customerId:rr.order.customerId,type:"RETURN_STATUS",title:`Return ${rr.status}`,body:`Your return request for order ${rr.order.id} is now ${rr.status}.`}});
    await audit(req,"RETURN_UPDATE","ReturnRequest",rr.id,{status});
    res.json(rr);
  }catch{res.status(404).json({message:"Return request not found"});}
});

// Commerce management: addresses, coupons, shipping, redirects, variants, notifications, analytics, payment/courier hooks.
app.get("/api/customer/addresses", requireCustomer, async(req,res)=>res.json(await prisma.address.findMany({where:{customerId:(req as any).customer.id},orderBy:[{isDefault:"desc"},{createdAt:"desc"}]})));
app.post("/api/customer/addresses", requireCustomer, async(req,res)=>{const c=(req as any).customer.id;const d=req.body||{};if(!d.name||!d.mobile||!d.address)return res.status(400).json({message:"name, mobile and address required"});const isDefault=Boolean(d.isDefault);const a=await prisma.$transaction(async tx=>{if(isDefault)await tx.address.updateMany({where:{customerId:c},data:{isDefault:false}});return tx.address.create({data:{customerId:c,label:d.label||"Home",name:d.name,mobile:d.mobile,address:d.address,city:d.city||"Dhaka",area:d.area||null,postalCode:d.postalCode||null,isDefault}})});res.status(201).json(a)});
app.put("/api/customer/addresses/:id", requireCustomer, async(req,res)=>{const c=(req as any).customer.id;const d=req.body||{};try{const a=await prisma.$transaction(async tx=>{const existing=await tx.address.findFirst({where:{id:req.params.id,customerId:c}});if(!existing)throw new Error("NOT_FOUND");if(d.isDefault)await tx.address.updateMany({where:{customerId:c},data:{isDefault:false}});return tx.address.update({where:{id:existing.id},data:{label:d.label||"Home",name:d.name,mobile:d.mobile,address:d.address,city:d.city||"Dhaka",area:d.area||null,postalCode:d.postalCode||null,isDefault:Boolean(d.isDefault)}})});res.json(a)}catch{res.status(404).json({message:"Address not found"})}});
app.delete("/api/customer/addresses/:id", requireCustomer, async(req,res)=>{await prisma.address.deleteMany({where:{id:req.params.id,customerId:(req as any).customer.id}});res.json({ok:true})});
app.get("/api/customer/notifications",requireCustomer,async(req,res)=>res.json(await prisma.notification.findMany({where:{customerId:(req as any).customer.id},orderBy:{createdAt:"desc"},take:100})));
app.put("/api/customer/notifications/:id/read",requireCustomer,async(req,res)=>{await prisma.notification.updateMany({where:{id:req.params.id,customerId:(req as any).customer.id},data:{read:true}});res.json({ok:true})});
app.post("/api/checkout/quote",rateLimit(60,60*1000),async(req,res)=>{try{const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length||items.length>100)return res.status(400).json({message:"Invalid items"});const ids=[...new Set(items.map((x:any)=>String(x.productId)))];const ps=await prisma.product.findMany({where:{id:{in:ids},isActive:true},include:{variants:true}});const map=new Map(ps.map(p=>[p.id,p]));let subtotal=0;for(const x of items){const p=map.get(String(x.productId));const q=Math.max(1,Math.floor(Number(x.quantity)||0));const v=x.variantId?p?.variants.find(v=>v.id===String(x.variantId)):null;if(!p||x.variantId&&!v)return res.status(400).json({message:"Invalid product or variant"});const stock=v?.stock??p.stock;if(q>stock)return res.status(400).json({message:"Invalid product or stock"});subtotal+=(v?effectivePrice(v):effectivePrice(p))*q;}const customerId=getCustomerId(req);const c=await couponQuote(req.body?.couponCode,subtotal,customerId);const shipping=await quoteShipping(req.body?.city,req.body?.area,subtotal-c.discount);res.json({subtotal,discount:c.discount,shipping,total:Math.max(0,subtotal-c.discount+shipping),coupon:c.coupon?.code||null})}catch{res.status(400).json({message:"Unable to calculate quote"})}});
app.get("/api/admin/coupons",requireAdmin,async(_req,res)=>res.json(await prisma.coupon.findMany({orderBy:{createdAt:"desc"}})));
app.post("/api/admin/coupons",requireAdmin,async(req,res)=>{const d=req.body||{};if(!d.code)return res.status(400).json({message:"code required"});try{const c=await prisma.coupon.create({data:{code:String(d.code).trim().toUpperCase(),type:d.type||"PERCENT",value:String(d.value||0),minOrder:d.minOrder==null?null:String(d.minOrder),maxDiscount:d.maxDiscount==null?null:String(d.maxDiscount),usageLimit:d.usageLimit==null?null:Number(d.usageLimit),perCustomerLimit:Number(d.perCustomerLimit||1),startsAt:d.startsAt?new Date(d.startsAt):null,expiresAt:d.expiresAt?new Date(d.expiresAt):null,active:d.active!==false}});await audit(req,"CREATE","Coupon",c.id);res.status(201).json(c)}catch(e:any){res.status(400).json({message:e?.message||"Coupon create failed"})}});
app.put("/api/admin/coupons/:id",requireAdmin,async(req,res)=>{try{const d=req.body||{};const c=await prisma.coupon.update({where:{id:req.params.id},data:{type:d.type,value:String(d.value),minOrder:d.minOrder==null?null:String(d.minOrder),maxDiscount:d.maxDiscount==null?null:String(d.maxDiscount),usageLimit:d.usageLimit==null?null:Number(d.usageLimit),perCustomerLimit:Number(d.perCustomerLimit||1),startsAt:d.startsAt?new Date(d.startsAt):null,expiresAt:d.expiresAt?new Date(d.expiresAt):null,active:Boolean(d.active)}});await audit(req,"UPDATE","Coupon",c.id);res.json(c)}catch{res.status(404).json({message:"Coupon not found"})}});
app.delete("/api/admin/coupons/:id",requireAdmin,async(req,res)=>{await prisma.coupon.update({where:{id:req.params.id},data:{active:false}});res.json({ok:true})});
app.get("/api/admin/shipping-zones",requireAdmin,async(_req,res)=>res.json(await prisma.shippingZone.findMany({orderBy:{createdAt:"desc"}})));
app.post("/api/admin/shipping-zones",requireAdmin,async(req,res)=>{const d=req.body||{};const z=await prisma.shippingZone.create({data:{name:d.name||"Zone",city:d.city||null,area:d.area||null,charge:String(d.charge||0),freeAbove:d.freeAbove==null?null:String(d.freeAbove),active:d.active!==false}});res.status(201).json(z)});
app.put("/api/admin/shipping-zones/:id",requireAdmin,async(req,res)=>{try{const d=req.body||{};res.json(await prisma.shippingZone.update({where:{id:req.params.id},data:{name:d.name,city:d.city||null,area:d.area||null,charge:String(d.charge||0),freeAbove:d.freeAbove==null?null:String(d.freeAbove),active:Boolean(d.active)}}))}catch{res.status(404).json({message:"Shipping zone not found"})}});
app.delete("/api/admin/shipping-zones/:id",requireAdmin,async(req,res)=>{await prisma.shippingZone.delete({where:{id:req.params.id}});res.json({ok:true})});
app.get("/api/admin/redirects",requireAdmin,async(_req,res)=>res.json(await prisma.redirect.findMany({orderBy:{createdAt:"desc"}})));
app.post("/api/admin/redirects",requireAdmin,async(req,res)=>{const d=req.body||{};if(!d.fromPath||!d.toPath)return res.status(400).json({message:"fromPath and toPath required"});res.status(201).json(await prisma.redirect.create({data:{fromPath:d.fromPath,toPath:d.toPath,code:Number(d.code||301),active:d.active!==false}}))});
app.put("/api/admin/redirects/:id",requireAdmin,async(req,res)=>{res.json(await prisma.redirect.update({where:{id:req.params.id},data:{fromPath:req.body.fromPath,toPath:req.body.toPath,code:Number(req.body.code||301),active:Boolean(req.body.active)}}))});
app.delete("/api/admin/redirects/:id",requireAdmin,async(req,res)=>{await prisma.redirect.delete({where:{id:req.params.id}});res.json({ok:true})});
app.get("/api/redirect",async(req,res)=>{const r=await prisma.redirect.findFirst({where:{fromPath:String(req.query.path||""),active:true}});if(!r)return res.status(404).json({message:"Redirect not found"});res.json(r)});
app.post("/api/admin/products/:id/variants",requireAdmin,async(req,res)=>{try{const d=req.body||{};const v=await prisma.productVariant.create({data:{productId:req.params.id,sku:d.sku,name:d.name||"Variant",attributes:d.attributes||{},price:String(d.price||0),salePrice:d.salePrice==null?null:String(d.salePrice),stock:Number(d.stock||0),imageUrl:d.imageUrl||null}});await audit(req,"CREATE","ProductVariant",v.id);res.status(201).json(v)}catch(e:any){res.status(400).json({message:e?.message||"Variant create failed"})}});
app.put("/api/admin/variants/:id",requireAdmin,async(req,res)=>{try{const d=req.body||{};res.json(await prisma.productVariant.update({where:{id:req.params.id},data:{sku:d.sku,name:d.name,attributes:d.attributes||{},price:String(d.price),salePrice:d.salePrice==null?null:String(d.salePrice),stock:Number(d.stock||0),imageUrl:d.imageUrl||null}}))}catch{res.status(404).json({message:"Variant not found"})}});
app.delete("/api/admin/variants/:id",requireAdmin,async(req,res)=>{await prisma.productVariant.delete({where:{id:req.params.id}});res.json({ok:true})});
app.get("/api/admin/audit-logs",requireAdmin,async(req,res)=>res.json(await prisma.auditLog.findMany({orderBy:{createdAt:"desc"},take:500})));
app.post("/api/events",rateLimit(120,60*1000),async(req,res)=>{try{await prisma.siteEvent.create({data:{type:String(req.body?.type||"page_view"),path:req.body?.path||null,productId:req.body?.productId||null,orderId:req.body?.orderId||null,metadata:req.body?.metadata||undefined}});res.status(204).end()}catch{res.status(204).end()}});
app.get("/api/admin/analytics",requireAdmin,async(req,res)=>{const since=new Date(Date.now()-30*86400000);const [views,orders,revenue,top]=await Promise.all([prisma.siteEvent.count({where:{type:"page_view",createdAt:{gte:since}}}),prisma.order.count({where:{createdAt:{gte:since}}}),prisma.order.aggregate({where:{createdAt:{gte:since},status:{notIn:["CANCELLED","RETURNED"]}},_sum:{total:true}}),prisma.orderItem.groupBy({by:["productId","name"],_sum:{quantity:true},orderBy:{_sum:{quantity:"desc"}},take:10})]);res.json({views,orders,revenue:Number(revenue._sum.total||0),topProducts:top})});
async function getSetting(key:string, fallback="") {
  const row = await prisma.storeSetting.findUnique({where:{key}});
  return row?.value ?? fallback;
}
function verifyWebhookSignature(req:any, secret:string){
  if(!secret) return false;
  const supplied=String(req.headers["x-webhook-signature"]||"");
  if(!supplied || !req.rawBody) return false;
  const expected=crypto.createHmac("sha256",secret).update(req.rawBody).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)); } catch { return false; }
}
app.post("/api/admin/orders/:id/courier/create",requireAdmin,async(req,res)=>{try{
  const o=await prisma.order.findUnique({where:{id:req.params.id},include:{items:true}});
  if(!o)return res.status(404).json({message:"Order not found"});
  const base=(await getSetting("courierBaseUrl",process.env.COURIER_BASE_URL||"")).replace(/\/$/,"");
  const key=await getSetting("courierApiKey",process.env.COURIER_API_KEY||"");
  const provider=await getSetting("courierProvider",process.env.COURIER_PROVIDER||"CUSTOM");
  if(!base||!key)return res.status(400).json({message:"Courier credentials are not configured"});
  const r=await fetch(`${base}/orders`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({invoice:o.invoiceNumber||o.id,recipient_name:o.customerName,recipient_phone:o.mobile,recipient_address:o.address,amount:Number(o.total),items:o.items})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return res.status(502).json({message:"Courier API failed",details:d});
  const trackingId=d.trackingId||d.tracking_id||d.consignment_id||d.id;
  const updated=await prisma.order.update({where:{id:o.id},data:{courierProvider:provider,courierTrackingId:trackingId?String(trackingId):null,courierStatus:d.status||"CREATED",status:"SHIPPED"}});
  await audit(req,"COURIER_CREATE","Order",o.id,{trackingId});res.json(updated);
}catch(e:any){res.status(500).json({message:e?.message||"Courier request failed"})}});
app.post("/api/payment/webhook",async(req,res)=>{
  const secret=await getSetting("paymentWebhookSecret",process.env.PAYMENT_WEBHOOK_SECRET||"");
  if(!verifyWebhookSignature(req,secret)) return res.status(401).json({message:"Invalid webhook signature"});
  const orderId=String(req.body?.orderId||""); if(!orderId)return res.status(400).json({message:"orderId required"});
  const status=String(req.body?.status||"").toUpperCase(); const paymentStatus=status==="SUCCESS"?"PAID":status==="FAILED"?"FAILED":"PENDING";
  const o=await prisma.order.update({where:{id:orderId},data:{paymentStatus}}); res.json({ok:true,orderId:o.id,paymentStatus:o.paymentStatus});
});
app.post("/api/courier/webhook",async(req,res)=>{
  const secret=await getSetting("courierWebhookSecret",process.env.COURIER_WEBHOOK_SECRET||"");
  if(!verifyWebhookSignature(req,secret)) return res.status(401).json({message:"Invalid webhook signature"});
  const trackingId=String(req.body?.trackingId||req.body?.tracking_id||""); if(!trackingId)return res.status(400).json({message:"trackingId required"});
  const status=String(req.body?.status||"UPDATED"); const o=await prisma.order.findFirst({where:{courierTrackingId:trackingId}});
  if(!o)return res.status(404).json({message:"Order not found"});
  const upper=status.toUpperCase(); const nextStatus=upper.includes("DELIV")?"DELIVERED":upper.includes("CANCEL")?"CANCELLED":upper.includes("SHIP")?"SHIPPED":o.status;
  await prisma.order.update({where:{id:o.id},data:{courierStatus:status,status:nextStatus}}); res.json({ok:true});
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => { console.error(err); if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({message:"Uploaded file is too large"}); res.status(400).json({message:err?.message||"Request failed"}); });


app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const message = err?.message === "CORS origin denied" ? "CORS origin denied" : "Request failed";
  res.status(err?.status || 500).json({ message });
});

app.listen(port,()=>console.log(`API running on http://localhost:${port}`));

process.on("SIGTERM", async ()=>{ await prisma.$disconnect(); process.exit(0); });
process.on("SIGINT", async ()=>{ await prisma.$disconnect(); process.exit(0); });
