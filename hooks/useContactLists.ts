// Block 14600 — Contact Lists Hook
// Hook for fetching contact lists

import useSWR from "swr";

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export function useContactLists() {
  const { data, error, mutate } = useSWR<ContactList[]>(
    "/api/contact-lists",
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    lists: data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}
















