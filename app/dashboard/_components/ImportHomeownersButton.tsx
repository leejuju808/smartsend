"use client";

// Block 10800 — SmartSend Roofing Contact Loader v1
// Import Homeowners button for dashboard

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImportContactsModal } from "@/components/contacts/ImportContactsModal";
import { useRouter } from "next/navigation";

export function ImportHomeownersButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setModalOpen(true)} size="lg">
        Import Homeowners
      </Button>
      <ImportContactsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}























































