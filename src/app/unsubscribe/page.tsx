"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const campaign_id = searchParams.get("campaign_id");
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!campaign_id || !email || !token) {
      setStatus("error");
      setError("Missing required parameters");
      return;
    }

    fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id, email, token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setError(data.error || "Failed to unsubscribe");
        }
      })
      .catch((e) => {
        setStatus("error");
        setError(e.message || "Failed to unsubscribe");
      });
  }, [searchParams]);

  return (
    <div style={{ 
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center", 
      minHeight: "100vh",
      fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{ textAlign: "center", maxWidth: "500px", padding: "2rem" }}>
        {status === "loading" && <p>Processing unsubscribe request...</p>}
        {status === "success" && (
          <div>
            <h1>You&apos;re unsubscribed</h1>
            <p>You have been successfully unsubscribed from this campaign.</p>
          </div>
        )}
        {status === "error" && (
          <div>
            <h1>Error</h1>
            <p>{error || "An error occurred while processing your request."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
