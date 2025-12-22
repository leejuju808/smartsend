"use client";

import React from "react";
import { useContact } from "@/lib/hooks/useContact";
import { useContactTimeline } from "@/lib/hooks/useContactTimeline";
import { ContactTimeline } from "@/components/contacts/ContactTimeline";
import { ContactHeader } from "@/components/contacts/ContactHeader";
import { ContactSidebar } from "@/components/contacts/ContactSidebar";
import { ContactFilesTab } from "@/components/contacts/ContactFilesTab";
import { ContactActivityTab } from "@/components/activity/ContactActivityTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/src/components/ui/skeleton";

export default function ContactProfilePage({
  params,
}: {
  params: { contactId: string };
}) {
  const { contact, loading: contactLoading, error: contactError, updateContact } = useContact(params.contactId);
  const [timelineFilters, setTimelineFilters] = React.useState<{ types?: string[]; dateFilter?: string }>({});
  const { events, loading: timelineLoading, hasMore, loadNextPage, reload: reloadTimeline } = useContactTimeline(params.contactId, timelineFilters);

  if (contactLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Skeleton className="h-96" />
            </div>
            <div className="lg:col-span-2">
              <Skeleton className="h-96" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (contactError || !contact) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-2">Contact not found</h2>
          <p className="text-muted-foreground">{contactError || "Unable to load contact"}</p>
        </div>
      </div>
    );
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateContact({ status: newStatus as any });
      reloadTimeline();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleNoteAdded = () => {
    reloadTimeline();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <ContactHeader
        contact={contact.contact}
        stats={contact.stats}
        owner={contact.owner}
        onStatusChange={handleStatusChange}
      />

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <ContactSidebar
            contact={contact.contact}
            tags={contact.tags}
            campaigns={contact.campaigns}
            owner={contact.owner}
            onTagUpdate={async (tags) => {
              try {
                const res = await fetch(`/api/contacts/${params.contactId}/tags`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tags }),
                });
                if (res.ok) {
                  // Reload contact
                  window.location.reload();
                }
              } catch (err) {
                console.error("Failed to update tags:", err);
              }
            }}
          />
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="activity" className="w-full">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="activity-log">Activity Log</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="activity" className="mt-4">
              <ContactTimeline
                events={events}
                loading={timelineLoading}
                hasMore={hasMore}
                onLoadMore={loadNextPage}
                contactId={params.contactId}
                onNoteAdded={handleNoteAdded}
                onFilterChange={(types, dateFilter) => setTimelineFilters({ types, dateFilter })}
              />
            </TabsContent>
            <TabsContent value="activity-log" className="mt-4">
              <ContactActivityTab contactId={params.contactId} />
            </TabsContent>
            <TabsContent value="files" className="mt-4">
              <ContactFilesTab contactId={params.contactId} />
            </TabsContent>
            <TabsContent value="details" className="mt-4">
              <div className="text-muted-foreground">
                Details view coming soon. For now, see sidebar for contact information.
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

