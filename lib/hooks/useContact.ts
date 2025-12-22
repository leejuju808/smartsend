import { useState, useEffect } from "react";
import type { ContactProfile } from "@/lib/types/contact";

export function useContact(contactId: string | null) {
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contacts/${contactId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? "Failed to load contact");
          setContact(null);
        } else {
          setContact(json);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contact");
        setContact(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [contactId]);

  const updateContact = async (updates: Partial<ContactProfile["contact"]>) => {
    if (!contactId) return;

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to update contact");
      }
      // Reload contact data
      const reloadRes = await fetch(`/api/contacts/${contactId}`, {
        cache: "no-store",
      });
      const reloadJson = await reloadRes.json();
      if (reloadRes.ok) {
        setContact(reloadJson);
      }
      return json;
    } catch (err) {
      throw err;
    }
  };

  return {
    contact,
    loading,
    error,
    updateContact,
    reload: () => {
      if (contactId) {
        void fetch(`/api/contacts/${contactId}`, { cache: "no-store" })
          .then((res) => res.json())
          .then((json) => {
            if (res.ok) setContact(json);
          });
      }
    },
  };
}





























































