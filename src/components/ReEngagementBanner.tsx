"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase";
import { X } from "lucide-react";

export default function ReEngagementBanner() {
  const [show, setShow] = useState(false);
  const [daysInactive, setDaysInactive] = useState<number | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const checkInactivity = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Check if user is in inactive_users view (7+ days inactive)
        const { data: inactiveData } = await supabase
          .from("inactive_users")
          .select("days_inactive")
          .eq("user_id", user.id)
          .maybeSingle();

        if (inactiveData) {
          // days_inactive is now a numeric value (days as float)
          const days = Math.floor(inactiveData.days_inactive || 0);
          setDaysInactive(days);
          setShow(days >= 7);
        }
      } catch (error) {
        console.error("Error checking inactivity:", error);
      }
    };

    checkInactivity();
  }, [supabase]);

  if (!show || daysInactive === null) {
    return null;
  }

  return (
    <div className="bg-amber-50 border-y border-amber-200 text-amber-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-2 text-sm">
          <div className="flex items-center">
            <span className="mr-2">👋</span>
            <span>
              Welcome back! Your leads are waiting — restart your last campaign
              in one click.
            </span>
            <Link
              href="/dashboard/campaigns"
              className="underline ml-1 font-semibold hover:text-amber-800"
            >
              Resume now
            </Link>
          </div>
          <button
            onClick={() => setShow(false)}
            className="ml-4 text-amber-700 hover:text-amber-900"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

