"use client";

interface TeamInvite {
  email: string;
  created_at: string;
  accepted: boolean;
  expires_at: string;
}

interface TeamInvitesListProps {
  invites: TeamInvite[];
}

export default function TeamInvitesList({ invites }: TeamInvitesListProps) {
  const getStatusBadge = (invite: TeamInvite) => {
    if (invite.accepted) {
      return <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">Accepted</span>;
    }
    
    const isExpired = new Date(invite.expires_at) < new Date();
    if (isExpired) {
      return <span className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded">Expired</span>;
    }
    
    return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Pending</span>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="border rounded p-4">
      <h2 className="font-semibold mb-2">Pending Invites</h2>
      {invites.length === 0 ? (
        <p className="text-sm text-gray-500">No pending invitations</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite, idx) => (
            <li key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-2">
                <span className="text-sm">{invite.email}</span>
                {getStatusBadge(invite)}
              </div>
              <span className="text-xs text-gray-500">
                {invite.accepted ? `Accepted ${formatDate(invite.created_at)}` : `Sent ${formatDate(invite.created_at)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 