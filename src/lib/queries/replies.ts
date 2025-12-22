import { supabaseBrowser } from '@/lib/supabase-browser'

export async function fetchCampaignReplies(campaignId: string) {
  const sb = supabaseBrowser()
  const { data, error } = await sb.rpc('get_campaign_reply_counts', { c_id: campaignId })
  if (error) throw error
  return data?.[0] ?? { replied_count: 0, total: 0 }
}

