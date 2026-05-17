import React, { memo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { Card } from "./Card";
import { colors, radius, space } from "../tokens";

type Props = {
  /** Headline shown on top of the card. e.g. "How was your driver?" */
  title: string;
  /** Optional one-line subtitle below the headline. */
  subtitle?: string;
  /** Label for the feedback textarea. */
  feedbackLabel?: string;
  /** Placeholder text inside the feedback textarea. */
  feedbackPlaceholder?: string;
  /** Submit button label. */
  submitLabel?: string;
  /** Called with the chosen rating (1-5) + optional feedback. */
  onSubmit: (input: { rating: number; feedback?: string }) => Promise<void> | void;
  /** Hide the card entirely when set — typically after a successful submit. */
  hidden?: boolean;
  /** Optional inline error message rendered above the submit button. */
  error?: string | null;
};

/**
 * Reusable star-rating + free-text feedback card. Used by:
 *   - user-app LiveTrackingScreen (rate the driver after COMPLETED)
 *   - driver-app TripScreen (rate the patient after COMPLETED)
 *
 * Hides itself when `hidden=true` (e.g. once the booking already carries a
 * rating from this side). Caller owns the "already submitted?" gate so the
 * component stays dumb about booking state.
 */
function RatingPromptInner({
  title,
  subtitle,
  feedbackLabel = "Anything else to share? (optional)",
  feedbackPlaceholder = "Tell us how it went",
  submitLabel = "Submit rating",
  onSubmit,
  hidden,
  error
}: Props) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  if (hidden) return null;

  const submit = async () => {
    if (rating < 1) return;
    setBusy(true);
    try {
      await onSubmit({ rating, feedback: feedback.trim() || undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ gap: space.md }}>
        <View>
          <Text variant="label" tone="primary">RATING</Text>
          <Text variant="heading" weight="semi">{title}</Text>
          {subtitle ? (
            <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= rating;
            return (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
              >
                <Text style={[styles.star, filled ? styles.starFilled : styles.starEmpty]}>
                  {filled ? "★" : "☆"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View>
          <Text variant="label" tone="secondary">{feedbackLabel}</Text>
          <TextInput
            value={feedback}
            onChangeText={setFeedback}
            placeholder={feedbackPlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            style={styles.feedback}
          />
        </View>

        {error ? <Text variant="tiny" tone="danger">{error}</Text> : null}

        <Button
          label={busy ? "Sending…" : submitLabel}
          onPress={submit}
          loading={busy}
          disabled={rating < 1}
          fullWidth
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  starsRow: { flexDirection: "row", justifyContent: "center", gap: space.md, paddingVertical: space.sm },
  star: { fontSize: 44, lineHeight: 50 },
  starFilled: { color: "#F59E0B" },
  starEmpty: { color: colors.borderStrong },
  feedback: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 80,
    textAlignVertical: "top",
    color: colors.textPrimary,
    backgroundColor: colors.surface
  }
});

export const RatingPrompt = memo(RatingPromptInner);
