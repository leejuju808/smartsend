"use client";
import { useEffect, useState } from "react";

export default function LinkExtensionPage() {
  const [status, setStatus] = useState<"idle"|"ok"|"error">("idle");
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/extension/create-token", { method: "POST" });
        const j = await r.json();
        if (!r.ok || !j.token) throw new Error(j.error || "Failed");
        setToken(j.token);

        // Broadcast to the extension (the extension will only accept from your origin)
        window.postMessage({ type: "SMARTSENDAI_EXT_TOKEN", token: j.token }, window.origin);
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="border rounded p-6 max-w-md text-center">
        <h1 className="text-xl font-bold mb-2">Connecting your extension…</h1>
        {status === "idle" && <p>Generating a secure token…</p>}
        {status === "ok" && (
          <>
            <p className="mb-2">Extension connected. You can close this tab.</p>
            <code className="text-xs break-all">{token.slice(0,8)}•••</code>
          </>
        )}
        {status === "error" && <p className="text-red-600">Couldn't create a token.</p>}
      </div>
    </div>
  );
} 