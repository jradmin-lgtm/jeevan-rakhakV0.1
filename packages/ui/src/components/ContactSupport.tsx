import React, { memo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, space } from "../tokens";
import { dialog } from "./AppDialog";

export const SUPPORT_EMAIL = "contact.jeevanrakshak@gmail.com";
export const SUPPORT_PHONE = "+915812582000"; // 0581-258-2000, trunk-0 dropped for +91 dialing
export const SUPPORT_PHONE_DISPLAY = "+91 581 258 2000";

export const SUPPORT_NUMBERS = [
  { label: "MOBILE",           phone: "+915812582000",  display: "+91 581 258 2000", primary: true },
  { label: "TRANSPORT OFFICE", phone: "+919458701707",  display: "+91 94587 01707" },
  { label: "GYNAE EMERGENCY",  phone: "+919045954724",  display: "+91 90459 54724", urgent: true }
];

type Props = { bookingId?: string; compact?: boolean; variant?: "user" | "driver"; lang?: "en" | "hi" };
function ContactSupportInner({ bookingId, compact, variant = "user", lang = "en" }: Props) {
  const hi = lang === "hi";
  const subject = bookingId ? `Help with booking ${bookingId.slice(0, 8)}` : "Help · Jeevan Rakshak";
  const open = async (url: string) => {
    try { await Linking.openURL(url); }
    catch (error) {
      console.error("[support] could not open contact action", error);
      void dialog.alert(hi ? "संपर्क नहीं खुला" : "Could not open contact", hi ? "फ़ोन या ईमेल ऐप जाँचें। नीचे दी गई जानकारी से सीधे संपर्क करें।" : "Check your phone or email app. You can use the contact details shown here.");
    }
  };
  const email = () => void open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`);
  if (compact) return <View style={styles.compact}>
    <Pressable accessibilityRole="button" onPress={() => void open(`tel:${SUPPORT_PHONE}`)} style={styles.compactButton}><Text weight="semi">{hi ? "कॉल करें" : "Call support"}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={email} style={styles.compactButton}><Text weight="semi">{hi ? "ईमेल" : "Email"}</Text></Pressable>
  </View>;
  const numbers = variant === "driver" ? SUPPORT_NUMBERS.slice(0, 1) : SUPPORT_NUMBERS;
  const labels = hi ? ["मोबाइल", "परिवहन कार्यालय", "स्त्री रोग आपातकाल"] : ["Mobile", "Transport office", "Gynae emergency"];
  return <View style={styles.card}>
    <Text weight="bold">{hi ? "फ़ोन पर मदद" : "Talk to our team"}</Text>
    <Text variant="small" tone="secondary">{hi ? "रोज़ सुबह 8 से रात 11 बजे तक" : "Daily, 8 AM to 11 PM IST"}</Text>
    <View style={{ marginTop: space.sm }}>
      {numbers.map((number, index) => <Pressable key={number.phone} accessibilityRole="button" accessibilityLabel={`${labels[index]}, ${number.display}`} onPress={() => void open(`tel:${number.phone}`)} style={styles.row}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text weight="semi" tone={number.urgent ? "danger" : "primary"}>{labels[index]}</Text><Text variant="small" tone="secondary">{number.display}</Text></View>
        <Text variant="small" weight="bold">{hi ? "कॉल" : "Call"} ↗</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" onPress={email} style={styles.row}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text weight="semi">{hi ? "ईमेल" : "Email"}</Text><Text variant="small" tone="secondary">{SUPPORT_EMAIL}</Text></View><Text weight="bold">↗</Text>
      </Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { paddingVertical: space.md, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 68, paddingVertical: space.sm, borderTopWidth: 1, borderColor: colors.border },
  compact: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  compactButton: { minHeight: 48, paddingHorizontal: space.md, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12 }
});
export const ContactSupport = memo(ContactSupportInner);
