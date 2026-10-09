import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReduced(value);
    }).catch(error => console.warn("Motion preference unavailable; animations remain reduced", error));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
