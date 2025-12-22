// Block 25060 — SmartSend Roofing Task Manager v1
// Task Manager Page

"use client";

import { useEffect, useState } from "react";
import { TaskManager } from "@/components/tasks/TaskManager";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function TasksPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function loadUserData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        setUserId(user.id);

        // Get workspace_id from user's workspace membership
        const { data: membership } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (membership) {
          setWorkspaceId(membership.workspace_id);
        } else {
          // Fallback: try to get from workspaces table
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("id")
            .eq("owner_id", user.id)
            .limit(1)
            .single();

          if (workspace) {
            setWorkspaceId(workspace.id);
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!workspaceId || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Unable to load workspace</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <TaskManager workspaceId={workspaceId} userId={userId} />
    </div>
  );
}
