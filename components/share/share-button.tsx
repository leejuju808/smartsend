"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShareModal } from "./share-modal";

type ItemType = "campaign" | "segment" | "template" | "lead_view";

interface ShareButtonProps {
  itemType: ItemType;
  itemId: string;
  variant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ShareButton({ itemType, itemId, variant = "secondary", size = "default" }: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        Share
      </Button>
      <ShareModal
        open={open}
        onClose={() => setOpen(false)}
        itemType={itemType}
        itemId={itemId}
      />
    </>
  );
}










