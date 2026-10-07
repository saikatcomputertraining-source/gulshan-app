"use client";
import {useEffect,useState} from "react";
import {useParams,useRouter} from "next/navigation";
const API=process.env.NEXT_PUBLIC_API_URL||"http://localhost:4000/api";
function money(v:any){return `৳${Number(v).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2})}`}
export default function InvoicePage(){
 const {id}=useParams<{id:string}>(); const router=useRouter(); const [data,setData]=useState<any>(null); const [err,setErr]=useState("");
 useEffect(()=>{const token=localStorage.getItem("admin_token");if(!token){router.push("/admin/login");return;}fetch(`${API}/admin/orders/${id}/invoice`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||"Unable to load invoice");setData(d)}).catch(e=>setErr(e.message))},[id,router]);
 if(err)return <main className="invoicePage"><div className="invoiceError">{err}</div></main>;
 if(!data)return <main className="invoicePage"><p>Loading invoice...</p></main>;
 const {order}=data;
 return <main className="invoicePage"><div className="invoiceActions noPrint"><button className="button" onClick={()=>window.print()}>Print / Save PDF</button><button className="button secondary" onClick={()=>window.close()}>Close</button></div><article className="invoice"><header className="invoiceHeader"><div><h1>Gulshan Bazar</h1><p>Official Sales Invoice</p></div><div className="invoiceMeta"><b>Invoice #{data.invoiceNumber}</b><span>{new Date(data.invoiceIssuedAt||order.createdAt).toLocaleDateString("en-BD")}</span></div></header><section className="invoiceCustomer"><div><b>Bill To</b><p>{order.customerName}<br/>{order.mobile}<br/>{order.address}</p></div><div><b>Payment</b><p>{order.paymentMethod}<br/>Status: {order.status}</p></div></section><table className="invoiceTable"><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{order.items.map((item:any)=><tr key={item.id}><td>{item.name}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{money(item.price)}</td><td>{money(Number(item.price)*item.quantity)}</td></tr>)}</tbody></table><div className="invoiceTotal"><b>Grand Total</b><strong>{money(order.total)}</strong></div><footer><p>Thank you for shopping with Gulshan Bazar.</p><small>This is a computer-generated invoice.</small></footer></article></main>
}
