/**
 * Block 23200 — Silent Forge Beta Group Admin Dashboard
 * Internal admin page for managing Silent Forge beta testers
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface BetaTester {
  id: string;
  company_name: string;
  contact_person: string;
  contact_email: string;
  status: string;
  tier: 'growth' | 'domination';
  locked_price_monthly: number;
  created_at: string;
  onboarding_completed_at: string | null;
  first_real_job_at: string | null;
}

export default function SilentForgeAdminPage() {
  const router = useRouter();
  const [betaTesters, setBetaTesters] = useState<BetaTester[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    fetchBetaTesters();
  }, [selectedStatus]);

  const fetchBetaTesters = async () => {
    try {
      const url = selectedStatus 
        ? `/api/silent-forge/admin/list?status=${selectedStatus}`
        : '/api/silent-forge/admin/list';
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setBetaTesters(data.beta_testers || []);
        setStats(data.stats || {});
      }
    } catch (error) {
      console.error('Error fetching beta testers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      invited: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-blue-100 text-blue-800',
      onboarding: 'bg-purple-100 text-purple-800',
      active: 'bg-green-100 text-green-800',
      paused: 'bg-gray-100 text-gray-800',
      completed: 'bg-indigo-100 text-indigo-800',
      removed: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Silent Forge Beta Group Admin
          </h1>
          <p className="text-gray-600">
            5–10 Roofing Companies • Invitation-Only • Real-World Testing
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-900">{stats.total || 0}</div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{stats.invited || 0}</div>
            <div className="text-sm text-gray-600">Invited</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.onboarding || 0}</div>
            <div className="text-sm text-gray-600">Onboarding</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{stats.active || 0}</div>
            <div className="text-sm text-gray-600">Active</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-600">{stats.paused || 0}</div>
            <div className="text-sm text-gray-600">Paused</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-indigo-600">{stats.completed || 0}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{stats.removed || 0}</div>
            <div className="text-sm text-gray-600">Removed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="invited">Invited</option>
              <option value="qualified">Qualified</option>
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="removed">Removed</option>
            </select>
            <button
              onClick={() => router.push('/silent-forge/admin/invite')}
              className="ml-auto bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              Invite Company
            </button>
          </div>
        </div>

        {/* Beta Testers Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Locked Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {betaTesters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No beta testers found
                  </td>
                </tr>
              ) : (
                betaTesters.map((tester) => (
                  <tr key={tester.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {tester.company_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{tester.contact_person}</div>
                      <div className="text-sm text-gray-500">{tester.contact_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(tester.status)}`}>
                        {tester.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 capitalize">{tester.tier}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ${tester.locked_price_monthly?.toFixed(2)}/mo
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tester.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => router.push(`/silent-forge/admin/${tester.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}







































