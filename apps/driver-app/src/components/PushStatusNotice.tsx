import React, { useState } from "react";
import { Linking, View } from "react-native";
import { Button, Text } from "@jr/ui";
import { usePushStatus, registerPushToken } from "../push";
import { useT } from "../i18n";
export function PushStatusNotice() {
  const status = usePushStatus();
  const { lang } = useT();
  const [busy, setBusy] = useState(false);
  if (status === "ready" || status === "checking") return null;
  const hi = lang === "hi";
  const description = status === "unavailable"
    ? (hi ? "इस एमुलेटर पर पुश अलर्ट की पुष्टि नहीं हो सकती।" : "Push delivery cannot be verified on this emulator.")
    : status === "denied"
    ? (hi ? "सूचनाओं की अनुमति बंद है। ऐप बंद होने पर यात्रा के अलर्ट नहीं मिलेंगे।" : "Notifications are off. Ride alerts will not reach you while the app is closed.")
    : (hi ? "यात्रा के अलर्ट चालू नहीं हो पाए। इंटरनेट जाँचकर फिर कोशिश करें।" : "Ride alerts could not be registered. Check your connection and try again.");
  return <View style={{ gap: 8 }}>
    <Text variant="small" tone="danger" accessibilityRole="alert">{description}</Text>
    {status !== "unavailable" ? <Button variant="neutral" label={hi ? "अलर्ट फिर चालू करें" : "Retry alert setup"} loading={busy} onPress={async () => {
      setBusy(true);
      try { if (status === "denied") await Linking.openSettings(); else await registerPushToken(); }
      catch (error) { console.error("[push] retry failed", error); }
      finally { setBusy(false); }
    }} /> : null}
  </View>;
}
