"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Signature = { id: string; name: string; html: string; is_default: boolean };

export default function SignaturePicker({ value, onChange }: { value?: string|null; onChange: (sig: Signature|null) => void; }) {
  const [list, setList] = useState<Signature[]>([]);
  useEffect(() => {
    supabase.from("email_signatures").select("id,name,html,is_default").order("is_default", { ascending: false }).then(({ data }) => {
      setList((data || []) as Signature[]);
    });
  }, []);
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500">Signature:</label>
      <select className="border rounded-xl px-3 py-2" value={value ?? ""} onChange={(e) => {
        const sig = list.find((x) => x.id === e.target.value) || null;
        onChange(sig);
      }}>
        <option value="">— None —</option>
        {list.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? " • Default" : ""}</option>)}
      </select>
    </div>
  );
}

