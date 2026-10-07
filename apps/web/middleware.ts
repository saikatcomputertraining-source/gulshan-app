import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
export async function middleware(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(path.startsWith("/api/")||path.startsWith("/_next/")||path.startsWith("/admin")) return NextResponse.next();
  try{const api=process.env.NEXT_PUBLIC_API_URL;if(!api)return NextResponse.next();const r=await fetch(`${api}/redirect?path=${encodeURIComponent(path)}`,{cache:"no-store"});if(r.ok){const d=await r.json();const url=new URL(d.toPath,req.url);return NextResponse.redirect(url,d.code===301?301:302)}}catch{}
  return NextResponse.next();
}
export const config={matcher:["/product/:path*","/category/:path*","/brand/:path*"]};
