"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    company_name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing invite token");
      setLoading(false);
      return;
    }

    loadInvite();
  }, [token]);

  async function loadInvite() {
    try {
      setLoading(true);
      const res = await fetch(`/api/invite/accept?token=${token}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load invite");
        return;
      }

      setInvite(data);
    } catch (err: any) {
      setError(err.message || "Failed to load invite");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!token) return;

    try {
      setAccepting(true);
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to accept invite");
        return;
      }

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading invite...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invite</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.push("/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invite) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You&apos;ve been invited!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-2">
              <strong>{invite.company_name}</strong> invited you to join their SmartSend account.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Email:</span>
                <span className="text-sm font-medium">{invite.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Role:</span>
                <Badge variant="outline" className="capitalize">
                  {invite.role}
                </Badge>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full"
            >
              {accepting ? "Accepting..." : "Accept Invite"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Make sure you&apos;re logged in with the email address above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
