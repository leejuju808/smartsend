"use client";

import useSWR from "swr";

type LeadNote = {
  id: string;
  body: string;
  is_pinned?: boolean;
};

export default function Pinned({ leadId }: { leadId: string }) {
  const { data } = useSWR(`/api/leads/${leadId}/notes`, (url) => fetch(url).then((r) => r.json()));
  const notes: LeadNote[] = Array.isArray(data) ? data : [];
  const pinned = notes.find((note) => note.is_pinned);

  if (!pinned) {
    return null;
  }

  return <div className="rounded-xl border bg-amber-50 p-3 text-sm">{pinned.body}</div>;
}


