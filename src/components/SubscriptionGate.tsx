// components/SubscriptionGate.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import BillingButtons from "./BillingButtons";

interface SubscriptionGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireActive?: boolean;
}

export default function SubscriptionGate({ 
  children, 
  fallback,
  requireActive = true 
}: SubscriptionGateProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHasAccess(false);
        setLoading(false);
        return;
      }

      if (!requireActive) {
        setHasAccess(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("billing_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isActive = !!data && ["trialing", "active", "past_due"].includes(data.status);
      setHasAccess(isActive);
      setLoading(false);
    }

    checkAccess();
  }, [requireActive]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Checking subscription...</div>
      </div>
    );
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Subscription Required</h3>
        <p className="text-gray-600 mb-4">
          This feature requires an active subscription.
        </p>
        <BillingButtons />
      </div>
    );
  }

  return <>{children}</>;
}