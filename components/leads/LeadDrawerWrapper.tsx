"use client";

import { LeadDrawerProvider } from "@/contexts/LeadDrawerContext";

export function LeadDrawerWrapper({ children }: { children: React.ReactNode }) {
  return <LeadDrawerProvider>{children}</LeadDrawerProvider>;
}
