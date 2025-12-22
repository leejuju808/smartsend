"use client";

import { useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";

interface AutoStopToggleProps {
  campaignId: string;
  initialValue: boolean;
  onToggle?: (enabled: boolean) => void;
}

export default function AutoStopToggle({ 
  campaignId, 
  initialValue, 
  onToggle 
}: AutoStopToggleProps) {
  const [enabled, setEnabled] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/toggle-auto-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked })
      });

      if (!response.ok) {
        throw new Error("Failed to update setting");
      }

      setEnabled(checked);
      onToggle?.(checked);
      
      addToast({
        variant: 'success',
        title: checked ? "Auto-stop enabled" : "Auto-stop disabled",
        description: checked 
          ? "Future emails will be automatically stopped when recipients reply"
          : "All emails will be sent regardless of replies",
      });
    } catch (error) {
      console.error("Error toggling auto-stop:", error);
      addToast({
        variant: 'error',
        title: 'Error',
        description: 'Failed to update auto-stop setting',
      });
      // Revert the toggle
      setEnabled(!checked);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <input
        type="checkbox"
        id="auto-stop-toggle"
        checked={enabled}
        onChange={(e) => handleToggle(e.target.checked)}
        disabled={isLoading}
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
      <label htmlFor="auto-stop-toggle" className="text-sm font-medium text-gray-700">
        Auto-stop when recipient replies
      </label>
      {isLoading && (
        <span className="text-xs text-gray-500">Updating...</span>
      )}
    </div>
  );
} 