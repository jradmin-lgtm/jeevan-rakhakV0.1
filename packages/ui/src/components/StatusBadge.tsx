import React, { memo } from "react";
import { Pill } from "./Pill";
import { colors } from "../tokens";

const statusColor: Record<string, string> = {
  REQUESTED: colors.statusRequested,
  ACCEPTED: colors.statusAccepted,
  ARRIVED: colors.statusArrived,
  PICKED_UP: colors.statusPickedUp,
  COMPLETED: colors.statusCompleted,
  CANCELLED: colors.statusCancelled,
  TIMED_OUT: colors.statusTimedOut
};

const statusLabel: Record<string, string> = {
  REQUESTED: "Searching",
  ACCEPTED: "Driver assigned",
  ARRIVED: "Driver arrived",
  PICKED_UP: "On the way to hospital",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  TIMED_OUT: "No driver found"
};

function withAlpha(hex: string, a = 0.15) {
  // expand short hex if needed
  const h = hex.replace("#", "");
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function StatusBadgeInner({ status }: { status: string }) {
  const c = statusColor[status] ?? colors.textMuted;
  return <Pill label={statusLabel[status] ?? status} color={c} bg={withAlpha(c, 0.14)} />;
}

export const StatusBadge = memo(StatusBadgeInner);
