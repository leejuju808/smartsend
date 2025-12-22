"use client";
import { create } from "zustand";

type Lead = {
  id: string;
  lead_email: string | null;
  lead_name: string | null;
  reply_text: string | null;
  replied_at: string | null;
  thread_id: string | null;
  campaign_id: string;
};

type State = {
  open: boolean;
  lead?: Lead;
  openWith: (lead: Lead) => void;
  close: () => void;
};

export const useReplyModal = create<State>((set) => ({
  open: false,
  lead: undefined,
  openWith: (lead) => set({ open: true, lead }),
  close: () => set({ open: false, lead: undefined }),
}));

