"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Pool = {
  id: string;
  org_id: string;
  name: string;
  strategy: "round_robin" | "weighted" | "least_loaded";
  quiet_hours?: { start?: string; end?: string; tz?: string };
  members?: Array<{ sender_id: string; weight: number; sender_accounts?: { email: string; display_name?: string } }>;
};

type SenderAccount = {
  id: string;
  email: string;
  display_name?: string;
};

export default function SenderPoolsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    strategy: "round_robin" as Pool["strategy"],
    quiet_start: "21:00",
    quiet_end: "06:30",
    quiet_tz: "America/Los_Angeles",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgs } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (orgs?.org_id) {
        setOrgId(orgs.org_id);
        await Promise.all([loadPools(orgs.org_id), loadAccounts(orgs.org_id)]);
      }
    })();
  }, []);

  async function loadPools(org_id: string) {
    try {
      const { data, error } = await supabase
        .from("sender_pools")
        .select("*")
        .eq("org_id", org_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Load members for each pool
      const poolsWithMembers = await Promise.all(
        (data || []).map(async (pool) => {
          const { data: members } = await supabase
            .from("sender_pool_members")
            .select("sender_id, weight, sender_accounts(email, display_name)")
            .eq("pool_id", pool.id);

          return { ...pool, members: members || [] };
        })
      );

      setPools(poolsWithMembers);
    } catch (error: any) {
      console.error("Failed to load pools:", error);
      alert(error.message || "Failed to load pools");
    }
  }

  async function loadAccounts(org_id: string) {
    try {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select("id, email, display_name")
        .eq("org_id", org_id)
        .eq("is_active", true);

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error("Failed to load accounts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createPool() {
    if (!orgId || !formData.name.trim()) return;

    try {
      const { data, error } = await supabase
        .from("sender_pools")
        .insert({
          org_id: orgId,
          name: formData.name,
          strategy: formData.strategy,
          quiet_hours: {
            start: formData.quiet_start,
            end: formData.quiet_end,
            tz: formData.quiet_tz,
          },
        })
        .select()
        .single();

      if (error) throw error;

      setShowCreate(false);
      setFormData({ name: "", strategy: "round_robin", quiet_start: "21:00", quiet_end: "06:30", quiet_tz: "America/Los_Angeles" });
      await loadPools(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to create pool");
    }
  }

  async function addMember(poolId: string, senderId: string, weight: number = 1) {
    try {
      const { error } = await supabase
        .from("sender_pool_members")
        .insert({
          pool_id: poolId,
          sender_id: senderId,
          weight,
        });

      if (error) throw error;
      if (orgId) await loadPools(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to add member");
    }
  }

  async function removeMember(poolId: string, senderId: string) {
    try {
      const { error } = await supabase
        .from("sender_pool_members")
        .delete()
        .eq("pool_id", poolId)
        .eq("sender_id", senderId);

      if (error) throw error;
      if (orgId) await loadPools(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to remove member");
    }
  }

  async function updateMemberWeight(poolId: string, senderId: string, weight: number) {
    try {
      const { error } = await supabase
        .from("sender_pool_members")
        .update({ weight })
        .eq("pool_id", poolId)
        .eq("sender_id", senderId);

      if (error) throw error;
      if (orgId) await loadPools(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to update weight");
    }
  }

  async function deletePool(poolId: string) {
    if (!confirm("Delete this pool? Campaigns using it will be unaffected but won't send until assigned a new pool.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("sender_pools")
        .delete()
        .eq("id", poolId);

      if (error) throw error;
      if (orgId) await loadPools(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to delete pool");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sender Pools</h1>
          <p className="text-muted-foreground mt-1">
            Group sender accounts and configure distribution strategies.
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Create Pool"}
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="font-medium">Create New Pool</h2>
          <div className="space-y-4">
            <div>
              <Label>Pool Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Default Pool"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Strategy</Label>
              <select
                value={formData.strategy}
                onChange={(e) => setFormData({ ...formData, strategy: e.target.value as Pool["strategy"] })}
                className="mt-1 w-full rounded-md border p-2"
              >
                <option value="round_robin">Round Robin</option>
                <option value="weighted">Weighted</option>
                <option value="least_loaded">Least Loaded</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Quiet Hours Start</Label>
                <Input
                  type="time"
                  value={formData.quiet_start}
                  onChange={(e) => setFormData({ ...formData, quiet_start: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Quiet Hours End</Label>
                <Input
                  type="time"
                  value={formData.quiet_end}
                  onChange={(e) => setFormData({ ...formData, quiet_end: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Time Zone</Label>
                <Input
                  value={formData.quiet_tz}
                  onChange={(e) => setFormData({ ...formData, quiet_tz: e.target.value })}
                  placeholder="America/Los_Angeles"
                  className="mt-1"
                />
              </div>
            </div>
            <Button onClick={createPool} disabled={!formData.name.trim()}>
              Create Pool
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {pools.map((pool) => (
          <div key={pool.id} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{pool.name}</div>
                <div className="text-sm text-muted-foreground">
                  Strategy: {pool.strategy} • Quiet hours: {pool.quiet_hours?.start || "None"}–{pool.quiet_hours?.end || "None"}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => deletePool(pool.id)}>
                Delete
              </Button>
            </div>

            <div>
              <Label>Members</Label>
              <div className="mt-2 space-y-2">
                {pool.members?.map((member) => {
                  const account = member.sender_accounts as { email: string; display_name?: string } | undefined;
                  return (
                    <div key={member.sender_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">
                        {account?.display_name || account?.email || member.sender_id}
                      </span>
                      <div className="flex items-center gap-2">
                        {pool.strategy === "weighted" && (
                          <>
                            <Input
                              type="number"
                              value={member.weight}
                              onChange={(e) => {
                                const w = parseInt(e.target.value) || 1;
                                updateMemberWeight(pool.id, member.sender_id, w);
                              }}
                              className="w-16"
                              min="1"
                            />
                            <span className="text-xs text-muted-foreground">weight</span>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeMember(pool.id, member.sender_id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      addMember(pool.id, e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="w-full rounded-md border p-2 text-sm"
                >
                  <option value="">Add sender account...</option>
                  {accounts
                    .filter((acc) => !pool.members?.some((m) => m.sender_id === acc.id))
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.display_name || acc.email}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {pools.length === 0 && !showCreate && (
        <div className="text-center py-8 text-muted-foreground">
          No sender pools yet. Create one to start grouping sender accounts.
        </div>
      )}
    </div>
  );
}

