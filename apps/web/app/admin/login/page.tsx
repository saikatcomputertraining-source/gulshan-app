"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
export default function Login(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[otp,setOtp]=useState(""),[error,setError]=useState(""); const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setError("");const body:any={email,password};if(otp.trim())body.otp=otp.trim();const r=await fetch(`${API}/admin/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){setError(d.message||"Login failed");return}localStorage.setItem("admin_token",d.token);router.push("/admin");}
 return <main className="login"><form onSubmit={submit} className="loginCard"><h1>Admin Login</h1><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" autoComplete="username" required/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required/><input inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} placeholder="2FA code (if enabled)" autoComplete="one-time-code"/><button className="button">Login</button>{error&&<p className="error">{error}</p>}</form></main>
}
