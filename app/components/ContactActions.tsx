"use client";

import React from "react";

type Props = {
  homeownerEmail: string | null;
  homeownerPhone: string | null;
};

export const ContactActions: React.FC<Props> = ({
  homeownerEmail,
  homeownerPhone,
}) => {
  const hasPhone = !!homeownerPhone;
  const hasEmail = !!homeownerEmail;

  if (!hasPhone && !hasEmail) {
    return (
      <span className="text-[10px] text-zinc-500">
        No contact info yet
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {hasPhone && (
        <a
          href={`tel:${homeownerPhone}`}
          className="rounded-xl bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
        >
          Call
        </a>
      )}
      {hasEmail && (
        <a
          href={`mailto:${homeownerEmail}`}
          className="rounded-xl bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          Email
        </a>
      )}
    </div>
  );
};















































