"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { LeadProfileDrawerUnified } from "@/components/leads/LeadProfileDrawerUnified";

type LeadDrawerContextValue = {
  openLead: (leadId: string) => void;
  closeLead: () => void;
  activeLeadId: string | null;
};

const LeadDrawerContext = createContext<LeadDrawerContextValue | undefined>(
  undefined
);

export function LeadDrawerProvider({ children }: { children: ReactNode }) {
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const openLead = useCallback((leadId: string) => {
    setActiveLeadId(leadId);
  }, []);

  const closeLead = useCallback(() => {
    setActiveLeadId(null);
  }, []);

  const value: LeadDrawerContextValue = {
    openLead,
    closeLead,
    activeLeadId,
  };

  return (
    <LeadDrawerContext.Provider value={value}>
      {children}
      {activeLeadId && (
        <LeadProfileDrawerUnified leadId={activeLeadId} onClose={closeLead} />
      )}
    </LeadDrawerContext.Provider>
  );
}

export function useLeadDrawer() {
  const ctx = useContext(LeadDrawerContext);
  if (!ctx) {
    throw new Error("useLeadDrawer must be used inside LeadDrawerProvider");
  }
  return ctx;
}

