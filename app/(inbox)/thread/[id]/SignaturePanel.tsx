"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SignatureFact = {
  id: string;
  account_id: string;
  lead_id: string | null;
  full_name: string | null;
  title: string | null;
  company: string | null;
  phones: { raw?: string | null; e164?: string | null; label?: string | null }[] | null;
  emails: { email?: string | null; label?: string | null }[] | null;
  website: string | null;
  timezone: string | null;
  addr_text: string | null;
  created_at: string;
  message_id: string;
};

type SignatureResponse = {
  ok: boolean;
  fact: SignatureFact | null;
};

function fetcher(url: string) {
  return fetch(url).then((res) => res.json() as Promise<SignatureResponse>);
}

export function SignaturePanel({ messageId }: { messageId: string }) {
  const { data, mutate } = useSWR(messageId ? `/api/signature/${messageId}` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const [applying, setApplying] = useState(false);

  const fact = data?.fact ?? null;

  if (!fact) {
    return null;
  }

  const phones = (fact.phones ?? []).filter(Boolean);
  const emails = (fact.emails ?? []).filter((e) => e?.email);

  const chips: { label: string; className?: string }[] = [];
  if (fact.timezone) {
    chips.push({ label: `TZ: ${fact.timezone}` });
  }
  if (emails.length) {
    chips.push({ label: `Alt email: ${emails[0]!.email!.toLowerCase()}` });
  }
  if (phones.length) {
    const phone = phones[0]!;
    chips.push({ label: `Phone: ${phone.e164 ?? phone.raw ?? ""}` });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Signature</CardTitle>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className={cn("text-xs", chip.className)}>
                {chip.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {fact.full_name ? (
          <div>
            <span className="font-medium">Name:</span> {fact.full_name}
          </div>
        ) : null}
        {fact.title ? (
          <div>
            <span className="font-medium">Title:</span> {fact.title}
          </div>
        ) : null}
        {fact.company ? (
          <div>
            <span className="font-medium">Company:</span> {fact.company}
          </div>
        ) : null}
        {emails.length ? (
          <div>
            <span className="font-medium">Emails:</span>{" "}
            {emails.map((email) => email.email?.toLowerCase()).join(", ")}
          </div>
        ) : null}
        {phones.length ? (
          <div>
            <span className="font-medium">Phones:</span>{" "}
            {phones
              .map((phone) => phone.e164 ?? phone.raw)
              .filter(Boolean)
              .join(", ")}
          </div>
        ) : null}
        {fact.website ? (
          <div>
            <span className="font-medium">Website:</span> {fact.website}
          </div>
        ) : null}
        {fact.timezone ? (
          <div>
            <span className="font-medium">Timezone:</span> {fact.timezone}
          </div>
        ) : null}
        {fact.addr_text ? (
          <div>
            <span className="font-medium">Address:</span> {fact.addr_text}
          </div>
        ) : null}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={async () => {
              if (!fact.lead_id) {
                return;
              }
              setApplying(true);
              try {
                const res = await fetch(`/api/signature/${messageId}/apply`, { method: "POST" });
                if (!res.ok) {
                  throw new Error(await res.text());
                }
                await mutate();
              } catch (error) {
                console.error("apply signature enrichment failed", error);
              } finally {
                setApplying(false);
              }
            }}
            disabled={applying || !fact.lead_id}
          >
            {applying ? "Applying…" : "Apply to Lead"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => mutate()}>
            Refresh
          </Button>
        </div>
        {!fact.lead_id ? (
          <div className="text-xs text-muted-foreground">
            No linked lead detected; enrichment apply is disabled.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

