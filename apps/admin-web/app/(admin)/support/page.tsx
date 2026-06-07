import React from "react";
import { SupportTicketsList } from "./SupportTicketsList";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getTickets() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/tickets`);
    if (!res.ok) throw new Error("tickets");
    const data = await res.json();
    return data.tickets ?? [];
  } catch {
    return [];
  }
}

export default async function SupportPage() {
  const tickets = await getTickets();
  return <SupportTicketsList initialTickets={tickets} apiBase={API_BASE} />;
}
