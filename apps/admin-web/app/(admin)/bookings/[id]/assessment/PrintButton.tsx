"use client";

import React from "react";

/**
 * Tiny client-side print trigger. Lives in its own file so the parent
 * assessment page can stay a server component (it needs server-side
 * adminFetch with the cookie). Print CSS in the parent collapses the
 * toolbar so this button doesn't appear in the saved PDF.
 */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: "#0F172A",
        color: "#fff",
        border: "none",
        padding: "8px 16px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      🖨️ Print / save as PDF
    </button>
  );
}
