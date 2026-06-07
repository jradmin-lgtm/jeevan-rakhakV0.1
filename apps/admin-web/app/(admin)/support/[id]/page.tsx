import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";
import { TicketDetailLive } from "./TicketDetailLive";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getTicket(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/tickets/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTicket(id);
  if (!data) notFound();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ticket</h1>
          <p>
            <Link href="/support" style={{ color: "var(--accent)" }}>← Back to Help &amp; Support</Link>
            <span className="muted mono" style={{ marginLeft: 12, fontSize: 11 }}>{id}</span>
          </p>
        </div>
      </div>
      <TicketDetailLive ticketId={id} initialData={data} apiBase={API_BASE} />
    </>
  );
}
