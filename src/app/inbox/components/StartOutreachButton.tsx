"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Send, ChevronDown } from "lucide-react";
import { OutboundModal, OutboundChannel } from "./OutboundModal";

interface StartOutreachButtonProps {
  initialContactIds?: string[];
}

export function StartOutreachButton({ initialContactIds = [] }: StartOutreachButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<OutboundChannel | null>(null);

  const handleChannelSelect = (channel: OutboundChannel) => {
    setSelectedChannel(channel);
    setModalOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" size="sm">
            <Send className="h-4 w-4 mr-2" />
            Start Outreach
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleChannelSelect("email")}>
            Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleChannelSelect("sms")}>
            SMS
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleChannelSelect("voicemail")}>
            Voicemail Drop
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleChannelSelect("multi_step")}>
            Multi-Step (Email + SMS)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OutboundModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedChannel(null);
        }}
        initialChannel={selectedChannel || undefined}
        initialContactIds={initialContactIds}
      />
    </>
  );
}



















































