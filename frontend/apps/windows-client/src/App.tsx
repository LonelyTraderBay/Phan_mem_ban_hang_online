import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

/**
 * F00 scope: prove the Tauri+React wiring boots and can call a Tauri API (`getVersion`) through
 * the WebView bridge. Real auth/routing/feature reuse from web-admin lands with F10 (Windows
 * Client Production) — its entry criteria require the Web vertical slice to be proven first.
 */
export function App() {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>AI Sales OS — Windows Client</h1>
      <p>Nền tảng kỹ thuật (F00) đã sẵn sàng.</p>
      {appVersion && <p>Phiên bản: {appVersion}</p>}
    </div>
  );
}
