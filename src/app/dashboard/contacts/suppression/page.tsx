"use client";

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface SuppressionEmail {
  id: string;
  email: string;
  reason: string;
  source: string;
  created_at: string;
}

export default function SuppressionPage() {
  const [suppressions, setSuppressions] = useState<SuppressionEmail[]>([]);
  const [newEmails, setNewEmails] = useState('');
  const [reason, setReason] = useState('manual');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const supabase = createClientComponentClient();

  // For demo purposes - replace with actual workspace ID from your auth system
  const demoWorkspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID || 'demo-workspace-id';

  useEffect(() => {
    loadSuppressions();
  }, []);

  const loadSuppressions = async () => {
    try {
      const response = await fetch(`/api/suppression/bulk?workspaceId=${demoWorkspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setSuppressions(data.suppressions || []);
      }
    } catch (error) {
      console.error('Failed to load suppressions:', error);
    }
  };

  const handleAddSuppression = async () => {
    if (!newEmails.trim()) return;

    setLoading(true);
    setMessage('');

    try {
      const emails = newEmails
        .split('\n')
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));

      if (emails.length === 0) {
        setMessage('Please enter valid email addresses');
        return;
      }

      const response = await fetch('/api/suppression/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emails,
          reason,
          workspaceId: demoWorkspaceId
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(`Added ${result.summary.inserted} emails to suppression list`);
        setNewEmails('');
        setReason('manual');
        loadSuppressions(); // Refresh the list
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.error}`);
      }
    } catch (error) {
      setMessage('Failed to add suppressions');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSuppression = async (email: string) => {
    try {
      // Note: You'll need to implement a DELETE endpoint for this
      // For now, we'll just show a message
      setMessage(`Removing ${email} from suppression list...`);
      // await fetch(`/api/suppression/${email}`, { method: 'DELETE' });
      // loadSuppressions();
    } catch (error) {
      setMessage('Failed to remove suppression');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Suppression</h1>
        <p className="text-gray-600">Manage your email suppression list to avoid sending to unsubscribed or invalid addresses</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Suppressions */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Add to Suppression List</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Addresses (one per line)
              </label>
              <textarea
                value={newEmails}
                onChange={(e) => setNewEmails(e.target.value)}
                placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                rows={5}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="manual">Manual Addition</option>
                <option value="unsubscribe">Unsubscribe Request</option>
                <option value="bounce">Bounce</option>
                <option value="spam">Spam Complaint</option>
                <option value="invalid">Invalid Email</option>
              </select>
            </div>

            <button
              onClick={handleAddSuppression}
              disabled={loading || !newEmails.trim()}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Adding...' : 'Add to Suppression List'}
            </button>

            {message && (
              <div className={`p-3 rounded-md text-sm ${
                message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Suppression Stats */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Suppression Stats</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Suppressed:</span>
              <span className="font-semibold">{suppressions.length}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Manual Additions:</span>
              <span className="font-semibold">
                {suppressions.filter(s => s.reason === 'manual').length}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Unsubscribes:</span>
              <span className="font-semibold">
                {suppressions.filter(s => s.reason === 'unsubscribe').length}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Bounces:</span>
              <span className="font-semibold">
                {suppressions.filter(s => s.reason === 'bounce').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Suppression List */}
      <div className="bg-white rounded-lg border">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Suppression List</h2>
          <p className="text-sm text-gray-600 mt-1">
            {suppressions.length} email{suppressions.length !== 1 ? 's' : ''} currently suppressed
          </p>
        </div>

        <div className="p-6">
          {suppressions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-3">🛑</div>
              <p>No suppressed emails yet</p>
              <p className="text-sm">Add emails above to start building your suppression list</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suppressions.map((suppression) => (
                <div key={suppression.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{suppression.email}</div>
                    <div className="text-sm text-gray-600">
                      Reason: {suppression.reason} • Added: {new Date(suppression.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveSuppression(suppression.email)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 