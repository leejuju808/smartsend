"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Template = { id: string; name: string; subject: string; html: string; text?: string | null; };

export default function TemplatePicker({ onSelect }: { onSelect: (tpl: Template) => void; }) {
  const [list, setList] = useState<Template[]>([]);
  useEffect(() => {
    supabase.from("email_templates").select("id,name,subject,html,text").order("updated_at", { ascending: false }).then(({ data }) => {
      setList((data || []) as Template[]);
    });
  }, []);
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500">Template:</label>
      <select className="border rounded-xl px-3 py-2" onChange={(e) => {
        const t = list.find((x) => x.id === e.target.value);
        if (t) onSelect(t);
      }}>
        <option value="">— Select —</option>
        {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );
}

