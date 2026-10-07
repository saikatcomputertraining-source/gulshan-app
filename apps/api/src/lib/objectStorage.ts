import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT || undefined;
const bucket = process.env.S3_BUCKET || "";
const region = process.env.S3_REGION || "auto";
const publicBase = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const enabled = String(process.env.S3_ENABLED || "false").toLowerCase() === "true";

const client = enabled && bucket ? new S3Client({
  region,
  endpoint,
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "false").toLowerCase() === "true",
  credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  } : undefined,
}) : null;

export function objectStorageEnabled(){ return Boolean(client && bucket); }

export async function putObject(key:string, body:Buffer, contentType:string){
  if(!client || !bucket) throw new Error("S3 object storage is not configured");
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:contentType,CacheControl:"public,max-age=31536000,immutable"}));
  return publicBase ? `${publicBase}/${key}` : `${endpoint || ""}/${bucket}/${key}`;
}
