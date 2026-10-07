import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";

const secret = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || "";
if (process.env.NODE_ENV === "production" && secret.length < 32) throw new Error("CUSTOMER_JWT_SECRET/JWT_SECRET must be set to a strong secret (32+ chars) in production.");
const effectiveSecret = secret || "change-this-customer-secret";
export async function hashCustomerPassword(password:string){ return bcrypt.hash(password, 12); }
export async function verifyCustomerPassword(password:string, hash:string){ return bcrypt.compare(password, hash); }
export function signCustomerToken(payload:{id:string}){ return jwt.sign(payload, effectiveSecret, {expiresIn:"30d"}); }
export function getCustomerId(req:Request): string | null {
  try { const h=String(req.headers.authorization||""); const token=h.startsWith("Bearer ")?h.slice(7):""; if(!token) return null; const decoded=jwt.verify(token,effectiveSecret) as any; return typeof decoded?.id === "string" ? decoded.id : null; } catch { return null; }
}
export function requireCustomer(req:Request,res:Response,next:NextFunction){
  try { const h=String(req.headers.authorization||""); const token=h.startsWith("Bearer ")?h.slice(7):""; if(!token) return res.status(401).json({message:"Customer login required"}); (req as any).customer=jwt.verify(token,effectiveSecret); next(); }
  catch { return res.status(401).json({message:"Invalid or expired customer token"}); }
}
