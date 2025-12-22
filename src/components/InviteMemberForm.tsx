'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@/lib/supabase';

interface InviteMemberFormProps {
  workspaceId: string;
  onInviteSent?: () => void;
}

export default function InviteMemberForm({ workspaceId, onInviteSent }: InviteMemberFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'member' | 'admin'>('member');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  const supabase = createClientComponentClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/workspaces/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, email, role })
      });

      const result = await response.json();

      if (result.ok) {
        setMessage(`Invitation sent to ${email}! Share this link: ${result.inviteUrl}`);
        setEmail('');
        onInviteSent?.();
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      setMessage('Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Invite Team Member</h3>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="colleague@company.com"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="viewer">Viewer - Can view data only</option>
            <option value="member">Member - Can create and edit</option>
            <option value="admin">Admin - Can manage team and settings</option>
          </select>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </form>
      
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}

