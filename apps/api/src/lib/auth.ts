import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) console.warn("WARNING: JWT_SECRET should be at least 32 characters in production.");
if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) throw new Error("JWT_SECRET must be set to a strong secret (32+ chars) in production.");
const jwtSecret = secret || "dev-only-secret-change-me-please";
export async function hashPassword(password:string){return bcrypt.hash(password,12)}
export async function verifyPassword(password:string,hash:string){return bcrypt.compare(password,hash)}
export function signAdminToken(payload:{id:string;email:string;role:string}){return jwt.sign(payload,jwtSecret,{expiresIn:"12h",issuer:"gulshan-api",audience:"gulshan-admin"})}
export function requireAdmin(req:Request,res:Response,next:NextFunction){const header=req.headers.authorization||"";const token=header.startsWith("Bearer ")?header.slice(7):"";if(!token)return res.status(401).json({message:"Authentication required"});try{(req as any).admin=jwt.verify(token,jwtSecret,{issuer:"gulshan-api",audience:"gulshan-admin"});next()}catch{res.status(401).json({message:"Invalid or expired token"})}}
const B32="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function makeTotpSecret(){let out="";const bytes=crypto.randomBytes(20);let buffer=0,bits=0;for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=B32[(buffer>>bits)&31];}}if(bits)out+=B32[(buffer<<(5-bits))&31];return out;}
function base32Decode(input:string){let buffer=0,bits=0;const out:number[]=[];for(const ch of input.toUpperCase().replace(/=+$/,"")){const v=B32.indexOf(ch);if(v<0)continue;buffer=(buffer<<5)|v;bits+=5;if(bits>=8){bits-=8;out.push((buffer>>bits)&255);}}return Buffer.from(out);}
export function verifyTotp(secret:string,code:string,window=1){if(!/^\d{6}$/.test(code))return false;const key=base32Decode(secret);if(key.length!==20)return false;const counter=Math.floor(Date.now()/30000);for(let w=-window;w<=window;w++){const b=Buffer.alloc(8);b.writeBigInt64BE(BigInt(counter+w));const h=crypto.createHmac("sha1",key).update(b).digest();const o=h[h.length-1]&15;const n=((h[o]&127)<<24)|((h[o+1]&255)<<16)|((h[o+2]&255)<<8)|(h[o+3]&255);if(String(n%1000000).padStart(6,"0")===code)return true;}return false;}
