"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, MoreVertical, Mail, Clock, CheckCircle, XCircle } from "lucide-react";

interface TeamMembersTabProps {
  roofingCompanyId: string;
  canManageTeam: boolean;
}

export default function TeamMembersTab({ roofingCompanyId, canManageTeam }: TeamMembersTabProps) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("sales");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [roofingCompanyId]);

  const loadMembers = async () => {
    try {
      const response = await fetch(`/api/company/users/list?roofing_company_id=${roofingCompanyId}`);
      const data = await response.json();
      if (data.success) {
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error("Error loading members:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRole) return;

    setInviting(true);
    try {
      const response = await fetch("/api/company/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          roofing_company_id: roofingCompanyId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Invitation sent!");
        setShowInviteModal(false);
        setInviteEmail("");
        setInviteRole("sales");
        loadMembers();
      } else {
        alert(data.error || "Failed to send invitation");
      }
    } catch (error) {
      console.error("Error inviting:", error);
      alert("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="text-center py-8">Loading team members...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Users className="w-6 h-6 text-gray-600 mr-3" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Team Members</h2>
              <p className="text-sm text-gray-500 mt-1">Manage your team members and their roles</p>
            </div>
          </div>
          {canManageTeam && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name / Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              {canManageTeam && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {member.email || "No email"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {member.is_active ? (
                    <span className="flex items-center text-sm text-green-600">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center text-sm text-gray-400">
                      <XCircle className="w-4 h-4 mr-1" />
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {formatDate(member.last_login_at)}
                  </div>
                </td>
                {canManageTeam && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button className="text-blue-600 hover:text-blue-800">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Invite Team Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="sales">Sales</option>
                  <option value="production">Production</option>
                  <option value="crew">Crew</option>
                  <option value="accounting">Accounting</option>
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {inviting ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

























