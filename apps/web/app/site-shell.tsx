"use client";
import Link from "next/link";

export function SiteHeader(){
  return <header className="header"><div className="container nav"><Link className="logo" href="/">Gulshan Bazar</Link><nav className="navLinks"><Link href="/search">Search</Link><Link href="/account">Account</Link><Link href="/wishlist">Wishlist</Link><Link href="/track-order">Track Order</Link><Link href="/checkout">Cart</Link></nav><button className="mobileMenu" aria-label="Open menu" onClick={()=>document.body.classList.toggle("menuOpen")}>☰</button></div><div className="mobileNav"><Link href="/search">Search</Link><Link href="/account">Account</Link><Link href="/wishlist">Wishlist</Link><Link href="/track-order">Track Order</Link><Link href="/checkout">Cart</Link></div></header>;
}

export function SiteFooter(){
  return <footer className="siteFooter"><div className="container footerGrid"><div><h3>Gulshan Bazar</h3><p>Online shopping in Bangladesh with convenient delivery and Cash on Delivery.</p></div><div><h4>Customer Care</h4><Link href="/track-order">Track Order</Link><Link href="/contact">Contact Us</Link><Link href="/faq">FAQ</Link><Link href="/returns">Returns & Refunds</Link></div><div><h4>Policies</h4><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms & Conditions</Link><Link href="/shipping">Shipping Policy</Link><Link href="/refund-policy">Refund Policy</Link></div></div><div className="container footerBottom">© {new Date().getFullYear()} Gulshan Bazar. All rights reserved.</div></footer>;
}
