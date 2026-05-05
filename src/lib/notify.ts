"use client";

// Lightweight event-bus toast: components call notify(...), the global
// <NeonToast /> mounted in AuthProvider listens and renders a styled pill.
// This replaces browser-native alert() so we get on-theme neon popups
// instead of white OS modals.

export type NotifyKind = "info" | "error" | "success";

const NOTIFY_EVENT = "bs:notify";

export interface NotifyDetail {
  message: string;
  kind: NotifyKind;
}

export function notify(message: string, kind: NotifyKind = "error") {
  if (typeof window === "undefined") return;
  if (!message) return;
  window.dispatchEvent(
    new CustomEvent<NotifyDetail>(NOTIFY_EVENT, {
      detail: { message, kind },
    })
  );
}

export function onNotify(handler: (detail: NotifyDetail) => void) {
  if (typeof window === "undefined") return () => {};
  const wrap = (e: Event) => handler((e as CustomEvent<NotifyDetail>).detail);
  window.addEventListener(NOTIFY_EVENT, wrap);
  return () => window.removeEventListener(NOTIFY_EVENT, wrap);
}
