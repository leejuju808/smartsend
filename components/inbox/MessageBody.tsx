"use client";

import * as React from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type BodyResponse = {
  body: {
    clean_text: string | null;
    body_html: string | null;
    cleaned_at?: string | null;
    fetched_at?: string | null;
  } | null;
};

type MessageBodyProps = {
  accountId?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  fallbackPlain?: string | null;
  fallbackHtml?: string | null;
  className?: string;
};

export function MessageBody({
  accountId,
  provider,
  providerMessageId,
  fallbackPlain,
  fallbackHtml,
  className,
}: MessageBodyProps) {
  const [showOriginal, setShowOriginal] = React.useState(false);

  const key =
    accountId && provider && providerMessageId
      ? `/api/messages/body?account_id=${encodeURIComponent(accountId)}&provider=${encodeURIComponent(
          provider,
        )}&mid=${encodeURIComponent(providerMessageId)}`
      : null;

  const { data, isValidating } = useSWR<BodyResponse>(key, fetcher);
  const body = data?.body ?? null;

  const cleaned = body?.clean_text?.trim() || null;
  const html = body?.body_html ?? fallbackHtml ?? null;
  const fallbackText = fallbackPlain?.trim() || null;

  const loading = Boolean(key && !body && isValidating);
  const canToggle = Boolean(html && cleaned);

  let content: React.ReactNode = null;
  if (showOriginal && html) {
    content = (
      <div
        className="prose prose-invert max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } else if (cleaned) {
    content = <pre className="whitespace-pre-wrap text-sm">{cleaned}</pre>;
  } else if (html) {
    content = (
      <div
        className="prose prose-invert max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } else if (fallbackText) {
    content = <pre className="whitespace-pre-wrap text-sm">{fallbackText}</pre>;
  } else {
    content = <div className="text-sm text-muted-foreground">No content yet…</div>;
  }

  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      {loading ? <div className="text-xs text-muted-foreground">Loading content…</div> : null}
      {content}
      {canToggle ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => setShowOriginal((prev) => !prev)}
        >
          {showOriginal ? "View clean text" : "View original HTML"}
        </button>
      ) : null}
    </div>
  );
}

