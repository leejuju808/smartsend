"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SignatureResponse = {
  ok: boolean;
  best?: {
    fullname?: string | null;
    phone?: string | null;
    title?: string | null;
    company?: string | null;
    location?: string | null;
    tz_hint?: string | null;
    website?: string | null;
    linkedin_url?: string | null;
    twitter_url?: string | null;
  } | null;
};

export function SignatureCard({ leadId }: { leadId: string }) {
  const { data } = useSWR<SignatureResponse>(
    leadId ? `/api/leads/${leadId}/signature-facts` : null,
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: 6000 },
  );

  const b = data?.best;
  if (!b) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact details (parsed)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {b.fullname ? (
          <div>
            <span className="font-medium">Name:</span> {b.fullname}
          </div>
        ) : null}
        {b.title ? (
          <div>
            <span className="font-medium">Title:</span> {b.title}
          </div>
        ) : null}
        {b.company ? (
          <div>
            <span className="font-medium">Company:</span> {b.company}
          </div>
        ) : null}
        {b.phone ? (
          <div>
            <span className="font-medium">Phone:</span> {b.phone}
          </div>
        ) : null}
        {b.tz_hint || b.location ? (
          <div className="flex flex-wrap gap-2">
            {b.tz_hint ? <Badge variant="secondary">{b.tz_hint}</Badge> : null}
            {b.location ? <Badge variant="outline">{b.location}</Badge> : null}
          </div>
        ) : null}
        {b.website || b.linkedin_url || b.twitter_url ? (
          <div className="flex gap-3 text-xs">
            {b.website ? (
              <a className="underline" href={b.website} target="_blank" rel="noreferrer">
                Website
              </a>
            ) : null}
            {b.linkedin_url ? (
              <a className="underline" href={b.linkedin_url} target="_blank" rel="noreferrer">
                LinkedIn
              </a>
            ) : null}
            {b.twitter_url ? (
              <a className="underline" href={b.twitter_url} target="_blank" rel="noreferrer">
                Twitter/X
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

