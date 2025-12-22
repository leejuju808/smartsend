"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export interface LeadContextData {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  company?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  campaign_id?: string | null;
}

export function useLeadContext(leadEmail?: string) {
  const [lead, setLead] = useState<LeadContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  const load = async () => {
    if (!leadEmail) {
      setLead(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, first_name, last_name, email, company, phone, tags, notes, campaign_id")
        .eq("email", leadEmail)
        .maybeSingle();
      
      if (error) {
        console.error("Error loading lead context:", error);
        setLead(null);
      } else {
        setLead(data as LeadContextData | null);
      }
    } catch (err) {
      console.error("Error loading lead context:", err);
      setLead(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadEmail, supabase]);

  return { lead, loading, refresh: load };
}

