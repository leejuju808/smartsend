"use client";

import * as React from "react";

type PermissionLevel = "view" | "use" | "edit" | "admin";
type SubjectType = "user" | "campaign" | "role";

type Permission = {
  id: string;
  subject_type: SubjectType;
  subject_id: string | null;
  level: PermissionLevel;
};

const PERMISSION_LEVELS: PermissionLevel[] = ["view", "use", "edit", "admin"];

type PermissionsDrawerProps = {
  resourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PermissionsDrawer({ resourceId, open, onOpenChange }: PermissionsDrawerProps) {
  const [permissions, setPermissions] = React.useState<Permission[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [subjectType, setSubjectType] = React.useState<SubjectType>("campaign");
  const [subjectId, setSubjectId] = React.useState("");
  const [level, setLevel] = React.useState<PermissionLevel>("use");

  const fetchPermissions = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/library/${resourceId}/permissions`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setPermissions(payload.permissions ?? []);
    } catch (error) {
      console.error("[PermissionsDrawer] failed to load permissions", error);
    }
  }, [resourceId]);

  React.useEffect(() => {
    if (open) {
      void fetchPermissions();
    }
  }, [open, fetchPermissions]);

  const handleAddPermission = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/library/${resourceId}/permissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject_type: subjectType,
          subject_id: subjectId.trim() ? subjectId.trim() : null,
          level,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSubjectId("");
      await fetchPermissions();
    } catch (error) {
      console.error("[PermissionsDrawer] failed to add permission", error);
      alert(`Add failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [resourceId, subjectType, subjectId, level, fetchPermissions]);

  const handleChangeLevel = React.useCallback(
    async (permissionId: string, nextLevel: PermissionLevel) => {
      try {
        const response = await fetch(`/api/library/${resourceId}/permissions`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            perm_id: permissionId,
            level: nextLevel,
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        await fetchPermissions();
      } catch (error) {
        console.error("[PermissionsDrawer] failed to update permission", error);
        alert(`Update failed: ${(error as Error).message}`);
      }
    },
    [resourceId, fetchPermissions],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={() => onOpenChange(false)}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Permissions</div>
          <button type="button" onClick={() => onOpenChange(false)} className="text-sm">
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="text-sm font-medium">Grant access</div>
          <div className="grid grid-cols-3 items-center gap-2">
            <select
              className="rounded border px-2 py-1"
              value={subjectType}
              onChange={(event) => setSubjectType(event.target.value as SubjectType)}
            >
              <option value="campaign">Campaign</option>
              <option value="user">User</option>
              <option value="role">Role</option>
            </select>

            <input
              className="rounded border px-2 py-1"
              placeholder="UUID or role name"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            />

            <select
              className="rounded border px-2 py-1"
              value={level}
              onChange={(event) => setLevel(event.target.value as PermissionLevel)}
            >
              <option value="view">view</option>
              <option value="use">use</option>
              <option value="edit">edit</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleAddPermission}
            className="w-fit rounded bg-black px-3 py-1 text-white"
          >
            {loading ? "Adding…" : "Add permission"}
          </button>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-medium">Existing</div>
          <ul className="space-y-2">
            {permissions.map((permission) => (
              <li
                key={permission.id}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <div>
                  {permission.subject_type}
                  {permission.subject_id ? `:${permission.subject_id}` : ""}
                </div>
                <select
                  value={permission.level}
                  onChange={(event) => handleChangeLevel(permission.id, event.target.value as PermissionLevel)}
                  className="rounded border px-2 py-1"
                >
                  {PERMISSION_LEVELS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}


