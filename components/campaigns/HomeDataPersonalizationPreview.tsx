"use client";

// Block 96000 — Auto-Personalization Engine v1: Home Data Personalization Preview
// Shows the home data that's being used for personalization

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface HomeData {
  est_home_age: number | null;
  roof_type: string | null;
  year_built: number | null;
  neighborhood: string | null;
}

interface HomeDataPersonalizationPreviewProps {
  campaignId: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function HomeDataPersonalizationPreview({
  campaignId,
  city,
  state,
  zip,
}: HomeDataPersonalizationPreviewProps) {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketTags, setMarketTags] = useState<string[]>([]);

  useEffect(() => {
    async function loadHomeData() {
      if (!city || !state) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        
        // Get company info to determine market tags
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id, created_by")
          .eq("id", campaignId)
          .single();

        if (!campaign) {
          setLoading(false);
          return;
        }

        // Determine market tags
        const tags: string[] = [];
        const hailStates = ["TX", "OK", "KS", "NE", "CO", "WY", "SD", "ND", "MN", "IA"];
        const coastalStates = ["FL", "NC", "SC", "GA", "AL", "MS", "LA", "TX"];
        const rainyStates = ["WA", "OR", "FL", "LA", "AL", "MS"];

        if (state && hailStates.includes(state.toUpperCase())) {
          tags.push("Hail");
        }
        if (state && coastalStates.includes(state.toUpperCase())) {
          tags.push("Wind");
        }
        if (state && rainyStates.includes(state.toUpperCase())) {
          tags.push("Rain");
        }
        setMarketTags(tags);

        // Try to get a sample home data from cache
        const sampleAddress = zip 
          ? `123 Main St, ${city}, ${state} ${zip}`
          : `${city}, ${state}`;

        // Call the API route to enrich home data
        const response = await fetch("/api/home-data/enrich", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: sampleAddress,
            city,
            state,
            zip: zip || null,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setHomeData({
            est_home_age: data.est_home_age,
            roof_type: data.roof_type,
            year_built: data.year_built,
            neighborhood: data.neighborhood,
          });
        }
      } catch (error) {
        console.error("Error loading home data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadHomeData();
  }, [campaignId, city, state, zip]);

  if (loading) {
    return null;
  }

  if (!homeData || (!homeData.est_home_age && !homeData.roof_type && !homeData.year_built)) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏡</span>
        <h3 className="text-sm font-semibold">Home Data Personalization</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-xs">
        {homeData.est_home_age && (
          <div>
            <div className="text-muted-foreground mb-1">Est. Roof Age</div>
            <div className="font-medium">
              {homeData.est_home_age ? `${homeData.est_home_age} years` : "Unknown"}
            </div>
          </div>
        )}
        
        {homeData.roof_type && (
          <div>
            <div className="text-muted-foreground mb-1">Roof Type</div>
            <div className="font-medium capitalize">
              {homeData.roof_type || "Unknown"}
            </div>
          </div>
        )}
        
        {homeData.year_built && (
          <div>
            <div className="text-muted-foreground mb-1">Built</div>
            <div className="font-medium">
              {homeData.year_built || "Unknown"}
            </div>
          </div>
        )}
        
        {marketTags.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">Weather Risk</div>
            <div className="font-medium">
              {marketTags.join(" + ")}
            </div>
          </div>
        )}
      </div>

      {homeData.neighborhood && (
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <span className="font-medium">Neighborhood:</span> {homeData.neighborhood}
        </div>
      )}

      <p className="text-xs text-muted-foreground pt-1">
        SmartSend uses this data to personalize emails with hyper-local context.
      </p>
    </div>
  );
}


























