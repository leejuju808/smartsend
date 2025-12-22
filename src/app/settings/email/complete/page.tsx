"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function CompleteEmailConnection() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function completeConnection() {
      const access_token = searchParams.get("access_token");
      const refresh_token = searchParams.get("refresh_token");
      const expires_in = searchParams.get("expires_in");
      const email = searchParams.get("email");

      if (!access_token || !email) {
        setStatus("error");
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStatus("error");
          return;
        }

        // Calculate expires_at (unix seconds)
        const expires_at = expires_in 
          ? Math.floor(Date.now() / 1000) + parseInt(expires_in)
          : Math.floor(Date.now() / 1000) + 3600;

        // Upsert provider account
        const { error } = await supabase
          .from("provider_accounts")
          .upsert(
            {
              user_id: user.id,
              provider: "gmail",
              email_address: email.toLowerCase(),
              access_token,
              refresh_token: refresh_token || null,
              expires_at,
            },
            {
              onConflict: "email_address",
            }
          );

        if (error) {
          console.error("Error saving provider account:", error);
          setStatus("error");
          return;
        }

        setStatus("success");
        setTimeout(() => {
          router.push("/settings/email?connected=gmail");
        }, 1000);
      } catch (e) {
        console.error("Error completing connection:", e);
        setStatus("error");
      }
    }

    completeConnection();
  }, [searchParams, router, supabase]);

  if (status === "loading") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <div className="text-lg">Completing connection...</div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center text-red-600">
          <div className="text-lg">Failed to complete connection</div>
          <button
            onClick={() => router.push("/settings/email")}
            className="mt-4 text-blue-600 underline"
          >
            Go back to settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-center text-green-600">
        <div className="text-lg">Connection successful!</div>
        <div className="text-sm mt-2">Redirecting...</div>
      </div>
    </div>
  );
}

