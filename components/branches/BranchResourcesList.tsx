"use client";

import { Wrench, Share2 } from "lucide-react";

interface BranchResourcesListProps {
  branchId: string;
  initialResources: any[];
}

export function BranchResourcesList({ branchId, initialResources }: BranchResourcesListProps) {
  return (
    <div className="space-y-2">
      {initialResources.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No resources assigned to this branch</p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialResources.map((resource) => (
            <div
              key={resource.id}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium capitalize">
                    {resource.resource_type}
                  </span>
                  {resource.shareable && (
                    <Share2 className="w-4 h-4 text-blue-400" title="Shareable resource" />
                  )}
                </div>
                <p className="text-sm text-gray-400">Resource ID: {resource.resource_id}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}





















