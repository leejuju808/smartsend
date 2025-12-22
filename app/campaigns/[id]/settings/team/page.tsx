import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { addMember, updateMemberRole, removeMember } from "./actions";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CampaignInvites } from "@/components/campaigns/CampaignInvites";
import { CampaignMemberAudit } from "@/components/campaign/CampaignMemberAudit";

export default async function TeamSettings({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
  
  const myRole = await getCampaignRole(campaignId);
  
  // Ensure user has view access
  if (!can(myRole, "canView")) {
    notFound();
  }

  // Creator as implicit owner
  const [{ data: camp }, { data: members }] = await Promise.all([
    sb.from("campaigns").select("user_id").eq("id", campaignId).maybeSingle(),
    sb
      .from("campaign_members")
      .select("user_id, role, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
  ]);

  // Fetch display info from profiles (id, email, name)
  const ids = Array.from(
    new Set([camp?.user_id, ...(members?.map((m) => m.user_id) ?? [])].filter(Boolean))
  ) as string[];
  
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, email, name, full_name")
    .in("id", ids);

  const info = (uid: string) => {
    const profile = profiles?.find((p) => p.id === uid);
    return {
      email: profile?.email ?? null,
      name: profile?.name ?? profile?.full_name ?? null,
      avatar: null, // profiles table may not have avatar_url yet
    };
  };

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Team</h1>
        <Link
          href={`/campaigns/${campaignId}`}
          className="text-sm underline underline-offset-2"
        >
          Back to Campaign
        </Link>
      </header>

      {/* Owner */}
      <section className="rounded-2xl border p-4">
        <h2 className="font-medium mb-2">Owner</h2>
        {camp?.user_id && (
          <div className="text-sm flex items-center gap-3">
            <Avatar
              email={info(camp.user_id)?.email}
              avatar={info(camp.user_id)?.avatar}
            />
            <div>
              <div className="font-medium">
                {info(camp.user_id)?.name ??
                  info(camp.user_id)?.email ??
                  camp.user_id}
              </div>
              <div className="text-xs opacity-70">Full control</div>
            </div>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Members</h2>
        <ul className="divide-y">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar
                  email={info(m.user_id)?.email}
                  avatar={info(m.user_id)?.avatar}
                />
                <div>
                  <div className="text-sm font-medium">
                    {info(m.user_id)?.name ??
                      info(m.user_id)?.email ??
                      m.user_id}
                  </div>
                  <div className="text-xs opacity-70">
                    Joined {new Date(m.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              {myRole === "owner" ? (
                <div className="flex items-center gap-2">
                  <form action={updateMemberRole}>
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="userId" value={m.user_id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded-xl border px-2 py-1 text-sm"
                    >
                      <option value="sender">Sender</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button className="ml-2 rounded-xl border px-3 py-1.5 text-xs">
                      Save
                    </button>
                  </form>
                  <form action={removeMember}>
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="userId" value={m.user_id} />
                    <button
                      type="submit"
                      className="rounded-xl border px-3 py-1.5 text-xs"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              ) : (
                <span className="text-xs rounded-full border px-2 py-0.5">
                  {m.role}
                </span>
              )}
            </li>
          ))}
          {(members ?? []).length === 0 && (
            <li className="py-6 text-sm opacity-60">
              No additional members yet.
            </li>
          )}
        </ul>
      </section>

      {/* Invite via email (requires existing account) */}
      {myRole === "owner" && (
        <section className="rounded-2xl border p-4 space-y-2">
          <h2 className="font-medium">Invite member</h2>
          <form action={addMember} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input
              name="email"
              placeholder="teammate@company.com"
              className="rounded-xl border px-3 py-2 text-sm w-64"
              required
            />
            <select
              name="role"
              className="rounded-xl border px-3 py-2 text-sm"
              defaultValue="viewer"
            >
              <option value="sender">Sender</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              className="rounded-xl border px-3 py-2 text-sm"
            >
              Add
            </button>
          </form>
          <p className="text-xs opacity-60">
            Note: teammate must have an account so we can find their user.
          </p>
        </section>
      )}

      {/* Invite via link (no account required) */}
      {myRole === "owner" && (
        <CampaignInvites campaignId={campaignId} />
      )}

      {/* Audit Feed */}
      <CampaignMemberAudit campaignId={campaignId} />
    </main>
  );
}

function Avatar({
  email,
  avatar,
}: {
  email?: string | null;
  avatar?: string | null;
}) {
  return (
    <div className="w-8 h-8 rounded-full border bg-muted flex items-center justify-center text-xs">
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className="w-8 h-8 rounded-full object-cover"
        />
      ) : (
        email?.[0]?.toUpperCase() ?? "?"
      )}
    </div>
  );
}

