"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PlaybookBadgeProps {
  campaignId: string;
}

export function PlaybookBadge({ campaignId }: PlaybookBadgeProps) {
  const [playbook, setPlaybook] = useState<{ id: string; name: string } | null>(
    null
  );

  useEffect(() => {
    fetchPlaybookInfo();
  }, [campaignId]);

  const fetchPlaybookInfo = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      const data = await res.json();
      if (data.campaign?.playbook_id) {
        const playbookRes = await fetch(`/api/playbooks/${data.campaign.playbook_id}`);
        const playbookData = await playbookRes.json();
        if (playbookData.playbook) {
          setPlaybook({
            id: playbookData.playbook.id,
            name: playbookData.playbook.name,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching playbook info:", error);
    }
  };

  if (!playbook) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 border border-purple-200 rounded-md text-sm">
      <span className="text-purple-700">Based on Playbook:</span>
      <Link
        href={`/playbooks?highlight=${playbook.id}`}
        className="text-purple-600 hover:text-purple-800 font-medium underline"
      >
        {playbook.name}
      </Link>
    </div>
  );
}








