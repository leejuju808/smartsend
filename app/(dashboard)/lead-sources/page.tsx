"use client";

// Block 22052 — SmartSend Roofing Lead Source Performance Brain v1
// Page route for Lead Source Performance dashboard

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/ssr";
import { LeadSourcePage } from "@/components/lead-source/LeadSourcePage";
import { useRouter } from "next/navigation";

export default function LeadSourcesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    async function getWorkspaceId() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        // Get user's workspace
        const { data: workspaceMember, error } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching workspace:", error);
          return;
        }

        if (workspaceMember?.workspace_id) {
          setWorkspaceId(workspaceMember.workspace_id);
        } else {
          // Try to get from user metadata
          const wsId = user.app_metadata?.workspace_id as string | undefined;
          if (wsId) {
            setWorkspaceId(wsId);
          }
        }
      } catch (error) {
        console.error("Error getting workspace:", error);
      } finally {
        setLoading(false);
      }
    }

    getWorkspaceId();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-red-600">
          Error: No workspace found. Please create a workspace first.
        </div>
      </div>
    );
  }

  return <LeadSourcePage workspaceId={workspaceId} />;
}









































