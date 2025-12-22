"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function IntegrationsPage() {
  const [linkedinLinked, setLinkedinLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadIntegrations();
    
    // Check for URL params (success/error messages from OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const errorParam = params.get("error");
    
    if (connected === "linkedin") {
      setError(null);
      // Refresh integrations
      loadIntegrations();
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/settings/integrations");
    }
    
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/settings/integrations");
    }
  }, []);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Try to get workspace_id first (matches integrations table structure)
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      let orgId: string | null = null;
      
      if (workspaceMember?.workspace_id) {
        orgId = workspaceMember.workspace_id;
      } else {
        // Fallback: try organization_members
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("org_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();
        
        orgId = orgMember?.org_id || null;
      }

      if (!orgId) {
        setLoading(false);
        return;
      }

      // Check for LinkedIn integration
      const { data: linkedinIntegration } = await supabase
        .from("integrations")
        .select("*")
        .eq("org_id", orgId)
        .eq("channel", "linkedin")
        .single();

      setLinkedinLinked(!!linkedinIntegration);
    } catch (error) {
      console.error("Error loading integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-2xl font-bold">Integrations ⚡</h1>
      
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="border rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">LinkedIn</p>
          <p className="text-sm text-muted-foreground">
            Send and track DMs directly inside SmartSend.
          </p>
        </div>
        {!linkedinLinked ? (
          <a
            href="/api/linkedin/connect"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl hover:bg-primary/90 disabled:opacity-50 inline-block"
          >
            Connect
          </a>
        ) : (
          <button
            disabled
            className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl opacity-75 cursor-not-allowed"
          >
            Connected ✅
          </button>
        )}
      </div>
    </div>
  );
}

