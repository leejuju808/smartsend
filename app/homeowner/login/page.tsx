"use client";

// Block 44000 — SmartSend Roofing Homeowner Portal Login
// Magic link login page for homeowners

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";

export default function HomeownerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homeowner-create-magic-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            homeowner_email: email,
            job_id: jobId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create magic link");
      }

      const data = await response.json();
      setSuccess(true);

      // Redirect to magic link if provided, or show success message
      if (data.magic_link) {
        // Auto-redirect after 2 seconds
        setTimeout(() => {
          window.location.href = data.magic_link;
        }, 2000);
      }
    } catch (err: any) {
      console.error("Error creating magic link:", err);
      setError(err.message || "Failed to send magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-green-600">Magic Link Sent!</CardTitle>
            <CardDescription>
              Check your email for a secure login link. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Your Roofing Job Portal
          </CardTitle>
          <CardDescription>
            Enter your email and job ID to receive a secure login link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobId">Job ID</Label>
              <Input
                id="jobId"
                type="text"
                placeholder="Enter your job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500">
                Your job ID was provided by your roofing company
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Magic Link...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Magic Link
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
































