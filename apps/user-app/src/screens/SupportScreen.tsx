import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, View } from "react-native";
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

/**
 * v1.2.4 (helpdesk) — user Help & Support. One screen with two views:
 *
 *   • list view  — a "raise a request" form (message + Issue/Feedback + an
 *                  optional link to one of the user's own completed rides)
 *                  plus the user's own tickets with a status pill.
 *   • thread view — the chat bubbles for a tapped ticket + a reply box. Polls
 *                  the thread every 10s while open; the poll is cleared on
 *                  unmount AND when leaving the thread (audit gate item 4).
 *
 * All data is scoped server-side to raiser_user_id=sub, so the user can only
 * ever see/post on their own tickets. Ride references show #displayId (or '—'),
 * never a raw UUID. Mirrors the driver app's SupportScreen — the only
 * differences are the /me/tickets* endpoints and the "USER" author alignment.
 */

const THREAD_POLL_MS = 10_000;

// Inline EN|हि toggle — the user app puts the language switch in the header
// (HomeScreen does the same), so we don't pull in a shared LangToggle here.
function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <Pressable
      onPress={() => void setLang(lang === "en" ? "hi" : "en")}
      accessibilityLabel="Switch language"
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(30,94,255,0.10)", borderRadius: 999 }}
    >
      <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : "#94A3B8" }}>EN</Text>
      <Text variant="small" tone="muted">|</Text>
      <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : "#94A3B8" }}>हि</Text>
    </Pressable>
  );
}

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
  const [rides, setRides] = useState<Booking[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await ticketsApi.list();
      setItems(r.tickets);
    } catch {
      /* keep prior list — next pull/refresh retries */
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Lazy-load the user's completed rides the first time the ride picker opens
  // so the form is light when the user only wants a general request.
  const loadRides = useCallback(async () => {
    if (rides != null) return;
    try {
      const r = await bookingsApi.mine();
      setRides(r.bookings.filter((b) => b.status === "COMPLETED"));
    } catch {
      setRides([]);
    }
  }, [rides]);

  const submit = useCallback(async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      Alert.alert(t("support.title"), t("support.error_too_short"));
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
      setMessage("");
      setRideId(null);
      setCategory("ISSUE");
      await refresh();
      Alert.alert(t("support.title"), t("support.submitted_toast"));
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("message_too_short")) {
        Alert.alert(t("support.title"), t("support.error_too_short"));
      } else {
        Alert.alert(t("support.title"), t("support.error_generic"));
      }
    } finally {
      setSubmitting(false);
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

          {/* Optional ride link — chips of the user's own completed rides. */}
          <View style={{ gap: space.xs }}>
            <Text variant="small" tone="secondary">{t("support.ride_label")}</Text>
            {rides == null ? (
              <Button label={t("support.ride_label")} variant="outline" size="sm" onPress={loadRides} />
            ) : rides.length === 0 ? (
              <Text variant="tiny" tone="muted">{t("support.ride_empty")}</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                <RideChip
                  label={t("support.ride_none")}
                  active={rideId == null}
                  onPress={() => setRideId(null)}
                />
                {rides.map((b) => (
                  <RideChip
                    key={b.id}
                    label={`#${b.displayId ?? "—"}`}
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Pill label={t(`support.category.${item.category}`)} />
            {item.subject_type === "RIDE" ? (
              <Pill
                label={t("support.ride_tag").replace("{id}", `#${item.booking_display_id ?? "—"}`)}
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
        <Text variant="tiny" tone="muted">{new Date(item.created_at).toLocaleString()}</Text>
      </View>
    </Card>
  );
}

// ── Thread view ──────────────────────────────────────────────────────────────
function ThreadView({ ticketId, onBack, t }: { ticketId: string; onBack: () => void; t: Tfn }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await ticketsApi.get(ticketId);
      if (!mounted.current) return;
      setTicket(r.ticket);
      setMessages(r.messages);
    } catch {
      /* keep prior thread — next poll tick retries */
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }, [ticketId]);

  // 10s poll so an admin/team reply surfaces without a manual refresh. Cleared
  // on unmount (and the screen unmounts the ThreadView when leaving) so no
  // orphaned timer survives (audit gate item 4).
  useEffect(() => {
    mounted.current = true;
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
      Alert.alert(t("support.thread_title"), t("support.reply_too_short"));
      return;
    }
    setSending(true);
    try {
      const r = await ticketsApi.reply(ticketId, body);
      setReply("");
      // Optimistic append; the next poll reconciles against the server thread.
      setMessages((prev) => [...prev, r.message]);
    } catch {
      Alert.alert(t("support.thread_title"), t("support.reply_error"));
    } finally {
      setSending(false);
    }
  }, [reply, ticketId, t]);

  const resolved = ticket?.status === "RESOLVED";

  return (
    <Screen>
      <AppHeader
        title={t("support.thread_title")}
        subtitle={
          ticket
            ? `${t(`support.category.${ticket.category}`)}${
                ticket.subject_type === "RIDE"
                  ? ` · ${t("support.ride_tag").replace("{id}", `#${ticket.booking_display_id ?? "—"}`)}`
                  : ""
              }`
            : undefined
        }
        onBack={onBack}
        right={<LangToggle />}
      />

      {!loaded ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="40%" height={14} />
          </View>
        </Card>
      ) : (
        <View style={{ gap: space.sm }}>
          {messages.map((m) => (
            <Bubble key={m.id} message={m} t={t} />
          ))}
        </View>
      )}

      {resolved ? (
        <Card flat>
          <Text variant="small" tone="secondary">{t("support.resolved_notice")}</Text>
        </Card>
      ) : null}

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
    </Screen>
  );
}

// A chat bubble. The user's own messages (author_role USER) align right in
// the brand red; everyone else (ADMIN/team) aligns left on a neutral surface.
function Bubble({ message, t }: { message: SupportTicketMessage; t: Tfn }) {
  const mine = message.author_role === "USER";
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
          {new Date(message.created_at).toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

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
