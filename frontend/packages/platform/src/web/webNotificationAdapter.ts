import type { NotificationAdapter } from "../adapters";

export function createWebNotificationAdapter(): NotificationAdapter {
  return {
    notify({ title, body }) {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission === "granted") {
        new Notification(title, body === undefined ? {} : { body });
      }
    },
    async requestPermission() {
      if (typeof window === "undefined" || !("Notification" in window)) return "denied";
      return Notification.requestPermission();
    },
  };
}
