"use client";

import clsx from "clsx";

export default function MessageBubble({
  direction,
  from,
  time,
  html,
  text,
}: {
  direction: "inbound" | "outbound";
  from: string;
  time: string;
  html?: string | null;
  text?: string | null;
}) {
  return (
    <div className={clsx("w-full", direction === "outbound" ? "text-right" : "text-left")}>
      <div
        className={clsx(
          "inline-block max-w-[80%] rounded-2xl p-3 shadow",
          direction === "outbound" ? "bg-primary/10" : "bg-muted"
        )}
      >
        <div className="text-xs opacity-70 mb-1">
          {from} • {new Date(time).toLocaleString()}
        </div>
        {html ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{text}</p>
        )}
      </div>
    </div>
  );
}

