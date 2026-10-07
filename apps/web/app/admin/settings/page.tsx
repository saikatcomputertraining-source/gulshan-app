"use client";
import {useEffect,useState} from "react";
const API=process.env.NEXT_PUBLIC_API_URL||"http://localhost:4000/api";
const h=()=>({Authorization:`Bearer ${localStorage.getItem("admin_token")||""}`});
export default function Settings(){
 const [s,setS]=useState<any>({}); const [msg,setMsg]=useState(""); const [otp,setOtp]=useState(""); const [secret,setSecret]=useState("");
 useEffect(()=>{fetch(`${API}/admin/settings`,{headers:h()}).then(async r=>{if(r.status===401)location.href="/admin/login";else setS(await r.json())})},[]);
 const save=async()=>{const r=await fetch(`${API}/admin/settings`,{method:"PUT",headers:{...h(),"Content-Type":"application/json"},body:JSON.stringify(s)});setMsg(r.ok?"Settings saved":"Save failed")};
 const setup=async()=>{const r=await fetch(`${API}/admin/2fa/setup`,{method:"POST",headers:h()});const d=await r.json();if(r.ok)setSecret(d.secret);setMsg(r.ok?`Authenticator secret: ${d.secret}`:d.message||"Setup failed")};
 const enable=async()=>{const r=await fetch(`${API}/admin/2fa/enable`,{method:"POST",headers:{...h(),"Content-Type":"application/json"},body:JSON.stringify({otp})});setMsg(r.ok?"2FA enabled":"Invalid code")};
 const disable=async()=>{const r=await fetch(`${API}/admin/2fa/disable`,{method:"POST",headers:{...h(),"Content-Type":"application/json"},body:JSON.stringify({otp})});setMsg(r.ok?"2FA disabled":"Invalid code")};
 const fields=[["storeName","Store name"],["storePhone","Store phone"],["storeEmail","Store email"],["storeAddress","Store address"],["currency","Currency"],["sslcommerzStoreId","SSLCommerz Store ID"],["sslcommerzStorePassword","SSLCommerz Store Password"],["sslcommerzLive","SSLCommerz Live (true/false)"],["courierProvider","Courier provider"],["paymentWebhookSecret","Payment webhook secret"],["courierWebhookSecret","Courier webhook secret"],["courierApiKey","Courier API key"],["courierSecret","Courier secret"],["courierBaseUrl","Courier API base URL"],["defaultDeliveryCharge","Default delivery charge"],["googleSiteVerification","Google site verification"],["facebookPixelId","Facebook Pixel ID"]];
 return <main className="admin"><div className="adminTop"><div><h1>Store Settings</h1><p>Payment, courier, SEO and security configuration.</p></div><a className="button secondary" href="/admin">← Admin</a></div>
 <section className="adminCard editor">{fields.map(([k,l])=><label key={k}>{l}<input type={k.toLowerCase().includes("password")||k.toLowerCase().includes("secret")?"password":"text"} value={s[k]||""} onChange={e=>setS({...s,[k]:e.target.value})}/></label>)}<button className="button" onClick={save}>Save Settings</button>
 <hr/><h2>Admin 2FA</h2><button className="button secondary" onClick={setup}>Generate 2FA Secret</button>{secret&&<><p className="formHint">Add this secret to Google Authenticator/Authy: <b>{secret}</b></p><input placeholder="6-digit authenticator code" value={otp} onChange={e=>setOtp(e.target.value)}/><button className="button" onClick={enable}>Enable 2FA</button><button className="button secondary" onClick={disable}>Disable 2FA</button></>}
 {msg&&<div className="notice">{msg}</div>}<p className="formHint">Live payment/courier calls require valid merchant/API credentials and provider approval.</p></section></main>;
}
