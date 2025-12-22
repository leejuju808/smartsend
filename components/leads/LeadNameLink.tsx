"use client";

import { useLeadDrawer } from "@/contexts/LeadDrawerContext";

/**
 * Example component showing how to open the Lead Profile Drawer
 * by clicking on a lead's name anywhere in the app.
 * 
 * Usage:
 * <LeadNameLink leadId={lead.id}>{lead.name || lead.email}</LeadNameLink>
 */
export function LeadNameLink({
  leadId,
  children,
  className = "text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer",
}: {
  leadId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { openLeadDrawer } = useLeadDrawer();

  return (
    <span
      onClick={(e) => {
        e.preventDefault();
        openLeadDrawer(leadId);
      }}
      className={className}
    >
      {children}
    </span>
  );
}

























































