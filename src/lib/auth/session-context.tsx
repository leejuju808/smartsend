/**
 * Block 20870 — Client-Side Session Context Provider
 * Provides session context (user, org, role) to React components
 */

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SessionContext as SessionContextType, RoofingTeamRole } from "./session-guard";

interface SessionContextValue {
  context: SessionContextType | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  context: null,
  loading: true,
  refresh: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<SessionContextType | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSessionContext = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setContext(null);
        setLoading(false);
        return;
      }

      // Call the database function to get session context
      const { data, error } = await supabase.rpc("get_session_context");

      if (error || !data || data.length === 0) {
        console.error("Error loading session context:", error);
        setContext(null);
        setLoading(false);
        return;
      }

      const sessionData = data[0];
      if (!sessionData.organization_id || !sessionData.role) {
        setContext(null);
        setLoading(false);
        return;
      }

      setContext({
        user_id: sessionData.user_id,
        organization_id: sessionData.organization_id,
        role: sessionData.role as RoofingTeamRole,
        email: sessionData.email || user.email || "",
      });
    } catch (error) {
      console.error("Error loading session context:", error);
      setContext(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessionContext();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadSessionContext();
      } else if (event === "SIGNED_OUT") {
        setContext(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        context,
        loading,
        refresh: loadSessionContext,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Hook to check if user has a specific role
 */
export function useHasRole(role: RoofingTeamRole): boolean {
  const { context } = useSession();
  return context?.role === role || false;
}

/**
 * Hook to check if user has any of the specified roles
 */
export function useHasAnyRole(roles: RoofingTeamRole[]): boolean {
  const { context } = useSession();
  return context ? roles.includes(context.role) : false;
}

/**
 * Hook to check if user can perform an action
 */
export function useCanPerform(action: string): boolean {
  const { context } = useSession();
  if (!context) return false;

  const permissions: Record<RoofingTeamRole, string[]> = {
    OWNER: [
      "send_proposal",
      "send_adjuster_email",
      "update_job_stage",
      "view_all_leads",
      "edit_pricing",
      "manage_team",
      "manage_billing",
      "view_revenue_dashboard",
    ],
    SALES_REP: [
      "send_proposal",
      "update_job_stage",
      "view_assigned_leads",
      "send_homeowner_email",
    ],
    OFFICE_STAFF: [
      "view_all_leads",
      "send_homeowner_email",
      "update_scheduling_stages",
      "view_calendar",
    ],
    ADJUSTER_HELPER: [
      "view_claim_leads",
      "draft_adjuster_email",
      "view_insurance_data",
    ],
  };

  return permissions[context.role]?.includes(action) || false;
}

/**
 * Component to conditionally render based on role
 */
export function RequireRole({
  roles,
  children,
  fallback,
}: {
  roles: RoofingTeamRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { context, loading } = useSession();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!context || !roles.includes(context.role)) {
    return fallback || null;
  }

  return <>{children}</>;
}
















































