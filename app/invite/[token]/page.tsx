"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/src/utils/supabase/client";

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [status, setStatus] = useState<"loading" | "idle" | "submitting" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; workspaceName: string; role: string } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Invalid invite link");
      return;
    }

    // Check if user is authenticated
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);

      // Fetch invite details
      const { data: invite, error: inviteError } = await supabase
        .from("workspace_invites")
        .select("email, workspace_id, role, expires_at, accepted")
        .eq("token", token)
        .single();

      if (inviteError || !invite) {
        setStatus("error");
        setError("Invalid or expired invite");
        return;
      }

      if (invite.accepted) {
        setStatus("error");
        setError("This invite has already been accepted");
        return;
      }

      if (new Date(invite.expires_at) < new Date()) {
        setStatus("error");
        setError("This invite has expired");
        return;
      }

      // Get workspace name
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", invite.workspace_id)
        .single();

      setInviteInfo({
        email: invite.email,
        workspaceName: workspace?.name || "a workspace",
        role: invite.role,
      });

      setStatus("idle");
    };

    void checkAuth();
  }, [token]);

  const acceptInvite = async () => {
    if (!token) return;

    setStatus("submitting");
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login with return URL
        router.push(`/login?redirect=/invite/${token}`);
        return;
      }

      // Accept invite via RPC
      const { data: workspaceId, error: acceptError } = await supabase.rpc(
        "accept_workspace_invite",
        { p_token: token }
      );

      if (acceptError) {
        throw new Error(acceptError.message || "Failed to accept invite");
      }

      setStatus("success");

      // Redirect to workspace after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to accept invite";
      setError(message);
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-600">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg bg-white p-8 shadow-sm">
          <div className="text-center">
            <div className="mb-4 text-4xl">❌</div>
            <h1 className="mb-2 text-xl font-semibold">Invite Error</h1>
            <p className="mb-6 text-sm text-gray-600">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg bg-white p-8 shadow-sm">
          <div className="text-center">
            <div className="mb-4 text-4xl">✅</div>
            <h1 className="mb-2 text-xl font-semibold">Invite Accepted!</h1>
            <p className="mb-6 text-sm text-gray-600">
              You've successfully joined <strong>{inviteInfo?.workspaceName}</strong>
            </p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md rounded-lg bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold">Join Workspace</h1>
          <p className="mb-6 text-sm text-gray-600">
            You've been invited to join <strong>{inviteInfo?.workspaceName}</strong> as a{" "}
            <strong>{inviteInfo?.role}</strong>
          </p>

          {!isAuthenticated && (
            <div className="mb-6 rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">
              <p className="mb-2">You need to sign in to accept this invite.</p>
              <button
                onClick={() => router.push(`/login?redirect=/invite/${token}`)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Sign In
              </button>
            </div>
          )}

          {isAuthenticated && (
            <>
              <p className="mb-6 text-sm text-gray-500">
                Signed in as: <strong>{inviteInfo?.email}</strong>
              </p>
              <button
                onClick={acceptInvite}
                disabled={status === "submitting"}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {status === "submitting" ? "Accepting..." : "Accept Invitation"}
              </button>
            </>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

