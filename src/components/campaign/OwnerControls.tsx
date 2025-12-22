"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TransferModal } from "./TransferModal";
import { createBrowserClient } from "@supabase/ssr";

interface OwnerControlsProps {
  campaignId: string;
  isOwner: boolean;
  deletedAt: string | null;
}

export function OwnerControls({
  campaignId,
  isOwner,
  deletedAt,
}: OwnerControlsProps) {
  const [openTransfer, setOpenTransfer] = useState(false);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this campaign?")) {
      return;
    }
    const res = await fetch(`/api/campaigns/${campaignId}/archive`, {
      method: "POST",
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to archive campaign");
    }
  };

  const handleRestore = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/restore`, {
      method: "POST",
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to restore campaign");
    }
  };

  const handleLeave = async () => {
    if (!confirm("Are you sure you want to leave this campaign?")) {
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("campaign_shares")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("user_id", user.id);

    if (error) {
      alert(error.message || "Failed to leave campaign");
    } else {
      router.replace("/dashboard/campaigns");
    }
  };

  if (isOwner) {
    return (
      <>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setOpenTransfer(true)}
          >
            Transfer Ownership
          </Button>
          {deletedAt ? (
            <Button onClick={handleRestore}>Restore</Button>
          ) : (
            <Button variant="destructive" onClick={handleArchive}>
              Archive
            </Button>
          )}
        </div>
        {openTransfer && (
          <TransferModal
            campaignId={campaignId}
            onClose={() => setOpenTransfer(false)}
          />
        )}
      </>
    );
  }

  return (
    <Button variant="outline" onClick={handleLeave}>
      Leave campaign
    </Button>
  );
}

