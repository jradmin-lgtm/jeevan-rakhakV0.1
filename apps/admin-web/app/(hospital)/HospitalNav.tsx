"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
const links = [["/h", "Dashboard"], ["/h/drivers", "Drivers"], ["/h/rides", "Rides"], ["/h/feedbacks", "Feedback"], ["/h/help", "Help & Support"]];
export function HospitalNav() {
  const pathname = usePathname();
  return <nav aria-label="Hospital navigation">{links.map(([href, label]) => {
    const active = href === "/h" ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{label}</Link>;
  })}</nav>;
}
