/**
 * Empty State Components
 * Beautiful empty states to inspire confidence
 */

import React from "react";
import { MailIcon, ThermometerIcon, ClockIcon } from "./icons/InboxIcons";
import { Button } from "@/components/ui/button";
import { colors } from "../constants/colors";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

function EmptyStateBase({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      {icon && (
        <div 
          className="mb-6 p-4 rounded-full"
          style={{ 
            backgroundColor: colors.primaryLight,
            color: colors.primary 
          }}
        >
          <div className="w-12 h-12 flex items-center justify-center">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2" style={{ color: colors.ink }}>
        {title}
      </h3>
      <p 
        className="text-sm max-w-md mb-6" 
        style={{ color: colors.inkSecondary }}
      >
        {description}
      </p>
      {action && (
        <Button
          onClick={action.onClick}
          style={{ backgroundColor: colors.primary }}
          className="hover:opacity-90 transition-opacity"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

// No threads yet
export function EmptyInboxState({ onLaunchCampaign }: { onLaunchCampaign?: () => void }) {
  return (
    <EmptyStateBase
      title="Inbox is live."
      description="When outreach runs, replies land here automatically."
      icon={<MailIcon size={24} />}
      action={onLaunchCampaign ? {
        label: "Start outreach",
        onClick: onLaunchCampaign,
      } : undefined}
    />
  );
}

// No hot leads
export function EmptyHotLeadsState() {
  return (
    <EmptyStateBase
      title="No high-intent conversations right now."
      description="When intent spikes, they surface here automatically."
      icon={<ThermometerIcon size={24} />}
    />
  );
}

// No activity
export function EmptyActivityState() {
  return (
    <EmptyStateBase
      title="This space will fill as SmartSend handles actions for you."
      description="As replies come in and actions are taken, you'll see them here in real-time."
      icon={<ClockIcon size={24} />}
    />
  );
}

// No threads matching filter
export function EmptyFilterState({ filter }: { filter: string }) {
  return (
    <EmptyStateBase
      title={`No ${filter} conversations.`}
      description="Adjust filters or wait—new replies roll in continuously."
      icon={<MailIcon size={24} />}
    />
  );
}

