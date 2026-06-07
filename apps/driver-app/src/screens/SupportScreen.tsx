import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View
} from "react-native";
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  Input,
  Pill,
  Screen,
  Skeleton,
  Text,
  colors,
  dialog,
  space
} from "@jr/ui";
import {
  Booking,
  bookings as bookingsApi,
  tickets as ticketsApi,
  SupportTicket,
  SupportTicketMessage
} from "../api";
import { useT } from "../i18n";
import { LangToggle } from "../components/LangToggle";
import { formatDateTime } from "../format";

/**
 * v1.2.4 (helpdesk) — driver Help & Support. One screen with two views:
 *
 *   • list view  — a "raise a request" form (message + Issue/Feedback + an
 *                  optional link to one of the driver's own completed trips)
 *                  plus the driver's own tickets with a status pill.
 *   • thread view — the chat bubbles for a tapped ticket + a reply box. Polls
 *                  the thread every 10s while open; the poll is cleared on
 *                  unmount AND when leaving the thread (audit gate item 4).
 *
 * All data is scoped server-side to raiser_driver_id=sub, so the driver can
 * only ever see/post on their own tickets. Ride references show #displayId
 * (or '—'), never a raw UUID.
 */

const THREAD_POLL_MS = 10_000;

export function SupportScreen({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) {
    return <ThreadView ticketId={openId} onBack={() => setOpenId(null)} t={t} />;
  }
  return <ListView onBack={onBack} onOpen={setOpenId} t={t} />;
}

type Tfn = (k: string) => string;

// ── List + raise form ──────────────────────────────────────────────────────
function ListView({ onBack, onOpen, t }: { onBack: () => void; onOpen: (id: string) => void; t: Tfn }) {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Raise form state.
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<"ISSUE" | "FEEDBACK">("ISSUE");
  const [rideId, setRideId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Booking[] | null>(null);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Guards every post-await setState so an in-flight request that resolves
  // after the driver navigates away can't setState on an unmounted view.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await ticketsApi.list();
      if (!mounted.current) return;
      setItems(r.tickets);
    } catch {
      /* keep prior list — next pull/refresh retries */
    } finally {
      if (mounted.current) {
        setRefreshing(false);
        setLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Lazy-load the driver's completed trips the first time the ride picker opens
  // so the form is light when the driver only wants a general request.
  const loadTrips = useCallback(async () => {
    if (trips != null) return;
    setTripsLoading(true);
    try {
      const r = await bookingsApi.mine();
      if (!mounted.current) return;
      setTrips(r.bookings.filter((b) => b.status === "COMPLETED"));
    } catch {
      if (mounted.current) setTrips([]);
    } finally {
      if (mounted.current) setTripsLoading(false);
    }
  }, [trips]);

  const submit = useCallback(async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      void dialog.alert(t("support.title"), t("support.error_too_short"));
      return;
    }
    setSubmitting(true);
    try {
      await ticketsApi.create({
        category,
        subjectType: rideId ? "RIDE" : "GENERAL",
        bookingId: rideId ?? undefined,
        message: trimmed
      });
      if (!mounted.current) return;
      setMessage("");
      setRideId(null);
      setCategory("ISSUE");
      await refresh();
      if (!mounted.current) return;
      void dialog.alert(t("support.title"), t("support.submitted_toast"));
    } catch (e: any) {
      if (!mounted.current) return;
      const msg = String(e?.message ?? "");
      if (msg.includes("message_too_short")) {
        void dialog.alert(t("support.title"), t("support.error_too_short"));
      } else {
        void dialog.alert(t("support.title"), t("support.error_generic"));
      }
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }, [message, category, rideId, refresh, t]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <AppHeader title={t("support.title")} subtitle={t("support.subtitle")} onBack={onBack} right={<LangToggle />} />

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("support.raise_heading")}</Text>

          {/* Issue / Feedback segmented toggle */}
          <View style={{ gap: space.xs }}>
            <Text variant="small" tone="secondary">{t("support.category_label")}</Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {(["ISSUE", "FEEDBACK"] as const).map((c) => {
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[segStyles.pill, active && segStyles.pillActive]}
                    android_ripple={{ color: "rgba(229,50,43,0.1)" }}
                  >
                    <Text variant="body" weight="semi" tone={active ? "primary" : "secondary"}>
                      {t(`support.category.${c}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            label={t("support.message_label")}
            value={message}
            onChangeText={setMessage}
            placeholder={t("support.message_placeholder")}
            multiline
            style={{ minHeight: 88, textAlignVertical: "top", paddingTop: space.md }}
          />

          {/* Optional ride link — chips of the driver's own completed trips. */}
          <View style={{ gap: space.xs }}>
            <Text variant="small" tone="secondary">{t("support.ride_label")}</Text>
            {tripsLoading ? (
              <Text variant="tiny" tone="muted">{t("support.ride_loading")}</Text>
            ) : trips == null ? (
              <Button label={t("support.ride_label")} variant="outline" size="sm" onPress={loadTrips} />
            ) : trips.length === 0 ? (
              <Text variant="tiny" tone="muted">{t("support.ride_empty")}</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                <RideChip
                  label={t("support.ride_none")}
                  active={rideId == null}
                  onPress={() => setRideId(null)}
                />
                {trips.map((b) => (
                  <RideChip
                    key={b.id}
                    label={`#${b.displayId ?? "-"}`}
                    active={rideId === b.id}
                    onPress={() => setRideId(b.id)}
                  />
                ))}
              </View>
            )}
            <Text variant="tiny" tone="muted">{t("support.ride_picker_hint")}</Text>
          </View>

          <Button
            label={submitting ? t("support.submit_busy") : t("support.submit")}
            onPress={submit}
            loading={submitting}
            disabled={message.trim().length < 5}
            fullWidth
            testID="support-submit"
          />
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <Text variant="label" tone="secondary">{t("support.my_tickets")}</Text>
        {!loaded ? (
          <Card>
            <View style={{ gap: space.sm }}>
              <Skeleton width={120} height={10} />
              <Skeleton width="100%" height={16} />
              <Skeleton width="50%" height={12} />
            </View>
          </Card>
        ) : items.length === 0 ? (
          <Card flat>
            <EmptyState title={t("support.my_tickets")} description={t("support.empty")} />
          </Card>
        ) : (
          items.map((it) => <TicketRow key={it.id} item={it} onPress={() => onOpen(it.id)} t={t} />)
        )}
      </View>
    </Screen>
  );
}

function RideChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[segStyles.chip, active && segStyles.pillActive]}
      android_ripple={{ color: "rgba(229,50,43,0.1)" }}
    >
      <Text variant="small" weight="semi" tone={active ? "primary" : "secondary"}>{label}</Text>
    </Pressable>
  );
}

function TicketRow({ item, onPress, t }: { item: SupportTicket; onPress: () => void; t: Tfn }) {
  const resolved = item.status === "RESOLVED";
  return (
    <Card padding="md" onPress={onPress}>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1, flexWrap: "wrap" }}>
            <Pill label={t(`support.category.${item.category}`)} />
            {item.subject_type === "RIDE" ? (
              <Pill
                label={t("support.ride_tag").replace("{id}", `#${item.booking_display_id ?? "-"}`)}
                color={colors.accent}
                bg="rgba(30,94,255,0.10)"
              />
            ) : null}
          </View>
          <Pill
            label={resolved ? t("support.status.RESOLVED") : t("support.status.OPEN")}
            color={resolved ? colors.success : colors.warning}
            bg={resolved ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.15)"}
          />
        </View>
        <Text variant="body" numberOfLines={2}>{item.message}</Text>
        <Text variant="tiny" tone="muted">{formatDateTime(item.created_at)}</Text>
      </View>
    </Card>
  );
}

// Two SupportTicketMessage[] are equivalent for render if they're the same
// length and end on the same message id — that's enough to skip re-rendering a
// poll tick that returned an identical thread (optimization item 5).
function sameThread(a: SupportTicketMessage[], b: SupportTicketMessage[]) {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[a.length - 1].id === b[b.length - 1].id;
}

