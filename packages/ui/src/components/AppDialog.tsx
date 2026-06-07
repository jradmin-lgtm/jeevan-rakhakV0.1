import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { colors, radius, shadow, space } from "../tokens";

/**
 * App-level dialog foundation.
 *
 * A module-level singleton `dialog` exposes alert/confirm/show. Each call
 * returns a Promise and is queued so concurrent calls never clobber the
 * currently-open dialog. The actual UI lives in <AppDialogHost/>, which is
 * mounted ONCE at each app root. The host registers itself with the singleton
 * on mount; until it is mounted, queued calls simply wait.
 *
 * The overlay is app-styled (design tokens + Text + Button), NOT a native
 * dialog. It renders inside an RN Modal that is visible only while a dialog is
 * active, so it never blocks the UI when idle.
 */

type ActionStyle = "default" | "cancel" | "destructive";

export type DialogAction = {
  label: string;
  style?: ActionStyle;
  onPress?: () => void;
};

type ShowOptions = {
  title: string;
  message?: string;
  actions: DialogAction[];
};

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

// The internal request the host actually renders. `resolve` is called once the
// dialog closes so the caller's Promise settles after any action onPress runs.
type DialogRequest = {
  title: string;
  message?: string;
  actions: DialogAction[];
  // True when the dialog has at least one cancel-style action, so a backdrop
  // tap can dismiss it. Required dialogs (alert / no cancel) ignore backdrop.
  dismissible: boolean;
  // Runs when the dialog closes via backdrop tap (resolves caller, no onPress).
  onDismiss: () => void;
  resolve: () => void;
};

type HostController = {
  enqueue: (req: DialogRequest) => void;
};

let host: HostController | null = null;
const queue: DialogRequest[] = [];

function registerHost(controller: HostController) {
  host = controller;
  // Flush anything that was requested before the host mounted.
  while (queue.length > 0) {
    const next = queue.shift();
    if (next) host.enqueue(next);
  }
}

function unregisterHost(controller: HostController) {
  if (host === controller) host = null;
}

function enqueue(req: DialogRequest) {
  if (host) host.enqueue(req);
  else queue.push(req);
}

export const dialog = {
  /** Single OK button. Resolves when dismissed. */
  alert(title: string, message?: string): Promise<void> {
    return new Promise<void>((resolve) => {
      enqueue({
        title,
        message,
        actions: [{ label: "OK", style: "default" }],
        // An alert is required: the only way out is the OK button.
        dismissible: false,
        onDismiss: () => resolve(),
        resolve
      });
    });
  },

  /** Two-button confirm. Resolves true if confirmed, false otherwise. */
  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let result = false;
      enqueue({
        title: opts.title,
        message: opts.message,
        actions: [
          {
            label: opts.cancelText ?? "Cancel",
            style: "cancel",
            onPress: () => { result = false; }
          },
          {
            label: opts.confirmText ?? "Confirm",
            style: opts.destructive ? "destructive" : "default",
            onPress: () => { result = true; }
          }
        ],
        // A confirm has a cancel action, so a backdrop tap reads as cancel.
        dismissible: true,
        onDismiss: () => { result = false; },
        resolve: () => resolve(result)
      });
    });
  },

  /** General N-button case. Resolves once the dialog closes. */
  show(opts: ShowOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const hasCancel = opts.actions.some((a) => a.style === "cancel");
      enqueue({
        title: opts.title,
        message: opts.message,
        actions: opts.actions,
        dismissible: hasCancel,
        // Backdrop dismiss fires the first cancel action's onPress, if any.
        onDismiss: () => {
          const cancel = opts.actions.find((a) => a.style === "cancel");
          cancel?.onPress?.();
        },
        resolve
      });
    });
  }
};

// Maps an action style to a Button variant. cancel = outline/ghost,
// destructive = danger (red), default = primary.
function variantFor(style?: ActionStyle): "primary" | "danger" | "outline" {
  if (style === "cancel") return "outline";
  if (style === "destructive") return "danger";
  return "primary";
}

function AppDialogHostInner() {
  const [active, setActive] = useState<DialogRequest | null>(null);
  // activeRef mirrors `active` so enqueue/close can decide synchronously
  // WITHOUT a side effect inside the setState updater (which can double-fire
  // under React concurrent/strict invocation and pop a dialog twice).
  const activeRef = useRef<DialogRequest | null>(null);
  // Pending dialogs while one is already open. Drained one at a time on close.
  const pending = useRef<DialogRequest[]>([]);

  const enqueue = useCallback((req: DialogRequest) => {
    if (activeRef.current) {
      pending.current.push(req);
      return;
    }
    activeRef.current = req;
    setActive(req);
  }, []);

  useEffect(() => {
    const controller: HostController = { enqueue };
    registerHost(controller);
    return () => unregisterHost(controller);
  }, [enqueue]);

  // Closes the active dialog, settles its Promise, then opens the next queued
  // one (if any). activeRef stays in lockstep with the rendered state.
  const close = useCallback((req: DialogRequest) => {
    req.resolve();
    const next = pending.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  const onAction = useCallback(
    (req: DialogRequest, action: DialogAction) => {
      action.onPress?.();
      close(req);
    },
    [close]
  );

  const onBackdrop = useCallback(
    (req: DialogRequest) => {
      if (!req.dismissible) return;
      req.onDismiss();
      close(req);
    },
    [close]
  );

  const visible = !!active;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Android hardware back: treat as a backdrop dismiss.
        if (active) onBackdrop(active);
      }}
    >
      {active ? (
        <View style={styles.root}>
          <Pressable
            style={styles.backdrop}
            onPress={() => onBackdrop(active)}
            // Required dialogs swallow backdrop taps so they cannot be skipped.
            disabled={!active.dismissible}
            accessibilityRole={active.dismissible ? "button" : undefined}
          />
          <View style={styles.card} pointerEvents="box-none">
            <View style={styles.cardInner}>
              <Text variant="heading" weight="semi">{active.title}</Text>
              {active.message ? (
                <Text variant="body" tone="secondary" style={styles.message}>
                  {active.message}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {active.actions.map((action, i) => (
                  <Button
                    key={`${action.label}-${i}`}
                    label={action.label}
                    variant={variantFor(action.style)}
                    onPress={() => onAction(active, action)}
                    fullWidth
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.55)"
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "stretch"
  },
  cardInner: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
    ...shadow.pop
  },
  message: {
    marginTop: space.xs
  },
  actions: {
    marginTop: space.sm,
    gap: space.sm
  }
});

export const AppDialogHost = memo(AppDialogHostInner);
