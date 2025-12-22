import { ReactNode } from "react";
import { LeadDrawerWrapper } from "@/components/leads/LeadDrawerWrapper";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LeadDrawerWrapper>
      <div className="h-full w-full">
        <div className="mx-auto max-w-screen-xl p-6">
          {children}
        </div>
      </div>
    </LeadDrawerWrapper>
  );
}


