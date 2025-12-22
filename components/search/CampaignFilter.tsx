"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

interface Campaign {
  id: string;
  name?: string;
  title?: string;
}

interface CampaignFilterProps {
  value?: string;
  onChange: (value?: string) => void;
}

export function CampaignFilter({ value, onChange }: CampaignFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: membership } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!membership?.workspace_id) return;

        const { data } = await supabase
          .from("campaigns")
          .select("id, name, title")
          .eq("workspace_id", membership.workspace_id)
          .order("created_at", { ascending: false })
          .limit(100);

        setCampaigns(data || []);
      } catch (error) {
        console.error("Error fetching campaigns:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [supabase]);

  const selectedCampaign = campaigns.find((c) => c.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
      >
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {value
            ? selectedCampaign?.name || selectedCampaign?.title || "Campaign"
            : "Campaign"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
            ) : campaigns.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No campaigns</div>
            ) : (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    onChange(undefined);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                    !value ? "bg-gray-100 font-medium" : "text-gray-900"
                  }`}
                >
                  All Campaigns
                </button>
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      onChange(campaign.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                      value === campaign.id
                        ? "bg-gray-100 font-medium"
                        : "text-gray-900"
                    }`}
                  >
                    {campaign.name || campaign.title || "Untitled Campaign"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}





















































