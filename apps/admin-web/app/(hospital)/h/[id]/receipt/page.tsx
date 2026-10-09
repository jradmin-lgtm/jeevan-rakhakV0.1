"use client";
import React, { useEffect, useState, use } from "react";
import { TripReceipt } from "../../../../../components/TripReceipt";

export default function HospitalReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/hospital-proxy/api/v1/hospital/bookings/${id}/receipt`, { signal: controller.signal, cache: "no-store" }).then(async (res) => {
      if (!res.ok) throw new Error(res.status === 404 ? "Receipt not found for this hospital." : "Receipt could not be loaded.");
      setData(await res.json());
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [id]);
  if (error) return <div role="alert" className="card">{error}</div>;
  if (!data) return <div role="status" className="card">Loading receipt…</div>;
  return <TripReceipt data={data} backHref={`/h/${id}`} />;
}
