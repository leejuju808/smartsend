"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ExportContactsModal } from "@/components/contacts/ExportContactsModal";

interface ExportCampaignContactsProps {
  campaignId: string;
}

export function ExportCampaignContacts({ campaignId }: ExportCampaignContactsProps) {
  const [exportModalOpen, setExportModalOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setExportModalOpen(true)}
      >
        Export Campaign Contacts
      </Button>
      <ExportContactsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        campaignId={campaignId}
      />
    </>
  );
}





























































