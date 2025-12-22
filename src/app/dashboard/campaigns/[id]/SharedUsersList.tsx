import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface SharedUser {
  user_id: string;
  role: string;
  email: string;
}

export default async function SharedUsersList({ campaignId }: { campaignId: string }) {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: sharedUsersData, error } = await supabase
    .from("campaign_shares")
    .select("user_id, role, profiles(email)")
    .eq("campaign_id", campaignId);

  if (error || !sharedUsersData || sharedUsersData.length === 0) {
    return null;
  }

  // Transform the data to extract email from profiles
  const sharedUsers: SharedUser[] = sharedUsersData.map((share: any) => ({
    user_id: share.user_id,
    role: share.role,
    email: share.profiles?.email || "Unknown",
  }));

  return (
    <div className="mt-6 pt-6 border-t">
      <h3 className="text-sm font-semibold mb-3">Shared with</h3>
      <ul className="space-y-2">
        {sharedUsers.map((u) => (
          <li key={u.user_id} className="flex items-center justify-between">
            <span className="text-sm text-gray-900">{u.email}</span>
            <span className="text-xs text-gray-500">{u.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
