CREATE TABLE "Customer" (
  "id" TEXT NOT NULL, "email" TEXT, "passwordHash" TEXT, "name" TEXT NOT NULL, "mobile" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE TABLE "Address" (
  "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "label" TEXT NOT NULL DEFAULT 'Home', "name" TEXT NOT NULL, "mobile" TEXT NOT NULL,
  "address" TEXT NOT NULL, "city" TEXT NOT NULL DEFAULT 'Dhaka', "area" TEXT, "postalCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Wishlist" (
  "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "productId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Wishlist_customerId_productId_key" ON "Wishlist"("customerId","productId");
CREATE TABLE "ProductReview" (
  "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "productId" TEXT NOT NULL, "rating" INTEGER NOT NULL,
  "title" TEXT, "body" TEXT, "approved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductReview_customerId_productId_key" ON "ProductReview"("customerId","productId");
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Product" ADD COLUMN "shortDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "salePrice" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "metaTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN "metaDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Order" ADD COLUMN "email" TEXT;
ALTER TABLE "Order" ADD COLUMN "city" TEXT;
ALTER TABLE "Order" ADD COLUMN "area" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "Order" ADD COLUMN "courierProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN "courierTrackingId" TEXT;
ALTER TABLE "Order" ADD COLUMN "courierStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "notes" TEXT;
CREATE TABLE "StoreSetting" ("id" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "StoreSetting_key_key" ON "StoreSetting"("key");
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");
CREATE INDEX "ProductReview_productId_approved_idx" ON "ProductReview"("productId","approved");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE INDEX "Product_featured_idx" ON "Product"("featured");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
