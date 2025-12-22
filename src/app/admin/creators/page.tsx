'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  AlertCircle,
  User,
  Calendar,
  Globe,
  FileText
} from 'lucide-react';

interface Creator {
  id: string;
  display_name: string;
  bio?: string;
  website?: string;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  stripe_account_id?: string;
  created_at: string;
  user: {
    email: string;
    created_at: string;
  };
}

export default function AdminCreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchCreators();
  }, []);

  const fetchCreators = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/creators');
      
      if (!response.ok) {
        throw new Error('Failed to fetch creators');
      }

      const data = await response.json();
      setCreators(data.creators || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatorAction = async (creatorId: string, action: string) => {
    setActionLoading(creatorId);
    try {
      const response = await fetch('/api/admin/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId, action }),
      });

      if (!response.ok) {
        throw new Error('Failed to update creator status');
      }

      // Refresh the list
      await fetchCreators();
      
      // Close modal if open
      setSelectedCreator(null);

    } catch (err) {
      console.error('Creator action failed:', err);
      alert('Failed to update creator status');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending Review' },
      approved: { color: 'bg-green-100 text-green-800', text: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected' },
      disabled: { color: 'bg-gray-100 text-gray-800', text: 'Disabled' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredCreators = creators.filter(creator => 
    filterStatus === 'all' || creator.status === filterStatus
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading creators...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600" />
          <p className="mt-4 text-gray-600">{error}</p>
          <button
            onClick={fetchCreators}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Creator Management</h1>
          <p className="mt-2 text-gray-600">
            Review and manage creator applications and statuses
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Filter by status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="disabled">Disabled</option>
            </select>
            
            <span className="text-sm text-gray-500">
              {filteredCreators.length} of {creators.length} creators
            </span>
          </div>
        </div>

        {/* Creators List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Creators</h2>
          </div>
          
          {filteredCreators.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No creators found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredCreators.map((creator) => (
                <div key={creator.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900">
                          {creator.display_name}
                        </h3>
                        {getStatusBadge(creator.status)}
                      </div>
                      
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                        <div className="flex items-center">
                          <User className="w-4 h-4 mr-1" />
                          {creator.user.email}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          Applied {formatDate(creator.created_at)}
                        </div>
                        {creator.website && (
                          <div className="flex items-center">
                            <Globe className="w-4 h-4 mr-1" />
                            <a
                              href={creator.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Website
                            </a>
                          </div>
                        )}
                      </div>
                      
                      {creator.bio && (
                        <p className="mt-2 text-sm text-gray-600 flex items-start">
                          <FileText className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                          {creator.bio}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedCreator(creator)}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </button>
                      
                      {creator.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleCreatorAction(creator.id, 'approve')}
                            disabled={actionLoading === creator.id}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </button>
                          
                          <button
                            onClick={() => handleCreatorAction(creator.id, 'reject')}
                            disabled={actionLoading === creator.id}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </button>
                        </>
                      )}
                      
                      {creator.status === 'approved' && (
                        <button
                          onClick={() => handleCreatorAction(creator.id, 'disable')}
                          disabled={actionLoading === creator.id}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Creator Detail Modal */}
        {selectedCreator && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Creator Details
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Display Name</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedCreator.display_name}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedCreator.user.email}</p>
                  </div>
                  
                  {selectedCreator.bio && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Bio</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedCreator.bio}</p>
                    </div>
                  )}
                  
                  {selectedCreator.website && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Website</label>
                      <a
                        href={selectedCreator.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-sm text-blue-600 hover:text-blue-800 block"
                      >
                        {selectedCreator.website}
                      </a>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedCreator.status)}</div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Applied</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {formatDate(selectedCreator.created_at)}
                    </p>
                  </div>
                  
                  {selectedCreator.stripe_account_id && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Stripe Account</label>
                      <p className="mt-1 text-sm text-gray-900 font-mono">
                        {selectedCreator.stripe_account_id}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setSelectedCreator(null)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 