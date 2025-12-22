"use client";

import * as React from "react";

type TeamMember = {
  email?: string;
  avatar_url?: string | null;
};

export function AvatarStack({ team, max = 5 }: { team: TeamMember[]; max?: number }) {
  const shown = team.slice(0, max);
  const remain = team.length - shown.length;

  return (
    <div className="flex -space-x-2">
      {shown.map((member, idx) => (
        <Avatar key={`${member.email ?? "member"}-${idx}`} email={member.email} url={member.avatar_url ?? undefined} />
      ))}
      {remain > 0 && (
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs">
          +{remain}
        </div>
      )}
    </div>
  );
}

function Avatar({ email, url }: { email?: string; url?: string }) {
  const initials = (email ?? "?").split("@")[0]?.slice(0, 2).toUpperCase();

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={email ?? ""} className="h-8 w-8 rounded-full border object-cover" />;
  }

  return (
    <div className="grid h-8 w-8 place-items-center rounded-full border bg-muted text-xs">
      {initials || "?"}
    </div>
  );
}




