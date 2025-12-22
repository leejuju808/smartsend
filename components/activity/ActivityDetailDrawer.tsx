// Block 16600 — SmartSend Activity Log v2
// Activity Detail Drawer Component

"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ActivityLog } from "./ActivityFeed";
import { format } from "date-fns";

interface ActivityDetailDrawerProps {
  log: ActivityLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityDetailDrawer({
  log,
  open,
  onOpenChange,
}: ActivityDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 border-l bg-background p-0 sm:max-w-2xl overflow-y-auto">
        <div className="border-b px-6 py-4">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-lg">
              Activity Details
            </SheetTitle>
            <SheetDescription className="text-sm">
              Full audit trail information for this event
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 space-y-6 px-6 py-4">
          {/* Summary */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Summary</h3>
            <p className="text-sm text-gray-700">{log.summary}</p>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Category</h4>
              <p className="text-sm text-gray-900 capitalize">{log.category}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Type</h4>
              <p className="text-sm text-gray-900">{log.type}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Severity</h4>
              <p className="text-sm text-gray-900 capitalize">{log.severity}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Source</h4>
              <p className="text-sm text-gray-900 capitalize">{log.source}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Timestamp</h4>
              <p className="text-sm text-gray-900">
                {format(new Date(log.created_at), "PPpp")}
              </p>
            </div>
            {log.pipeline_stage_key && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-1">Pipeline Stage</h4>
                <p className="text-sm text-gray-900 capitalize">
                  {log.pipeline_stage_key.replace(/_/g, " ")}
                </p>
              </div>
            )}
          </div>

          {/* Contact Info */}
          {log.contact && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Contact</h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-900">
                  {log.contact.first_name || log.contact.last_name
                    ? `${log.contact.first_name || ""} ${log.contact.last_name || ""}`.trim()
                    : "Unknown"}
                </p>
                <p className="text-xs text-gray-500 mt-1">{log.contact.email}</p>
              </div>
            </div>
          )}

          {/* User Info */}
          {log.user && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">User</h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-900">{log.user.email}</p>
              </div>
            </div>
          )}

          {/* Grouped Events */}
          {log.isGrouped && log.groupItems && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Grouped Events ({log.groupCount})
              </h3>
              <div className="space-y-2">
                {log.groupItems.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="bg-gray-50 rounded-lg p-3 text-sm"
                  >
                    <p className="text-gray-900">{item.summary}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(item.created_at), "PPpp")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details JSON */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Full Details</h3>
            <details className="bg-gray-50 rounded-lg">
              <summary className="px-4 py-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
                View JSON Details
              </summary>
              <pre className="p-4 text-xs overflow-x-auto">
                {JSON.stringify(
                  {
                    id: log.id,
                    created_at: log.created_at,
                    category: log.category,
                    type: log.type,
                    severity: log.severity,
                    summary: log.summary,
                    details: log.details,
                    source: log.source,
                    pipeline_stage_key: log.pipeline_stage_key,
                    contact_id: log.contact?.id,
                    user_id: log.user?.id,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}





















































