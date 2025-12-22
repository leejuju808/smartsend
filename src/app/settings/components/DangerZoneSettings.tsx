"use client";

import { useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { AlertTriangle, Trash2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DangerZoneSettings({ canEdit }: { canEdit: boolean }) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleDeleteOrg = async () => {
    if (!canEdit) return;
    if (confirmText !== "DELETE") {
      alert('Please type "DELETE" to confirm');
      return;
    }

    if (!confirm("Are you absolutely sure? This will permanently delete your organization and all data.")) {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // TODO: Implement delete organization API endpoint
      alert("Organization deletion is not yet implemented. Contact support for assistance.");
    } catch (error) {
      console.error("Error deleting organization:", error);
      alert("Failed to delete organization");
    } finally {
      setDeleting(false);
      setConfirmText("");
    }
  };

  if (!canEdit) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          Only organization owners can access the Danger Zone.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Danger Zone</h2>
        <p className="mt-1 text-sm text-gray-600">
          Irreversible and destructive actions
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 space-y-6">
        {/* Delete Organization */}
        <div className="border-b border-gray-200 pb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                Delete Organization
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Permanently delete your organization and all associated data. This action cannot be undone.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500"
                />
                <button
                  onClick={handleDeleteOrg}
                  disabled={deleting || confirmText !== "DELETE"}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Deleting..." : "Delete Organization"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Reset Sending Domain */}
        <div className="border-b border-gray-200 pb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-orange-600" />
                Reset Sending Domain
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Remove all sending domain configurations and start fresh. You'll need to reconnect your email accounts.
              </p>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to reset sending domain settings?")) {
                    // TODO: Implement reset sending domain
                    alert("Reset sending domain is not yet implemented.");
                  }
                }}
                className="px-4 py-2 border border-orange-300 rounded-md shadow-sm text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100"
              >
                Reset Sending Domain
              </button>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-medium mb-1">Warning</p>
              <p>
                Actions in this section are permanent and cannot be undone. Please proceed with caution.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}





























































