// Role-based permission helpers for campaigns
export type CampaignRole = 'owner' | 'editor' | 'viewer' | null

export function canEdit(role: CampaignRole): boolean {
  return role === 'owner' || role === 'editor'
}

export function canView(role: CampaignRole): boolean {
  return role !== null
}

export function canDelete(role: CampaignRole): boolean {
  return role === 'owner'
}

