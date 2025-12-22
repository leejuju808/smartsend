"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = searchParams.get("workspace_id");
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (!workspaceId) {
      setError("Invalid invite link");
      return;
    }

    loadWorkspace();
  }, [workspaceId]);

  async function loadWorkspace() {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const { data: workspaceData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("id", workspaceId)
        .single();

      if (workspaceError || !workspaceData) {
        setError("Workspace not found");
        return;
      }

      setWorkspace(workspaceData);

      // Check if user is already logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Check if already a member
        const { data: member } = await supabase
          .from("team_members")
          .select("status")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (member && member.status === "active") {
          setAccepted(true);
        }
      }
    } catch (err) {
      console.error("Error loading workspace:", err);
      setError("Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!workspaceId) return;

    try {
      setAccepting(true);
      setError(null);

      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Redirect to login with return URL
        const returnUrl = encodeURIComponent(`/team/accept?workspace_id=${workspaceId}`);
        router.push(`/auth/login?return_to=${returnUrl}`);
        return;
      }

      const response = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to accept invitation");
        return;
      }

      setAccepted(true);
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      console.error("Error accepting invite:", err);
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading...</div>
        </div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invitation Accepted!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              You've successfully joined the workspace: <strong>{workspace?.name}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting to dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>You've been invited to join SmartSend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspace && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Workspace:</strong> {workspace.name}
              </p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-900">{error}</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Click the button below to accept the invitation and join this workspace.
          </p>
          <Button
            onClick={handleAccept}
            disabled={accepting || !workspaceId}
            className="w-full"
          >
            {accepting ? "Accepting..." : "Accept Invitation"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
