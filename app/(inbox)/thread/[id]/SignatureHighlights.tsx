"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";

type SignatureFact = {
  timezone: string | null;
  emails: { email?: string | null; label?: string | null }[] | null;
  phones: { raw?: string | null; e164?: string | null; label?: string | null }[] | null;
};

type SignatureResponse = {
  ok: boolean;
  fact: (SignatureFact & { id: string }) | null;
};

function fetcher(url: string) {
  return fetch(url).then((res) => res.json() as Promise<SignatureResponse>);
}

export function SignatureHighlights({ messageId }: { messageId: string }) {
  const { data } = useSWR(messageId ? `/api/signature/${messageId}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const fact = data?.fact ?? null;
  if (!fact) {
    return null;
  }

  const emails = (fact.emails ?? []).filter((item) => item?.email).slice(0, 2);
  const phones = (fact.phones ?? []).filter((item) => item && (item.e164 || item.raw)).slice(0, 2);

  return (
    <div className="flex flex-wrap gap-2">
      {fact.timezone ? (
        <Badge variant="outline" className="text-xs">
          TZ: {fact.timezone}
        </Badge>
      ) : null}
      {emails.map((item) => (
        <Badge key={`sig-email-${item.email}`} variant="outline" className="text-xs">
          Alt email: {item.email?.toLowerCase()}
        </Badge>
      ))}
      {phones.map((item, index) => (
        <Badge key={`sig-phone-${index}`} variant="outline" className="text-xs">
          Phone: {item.e164 ?? item.raw}
        </Badge>
      ))}
    </div>
  );
}

