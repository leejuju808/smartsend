"use client";

import { useState, useEffect } from "react";
import { Shield, Check, X } from "lucide-react";

interface RolesPermissionsTabProps {
  roofingCompanyId: string;
  canEdit: boolean;
}

const modules = ['leads', 'estimates', 'contracts', 'production', 'safety', 'payments', 'accounting', 'settings', 'team'];
const roles = ['admin', 'manager', 'sales', 'production', 'crew', 'accounting', 'viewer'];
const actions = ['view', 'create', 'edit', 'delete'];

export default function RolesPermissionsTab({ roofingCompanyId, canEdit }: RolesPermissionsTabProps) {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, Record<string, any>>>({});

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const response = await fetch("/api/company/roles-permissions/list");
      const data = await response.json();
      if (data.success) {
        // Format permissions by role
        const formatted: Record<string, Record<string, any>> = {};
        (data.permissions || []).forEach((perm: any) => {
          if (!formatted[perm.role]) {
            formatted[perm.role] = {};
          }
          formatted[perm.role][perm.module] = {
            can_view: perm.can_view,
            can_create: perm.can_create,
            can_edit: perm.can_edit,
            can_delete: perm.can_delete,
          };
        });
        setPermissions(formatted);
      }
    } catch (error) {
      console.error("Error loading permissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionIcon = (hasPermission: boolean) => {
    return hasPermission ? (
      <Check className="w-4 h-4 text-green-600" />
    ) : (
      <X className="w-4 h-4 text-gray-300" />
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading permissions...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <Shield className="w-6 h-6 text-gray-600 mr-3" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Roles & Permissions</h2>
            <p className="text-sm text-gray-500 mt-1">Manage what each role can do</p>
          </div>
        </div>
      </div>

      <div className="p-6 overflow-x-auto">
        <div className="space-y-6">
          {roles.map((role) => (
            <div key={role} className="border border-gray-200 rounded-lg">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900 capitalize">{role}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">View</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Create</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Edit</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {modules.map((module) => {
                      const modulePerms = permissions[role]?.[module] || {
                        can_view: false,
                        can_create: false,
                        can_edit: false,
                        can_delete: false,
                      };
                      return (
                        <tr key={module} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">
                            {module}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getPermissionIcon(modulePerms.can_view)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getPermissionIcon(modulePerms.can_create)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getPermissionIcon(modulePerms.can_edit)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getPermissionIcon(modulePerms.can_delete)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {!canEdit && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              Only owners and admins can modify permissions. Contact your administrator to request changes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

























