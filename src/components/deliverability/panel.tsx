"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DeliverabilityReport {
  id: string;
  workspace_id: string;
  score: number;
  dmarc_pass: boolean | null;
  spf_pass: boolean | null;
  dkim_pass: boolean | null;
  spam_words: string[] | null;
  warmup_recommended: boolean | null;
  inbox_placement: {
    inbox: number;
    promotions: number;
    spam: number;
  } | null;
  created_at: string;
}

interface DeliverabilityResponse {
  report: DeliverabilityReport | null;
}

export function DeliverabilityPanel({ workspaceId }: { workspaceId: string }) {
  const [testEmailBody, setTestEmailBody] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const { data, error, mutate } = useSWR<DeliverabilityResponse>(
    `/api/workspaces/${workspaceId}/deliverability`,
    fetcher
  );

  async function runTest() {
    if (!testEmailBody.trim()) {
      alert("Please paste your sample cold email to test.");
      return;
    }

    setIsRunning(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/deliverability/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: testEmailBody }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to run test");
      }

      // Refresh the data
      await mutate();
    } catch (err: any) {
      console.error("Error running deliverability test:", err);
      alert(err.message || "Failed to run deliverability test");
    } finally {
      setIsRunning(false);
    }
  }

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Error loading deliverability data: {error.message}
      </div>
    );
  }

  const report = data?.report;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          {report ? (
            <>
              <div>
                <p className="font-bold text-2xl mb-2">
                  Deliverability Score: {report.score}/100
                </p>
                <p className="text-sm opacity-75">
                  The higher your score, the more likely your emails land in the inbox.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <Status label="SPF" pass={report.spf_pass} />
                <Status label="DKIM" pass={report.dkim_pass} />
                <Status label="DMARC" pass={report.dmarc_pass} />
              </div>

              {report.spam_words && report.spam_words.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-sm border border-red-200 dark:border-red-800">
                  <p className="font-semibold mb-2">Spam Words Detected:</p>
                  <ul className="list-disc ml-5 space-y-1">
                    {report.spam_words.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.warmup_recommended && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-sm border border-yellow-200 dark:border-yellow-800">
                  <p className="font-semibold">⚠️ Warm-up Recommended</p>
                  <p className="mt-1">
                    Your domain needs warm-up before sending cold emails. This helps protect your domain reputation.
                  </p>
                </div>
              )}

              {report.inbox_placement && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Inbox Placement Test Results</h3>
                  <ul className="text-sm space-y-1">
                    <li className="flex justify-between">
                      <span>Inbox:</span>
                      <span className="font-medium text-green-600">{report.inbox_placement.inbox}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Promotions:</span>
                      <span className="font-medium text-yellow-600">{report.inbox_placement.promotions}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Spam:</span>
                      <span className="font-medium text-red-600">{report.inbox_placement.spam}</span>
                    </li>
                  </ul>
                </div>
              )}

              {report.created_at && (
                <p className="text-xs text-muted-foreground">
                  Last scan: {new Date(report.created_at).toLocaleString()}
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No deliverability report yet. Run a test to get started.
              </p>
            </div>
          )}

          <div className="border-t pt-4 space-y-4">
            <div>
              <label htmlFor="testEmailBody" className="block text-sm font-medium mb-2">
                Test Email Body
              </label>
              <Textarea
                id="testEmailBody"
                placeholder="Paste your sample cold email here to test for spam words and deliverability..."
                value={testEmailBody}
                onChange={(e) => setTestEmailBody(e.target.value)}
                rows={8}
                className="w-full"
              />
            </div>

            <Button
              onClick={runTest}
              disabled={isRunning || !testEmailBody.trim()}
              className="w-full"
            >
              {isRunning ? "Running Test..." : "Run Deliverability Test"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Status({ label, pass }: { label: string; pass: boolean | null }) {
  if (pass === null) {
    return (
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-gray-500 font-bold">—</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm">{label}</p>
      <p className={pass ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
        {pass ? "PASS" : "FAIL"}
      </p>
    </div>
  );
}










