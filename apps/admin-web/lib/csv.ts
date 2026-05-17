/**
 * Client-side CSV export — no server round-trip. Takes the rows already
 * loaded into the table and serialises them with header row + RFC-4180
 * quoting. Triggers a browser download via blob URL.
 *
 * Use from any list page's "Download CSV" button.
 */

type Column<T> = {
  /** Header label as written to the CSV. */
  header: string;
  /** Extractor — return string | number | null. Nulls become empty cells. */
  value: (row: T) => string | number | null | undefined;
};

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // RFC 4180: quote if contains comma, quote, newline. Double internal quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv<T>(rows: T[], columns: Column<T>[], filenameBase: string): void {
  const header = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")).join("\n");
  const csv = header + "\n" + body;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM so Excel reads UTF-8 correctly
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
