"use client";

import * as React from "react";
import { PriorityInbox } from "@/components/inbox/PriorityInbox";
import { AllInbox } from "@/components/inbox/AllInbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function InboxPage() {
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);

  return (
    <div className="flex h-full">
      {/* Left column: lists */}
      <div className="flex h-full w-80 flex-col border-r">
        <Tabs defaultValue="priority" className="flex h-full flex-col">
          <TabsList className="mx-2 mt-2 grid grid-cols-2">
            <TabsTrigger value="priority" className="text-xs">
              Priority
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value="priority" className="mt-2 flex-1">
            <PriorityInbox
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
            />
          </TabsContent>

          <TabsContent value="all" className="mt-2 flex-1">
            <AllInbox
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right column: message viewer, details, timeline, etc. */}
      <div className="flex-1">
        {selectedThreadId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Thread {selectedThreadId} selected
            {/* Your message/thread detail component would go here */}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a thread →
          </div>
        )}
      </div>
    </div>
  );
}
