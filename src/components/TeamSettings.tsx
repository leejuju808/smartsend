"use client";
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { createClientComponentClient } from '@/lib/supabase';

// Use browser alert for now if sonner is not available
const toast = {
  success: (msg: string) => alert(msg),
  error: (msg: string) => alert(msg),
};

interface TeamMember {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  created_at: string;
  profiles?: {
    email: string;
  };
}

interface TeamSettingsProps {
  teamId: string;
  open: boolean;
  onClose: () => void;
}

export default function TeamSettings({ teamId, open, onClose }: TeamSettingsProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const supabase = createClientComponentClient();

  // Load team members
  useEffect(() => {
    if (open && teamId) {
      loadMembers();
    }
  }, [open, teamId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          id,
          role,
          created_at,
          user_id,
          profiles!team_members_user_id_fkey(email)
        `)
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to include email from profiles
      const transformedMembers = (data || []).map(m => ({
        id: m.id,
        email: (m.profiles as any)?.email || 'Unknown',
        role: m.role,
        created_at: m.created_at,
      }));

      setMembers(transformedMembers);
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error('Please enter an email address');
      return;
    }

    setInviteLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return;
      }

      // Call the invite API
      const response = await fetch('/api/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          email: inviteEmail,
          role: inviteRole,
          invitedBy: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to send invite');
      }

      toast.success(`Invite sent to ${inviteEmail}!`);
      setInviteEmail('');
      setInviteRole('viewer');
      
      // Refresh members list (the invitee won't be there yet, but refreshes the list)
      await loadMembers();
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error(error.message || 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemove = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from the team?`)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return;
      }

      // Call remove API
      const response = await fetch('/api/team/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to remove member');
      }

      toast.success(`${memberEmail} removed from team`);
      await loadMembers();
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast.error(error.message || 'Failed to remove member');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      case 'editor':
        return 'bg-green-100 text-green-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Team Settings</DialogTitle>
          <DialogDescription>
            Manage team members and permissions
          </DialogDescription>
        </DialogHeader>

        {/* Invite Section */}
        <div className="space-y-4 py-4">
          <h3 className="text-lg font-semibold">Invite Teammate</h3>
          <div className="flex gap-3">
            <Input
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              type="email"
              disabled={inviteLoading}
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              disabled={inviteLoading}
              className="border rounded-lg px-3 py-2"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <Button
              onClick={handleInvite}
              disabled={inviteLoading || !inviteEmail}
              className="whitespace-nowrap"
            >
              {inviteLoading ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </div>

        {/* Members List */}
        <div className="space-y-4 py-4 border-t">
          <h3 className="text-lg font-semibold">Team Members</h3>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No members yet</div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium">{member.email}</div>
                      <div className="text-sm text-gray-500">
                        Joined {new Date(member.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(member.role)}`}
                    >
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </span>
                    {member.role !== 'owner' && (
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white"
                        size="sm"
                        onClick={() => handleRemove(member.id, member.email)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

