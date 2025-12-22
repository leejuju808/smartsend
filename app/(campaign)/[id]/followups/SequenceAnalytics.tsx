"use client";

import useSWR from "swr";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SequenceAnalyticsResponse = {
  steps: Array<Record<string, unknown>>;
  branches: Array<Record<string, unknown>>;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SequenceAnalytics({ sequenceId }: { sequenceId: string }) {
  const { data } = useSWR<SequenceAnalyticsResponse>(
    sequenceId ? `/api/analytics/sequence/${sequenceId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const steps = (data?.steps ?? []).map((step: Record<string, any>) => ({
    step: step.step_id,
    sent: Number(step.sent_count ?? 0),
    open: Number(step.open_count ?? 0),
    click: Number(step.click_count ?? 0),
    reply: Number(step.reply_count ?? 0),
    openRate: Number(step.open_rate ?? 0),
    clickRate: Number(step.click_rate ?? 0),
    replyRate: Number(step.reply_rate ?? 0),
    medianReplyHours: Number(step.median_hours_to_reply ?? 0),
  }));

  const branches = (data?.branches ?? []).map((branch: Record<string, any>) => ({
    sequenceId: branch.sequence_id,
    stepId: branch.step_id,
    gotoStep: branch.goto_step,
    hits: Number(branch.hits ?? 0),
    sharePct: Number(branch.share_pct ?? 0),
  }));

  const hasStepData = steps.length > 0;
  const hasBranchData = branches.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Step Funnel (Sent → Reply)</CardTitle>
        </CardHeader>
        <CardContent style={{ height: 280 }}>
          {hasStepData ? (
            <ResponsiveContainer>
              <BarChart data={steps}>
                <XAxis dataKey="step" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="sent" fill="#6366f1" />
                <Bar dataKey="open" fill="#22d3ee" />
                <Bar dataKey="click" fill="#10b981" />
                <Bar dataKey="reply" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No step data yet." />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Rates by Step (%)</CardTitle>
        </CardHeader>
        <CardContent style={{ height: 280 }}>
          {hasStepData ? (
            <ResponsiveContainer>
              <LineChart data={steps}>
                <XAxis dataKey="step" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="openRate" stroke="#22d3ee" strokeWidth={2} />
                <Line type="monotone" dataKey="clickRate" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="replyRate" stroke="#f97316" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Rates will appear once sends go out." />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Median Hours to Reply</CardTitle>
        </CardHeader>
        <CardContent style={{ height: 260 }}>
          {hasStepData ? (
            <ResponsiveContainer>
              <BarChart data={steps}>
                <XAxis dataKey="step" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="medianReplyHours" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Median reply times will show once replies arrive." />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Branch Hits (share %)</CardTitle>
        </CardHeader>
        <CardContent>
          {hasBranchData ? (
            <div className="space-y-2 text-sm">
              {branches.map((branch) => (
                <div
                  key={`${branch.sequenceId}-${branch.stepId}-${branch.gotoStep}`}
                  className="flex justify-between"
                >
                  <span>
                    Step {branch.stepId} → {branch.gotoStep}
                  </span>
                  <span>
                    {branch.hits} hits • {branch.sharePct}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Branch performance will populate after leads advance." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}


