"use client";

import { Users, UserPlus } from "lucide-react";

interface BranchUsersListProps {
  branchId: string;
  initialUsers: any[];
}

export function BranchUsersList({ branchId, initialUsers }: BranchUsersListProps) {
  // TODO: Implement user management UI
  return (
    <div className="space-y-2">
      {initialUsers.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No users assigned to this branch</p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
            >
              <div>
                <p className="text-white font-medium">
                  {user.users?.raw_user_meta_data?.name || user.users?.email || "Unknown User"}
                </p>
                <p className="text-sm text-gray-400">{user.role}</p>
              </div>
              {!user.is_active && (
                <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
                  Inactive
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}





















