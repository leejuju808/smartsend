"use client";
import useSWR from "swr";
import { useParams } from "next/navigation";
const fetcher = (u:string)=>fetch(u).then(r=>r.json());

export default function ThreadPage(){
  const { jobId } = useParams<{jobId:string}>();
  const { data } = useSWR(jobId ? `/api/inbox/${jobId}` : null, fetcher);
  const thread = data?.thread || [];
  const header = data?.header;
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{header?.to_email}</h1>
          <div className="text-sm text-gray-600">{header?.subject}</div>
        </div>
        <div className="text-sm">
          <span className="text-gray-600">Campaign:</span> {header?.campaign_id || "—"}
        </div>
      </div>
      <div className="space-y-3">
        {thread.map((m:any)=>(
          <div key={m.id} className="border rounded-xl p-3">
            <div className="flex justify-between text-sm mb-1">
              <div className="font-medium">{m.from_email}</div>
              <div className="text-gray-500">{new Date(m.created_at).toLocaleString()}</div>
            </div>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: m.html_body || `<pre>${m.text_body || ""}</pre>`}} />
          </div>
        ))}
      </div>
    </div>
  );
}