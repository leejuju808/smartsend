"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Toast from "./Toast";

export default function UpgradeToastClient() {
  const router = useRouter();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);

  // Show toast if ?upgraded=1 is present, then clean the URL
  useEffect(() => {
    const upgraded = search.get("upgraded");
    if (upgraded === "1") {
      setOpen(true);

      // strip upgraded + session_id from the query string
      const params = new URLSearchParams(Array.from(search.entries()));
      params.delete("upgraded");
      params.delete("session_id");
      const qs = params.toString();
      router.replace(`/dashboard${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [search, router]);

  if (!open) return null;

  return (
    <Toast onClose={() => setOpen(false)}>
      Upgraded to Pro 🎉 Welcome aboard!
    </Toast>
  );
} 