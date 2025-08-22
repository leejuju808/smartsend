export type UserRole = 'owner' | 'admin' | 'member'

export function canManageBilling(role: UserRole | string | null | undefined): boolean {
  return role === 'owner'
}

export function canManageMembers(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canSendCampaign(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export function canManageTemplates(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canApproveCampaigns(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canViewTeamActivity(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export function canInviteMembers(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canDeleteWorkspace(role: UserRole | string | null | undefined): boolean {
  return role === 'owner'
}

export function canManageWorkspaceSettings(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

