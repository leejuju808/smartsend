// components/SubscriptionStatus.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface SubscriptionData {
  status: string;
  current_period_end: string;
}

export default function SubscriptionStatus() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSubscription() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("billing_subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(data);
      setLoading(false);
    }

    fetchSubscription();
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading subscription status...</div>;
  }

  if (!subscription) {
    return (
      <div className="text-sm text-gray-500">
        No active subscription
      </div>
    );
  }

  const isActive = ["trialing", "active", "past_due"].includes(subscription.status);
  const statusColor = isActive ? "text-green-600" : "text-red-600";
  const statusText = subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1);

  return (
    <div className="text-sm">
      <span className={`font-medium ${statusColor}`}>
        {statusText}
      </span>
      {subscription.current_period_end && (
        <div className="text-gray-500">
          Renews: {new Date(subscription.current_period_end).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}