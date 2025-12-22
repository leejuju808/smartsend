export async function setMemberRole(
  campaignId: string,
  userId: string,
  role: "owner" | "editor" | "viewer"
) {
  const res = await fetch("/rest/v1/rpc/set_campaign_member_role", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_campaign: campaignId, p_user: userId, p_role: role }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function removeMember(campaignId: string, userId: string) {
  const res = await fetch("/rest/v1/rpc/remove_campaign_member", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_campaign: campaignId, p_user: userId }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}











