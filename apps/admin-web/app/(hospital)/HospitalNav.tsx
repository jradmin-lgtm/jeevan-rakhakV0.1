"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMobileNavigation } from "../useMobileNavigation";
const links = [["/h", "Dashboard"], ["/h/drivers", "Drivers"], ["/h/rides", "Rides"], ["/h/feedbacks", "Feedback"], ["/h/help", "Help & Support"]];
export function HospitalNav() {
  const pathname = usePathname();
  const mobileNav = useMobileNavigation(pathname);
  return <nav ref={mobileNav} aria-label="Hospital navigation">{links.map(([href, label]) => {
    const active = href === "/h" ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{label}</Link>;
  })}</nav>;
}
