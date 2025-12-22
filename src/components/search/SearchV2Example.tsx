/**
 * Example integration of SearchV2 component
 * 
 * This file shows how to integrate SearchV2 into your Contacts, Inbox, or Pipeline pages.
 */

"use client";

import { useRouter } from "next/navigation";
import { SearchV2 } from "./SearchV2";

// Example 1: Contacts Page Integration
export function ContactsPageWithSearch() {
  const router = useRouter();

  const handleContactClick = (contactId: string) => {
    router.push(`/contacts/${contactId}`);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
      </div>
      <SearchV2 onContactClick={handleContactClick} />
    </div>
  );
}

// Example 2: Inbox Page Integration with Initial Query
export function InboxPageWithSearch({ initialQuery }: { initialQuery?: string }) {
  const router = useRouter();

  const handleContactClick = (contactId: string) => {
    router.push(`/inbox/contact/${contactId}`);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Inbox</h1>
      </div>
      <SearchV2 
        initialQuery={initialQuery}
        onContactClick={handleContactClick}
      />
    </div>
  );
}

// Example 3: Pipeline Page Integration with Initial Filters
export function PipelinePageWithSearch() {
  const router = useRouter();

  const handleContactClick = (contactId: string) => {
    router.push(`/pipeline/${contactId}`);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pipeline</h1>
      </div>
      <SearchV2 
        initialFilters={{ 
          pipeline_stage: ["HOT", "WARM"],
          lead_score_min: 30 
        }}
        onContactClick={handleContactClick}
      />
    </div>
  );
}

// Example 4: Custom Search with Pre-filled Filters
export function StormLeadsSearch() {
  const router = useRouter();

  const handleContactClick = (contactId: string) => {
    router.push(`/contacts/${contactId}`);
  };

  return (
    <div className="container mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">Storm Leads</h2>
      <SearchV2 
        initialFilters={{
          storm_exposure: ["hail", "wind"],
          lead_score_min: 50,
          status: ["HOT", "WARM"]
        }}
        onContactClick={handleContactClick}
      />
    </div>
  );
}





















































