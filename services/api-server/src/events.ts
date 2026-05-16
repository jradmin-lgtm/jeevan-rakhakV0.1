import { db, systemEvents } from "@jr/db";
import { notifyAdmin } from "./notify";

export type EventLevel = "info" | "warn" | "error" | "critical";

export type EmitEventInput = {
  level: EventLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
};

/**
 * Append-only audit / alert stream. Writes to system_events. For
 * error / critical levels, also kicks off an admin email (best-effort,
 * fire-and-forget) so we hear about prod issues without watching logs.
 *
 * Never throws — observability code that crashes the request path is
 * a net negative.
 */
export async function emitEvent(input: EmitEventInput): Promise<void> {
  try {
    const ctxStr = input.context ? JSON.stringify(input.context).slice(0, 4000) : null;
    const shouldEmail = input.level === "error" || input.level === "critical";
    const [row] = await db
      .insert(systemEvents)
      .values({
        level: input.level,
        source: input.source,
        message: input.message,
        context: ctxStr ? JSON.parse(ctxStr) : null,
        notified: false
      })
      .returning({ id: systemEvents.id });

    if (shouldEmail) {
      const subj = `${input.level.toUpperCase()} · ${input.source} · ${input.message}`.slice(0, 120);
      const body = [
        `Level:   ${input.level}`,
        `Source:  ${input.source}`,
        `Message: ${input.message}`,
        `Context: ${ctxStr ?? "(none)"}`,
        `Event:   ${row?.id ?? "(unknown id)"}`,
        `When:    ${new Date().toISOString()}`
      ].join("\n");
      // Fire and forget — don't await, don't block.
      void notifyAdmin(subj, body);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[emitEvent] write failed:", err);
  }
}
