"use client";
import useSWR from "swr";

const fetcher = (u:string)=>fetch(u, { headers: { "Authorization": `Bearer ${localStorage.getItem("sb-access-token")}` }}).then(r=>r.json());

export function MembersList({ campaignId }: { campaignId: string }) {
  const { data } = useSWR(`/api/campaigns/${campaignId}/members`, fetcher);
  if (!data) return null;

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-medium mb-2">Members</div>
      <ul className="text-sm space-y-1">
        {data.members?.map((m:any)=>(
          <li key={m.user_id} className="flex items-center justify-between">
            <span>{m.email ?? m.user_id}</span>
            <span className="text-xs px-2 py-0.5 rounded-full border">{m.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