// ── Thread view ──────────────────────────────────────────────────────────────
function ThreadView({ ticketId, onBack, t }: { ticketId: string; onBack: () => void; t: Tfn }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const mounted = useRef(true);
  // Mirror of `loaded` read inside the (stable) poll callback so it doesn't have
  // to depend on `loaded` — that would tear down and rebuild the interval on the
  // first-load transition.
  const loadedRef = useRef(false);

  // The scrollable message list. We auto-scroll to the bottom after a send and
  // after any poll that ADDED messages so the newest bubble stays visible.
  const listRef = useRef<ScrollView | null>(null);
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Optimistically-appended reply ids that the poll hasn't echoed back yet.
  // While any are outstanding (or a send is in flight) we don't let a poll tick
  // overwrite the local thread — that would drop the just-sent bubble until the
  // server catches up (optimistic-append vs poll clobber guard, item 5).
  const pendingIds = useRef<Set<string>>(new Set());
  const sendingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await ticketsApi.get(ticketId);
      if (!mounted.current) return;
      setTicket(r.ticket);
      setError(false);
      // Don't clobber an optimistic append that the server hasn't echoed yet.
      const hasPending = sendingRef.current || pendingIds.current.size > 0;
      const serverHasPending =
        pendingIds.current.size > 0 &&
        r.messages.some((m) => pendingIds.current.has(m.id));
      if (hasPending && !serverHasPending) return;
      pendingIds.current.clear();
      setMessages((prev) => {
        if (sameThread(prev, r.messages)) return prev; // identical tick — no re-render
        if (r.messages.length > prev.length) scrollToEnd();
        return r.messages;
      });
    } catch {
      // Keep a loaded thread on a transient poll failure; only the FIRST load
      // surfaces a friendly error so a blank screen never strands the driver.
      if (mounted.current && !loadedRef.current) setError(true);
    } finally {
      loadedRef.current = true;
      if (mounted.current) setLoaded(true);
    }
  }, [ticketId, scrollToEnd]);

  // 10s poll so an admin/team reply surfaces without a manual refresh. Cleared
  // on unmount (and the screen unmounts the ThreadView when leaving) so no
  // orphaned timer survives (audit gate item 4).
  useEffect(() => {
    mounted.current = true;
    loadedRef.current = false;
    void load();
    const id = setInterval(load, THREAD_POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  const send = useCallback(async () => {
    const body = reply.trim();
    if (body.length < 2) {
      void dialog.alert(t("support.thread_title"), t("support.reply_too_short"));
      return;
    }
    setSending(true);
    sendingRef.current = true;
    try {
      const r = await ticketsApi.reply(ticketId, body);
      if (!mounted.current) return;
      setReply("");
      // Optimistic append; the next poll reconciles against the server thread.
      pendingIds.current.add(r.message.id);
      setMessages((prev) => [...prev, r.message]);
      scrollToEnd();
    } catch {
      if (mounted.current) void dialog.alert(t("support.thread_title"), t("support.reply_error"));
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }, [reply, ticketId, t, scrollToEnd]);

  const resolved = ticket?.status === "RESOLVED";

  // The thread is a flex column (header + flex-1 scrolling message list + a
  // pinned reply box) inside a KeyboardAvoidingView so the reply input stays
  // visible above the keyboard. We deliberately do NOT use the outer @jr/ui
  // Screen scroll here — the message list owns its own scroll (item 1).
  return (
    <Screen scroll={false} padding={0}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <AppHeader
            title={t("support.thread_title")}
            subtitle={
              ticket
                ? `${t(`support.category.${ticket.category}`)}${
                    ticket.subject_type === "RIDE"
                      ? ` · ${t("support.ride_tag").replace("{id}", `#${ticket.booking_display_id ?? "-"}`)}`
                      : ""
                  }`
                : undefined
            }
            onBack={onBack}
            right={<LangToggle />}
          />
        </View>

        <ScrollView
          ref={listRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          onContentSizeChange={() => {
            // Land at the bottom on the very first paint of a loaded thread.
            if (loaded && messages.length > 0) listRef.current?.scrollToEnd({ animated: false });
          }}
        >
          {!loaded ? (
            <Card>
              <View style={{ gap: space.sm }}>
                <Skeleton width="70%" height={16} />
                <Skeleton width="40%" height={14} />
              </View>
            </Card>
          ) : error ? (
            <Card flat>
              <EmptyState title={t("support.thread_title")} description={t("support.thread_load_error")} />
            </Card>
          ) : messages.length === 0 ? (
            <Card flat>
              <EmptyState title={t("support.thread_title")} description={t("support.thread_empty")} />
            </Card>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} t={t} />)
          )}

          {resolved ? (
            <Card flat>
              <Text variant="small" tone="secondary">{t("support.resolved_notice")}</Text>
            </Card>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.sm }}>
          <Card>
            <View style={{ gap: space.sm }}>
              <Input
                value={reply}
                onChangeText={setReply}
                placeholder={t("support.reply_placeholder")}
                multiline
                style={{ minHeight: 64, textAlignVertical: "top", paddingTop: space.md }}
              />
              <Button
                label={sending ? t("support.send_busy") : t("support.send")}
                onPress={send}
                loading={sending}
                disabled={reply.trim().length < 2}
                fullWidth
                testID="support-reply-send"
              />
            </View>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// A chat bubble. The driver's own messages (author_role DRIVER) align right in
// the brand red; everyone else (ADMIN/team) aligns left on a neutral surface.
// Memoised so an identical poll tick (or an unrelated reply being typed) never
// re-renders the whole thread of bubbles (optimization item 5). `t` is a stable
// module-level reference, so a bubble only re-renders when its message changes.
const Bubble = React.memo(function Bubble({ message, t }: { message: SupportTicketMessage; t: Tfn }) {
  const mine = message.author_role === "DRIVER";
  const who = mine ? t("support.author.you") : message.author_name || t("support.author.team");
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "86%",
          backgroundColor: mine ? colors.primary : colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.border,
          borderRadius: 14,
          paddingVertical: space.sm,
          paddingHorizontal: space.md,
          gap: 2
        }}
      >
        <Text variant="tiny" weight="semi" style={{ color: mine ? "rgba(255,255,255,0.85)" : colors.textMuted }}>
          {who}
        </Text>
        <Text variant="body" style={{ color: mine ? colors.textInverse : colors.textPrimary }}>
          {message.body}
        </Text>
        <Text variant="tiny" style={{ color: mine ? "rgba(255,255,255,0.7)" : colors.textMuted }}>
          {formatDateTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
});

const segStyles = {
  pill: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center" as const
  },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center" as const
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint
  }
};
