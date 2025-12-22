"use client";
import { useEffect, useMemo, useState } from "react";
import { analyzeABTest, type ABTestResult } from "@/lib/ab-testing";
import { StepVariantsPanel } from "@/components/sequences/StepVariantsPanel";
import { SmartRewritePanel } from "@/components/templates/SmartRewritePanel";

const emptyStep = (pos:number)=>({
  position: pos, subject_template: "Quick question, {{contact.first_name}}",
  html_template: "<p>Hi {{contact.first_name}},</p><p>…</p>", wait_days: pos===1?0:3, window_start:"09:00", window_end:"17:00"
});

function VariantsEditor({ stepId }:{ stepId:string }){
  const [items,setItems]=useState<any[]>([]);
  const [metrics,setMetrics]=useState<any[]>([]);
  
  useEffect(()=>{ 
    fetch(`/api/sequences/steps/${stepId}/variants`).then(r=>r.json()).then(j=>setItems(j.variants||[]));
    fetch(`/api/sequences/steps/${stepId}/metrics`).then(r=>r.json()).then(j=>setMetrics(j.variants||[]));
  },[stepId]);
  
  function add(){ 
    setItems(p=>[...p, { 
      key: String.fromCharCode(65+(p.length||0)), 
      weight_pct: 50, 
      subject_template:"", 
      html_template:"" 
    }]); 
  }
  
  async function save(){
    await fetch("/api/sequences/steps/variants/upsert", { 
      method:"POST", 
      headers:{ "content-type":"application/json" }, 
      body: JSON.stringify({ stepId, variants: items }) 
    });
    alert("Variants saved");
  }
  
  return (
    <div className="border rounded p-2 space-y-2">
      <div className="flex justify-between">
        <div className="text-sm font-medium">Variants</div>
        <button className="text-sm underline" onClick={add}>+ Add</button>
      </div>
      {items.map((v:any, idx:number)=>(
        <div key={idx} className="grid grid-cols-6 gap-2 items-start">
          <input className="border rounded p-2" value={v.key} onChange={e=>setItems(up=>up.map((x,i)=>i===idx?{...x,key:e.target.value}:x))}/>
          <input className="border rounded p-2" type="number" value={v.weight_pct} onChange={e=>setItems(up=>up.map((x,i)=>i===idx?{...x,weight_pct:parseInt(e.target.value||"0")}:x))}/>
          <input className="border rounded p-2 col-span-2" placeholder="Subject…" value={v.subject_template} onChange={e=>setItems(up=>up.map((x,i)=>i===idx?{...x,subject_template:e.target.value}:x))}/>
          <textarea className="border rounded p-2 col-span-2" placeholder="HTML…" value={v.html_template} onChange={e=>setItems(up=>up.map((x,i)=>i===idx?{...x,html_template:e.target.value}:x))}/>
        </div>
      ))}
      <button onClick={save} className="px-3 py-1 rounded border">Save variants</button>
      
      {/* Variant Metrics */}
      {metrics.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Variant Performance</div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-1 text-left">Variant</th>
                <th className="p-1 text-left">Sent</th>
                <th className="p-1 text-left">Opens</th>
                <th className="p-1 text-left">Clicks</th>
                <th className="p-1 text-left">Open Rate</th>
                <th className="p-1 text-left">Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m:any)=>(
                <tr key={m.variant_id} className="border-t">
                  <td className="p-1">{m.variant_key}</td>
                  <td className="p-1">{m.sent}</td>
                  <td className="p-1">{m.unique_opens}</td>
                  <td className="p-1">{m.unique_clicks}</td>
                  <td className="p-1">{m.sent > 0 ? ((m.unique_opens / m.sent) * 100).toFixed(1) + '%' : '0%'}</td>
                  <td className="p-1">{m.sent > 0 ? ((m.unique_clicks / m.sent) * 100).toFixed(1) + '%' : '0%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Statistical Analysis */}
          {metrics.length >= 2 && (() => {
            const testResults: ABTestResult[] = metrics.map((m: any) => ({
              variant: m.variant_key,
              sent: m.sent,
              opens: m.unique_opens,
              clicks: m.unique_clicks,
              openRate: m.sent > 0 ? (m.unique_opens / m.sent) : 0,
              clickRate: m.sent > 0 ? (m.unique_clicks / m.sent) : 0
            }));
            
            const analysis = analyzeABTest(testResults);
            
            return (
              <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                <div className="font-medium text-blue-800 mb-1">Statistical Analysis</div>
                <div className="text-blue-700">{analysis.overallRecommendation}</div>
                {analysis.comparisons.length > 0 && (
                  <div className="mt-1">
                    {analysis.comparisons.map((comp, idx) => (
                      <div key={idx} className="text-blue-600">
                        {comp.variantA} vs {comp.variantB}: {comp.significance.recommendation}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function SequenceEditor({ params }: { params: { id: string }}) {
  const { id } = params;
  const [name,setName]=useState<string>("Sequence");
  const [dailyCap,setDailyCap]=useState<number>(300);
  const [steps,setSteps]=useState<any[]>([emptyStep(1), emptyStep(2)]);
  const [listId,setListId]=useState<string>("");

  useEffect(()=>{ (async ()=>{
    const meta = await fetch(`/api/sequences/${id}`).then(r=>r.json());
    if (meta.sequence){ setName(meta.sequence.name); setDailyCap(meta.sequence.daily_cap); }
    const s = await fetch(`/api/sequences/${id}/steps`).then(r=>r.json());
    if (s.steps?.length) setSteps(s.steps);
  })(); }, [id]);

  function setStep(i:number, patch:Partial<any>){
    setSteps(prev => prev.map((s,idx)=> idx===i ? { ...s, ...patch } : s));
  }
  function addStep(){ setSteps(prev => [...prev, emptyStep(prev.length+1)]); }
  function delStep(i:number){ setSteps(prev => prev.filter((_,idx)=>idx!==i).map((s,ii)=>({...s,position:ii+1}))); }
  async function save() {
    const r = await fetch("/api/sequences/steps/upsert", {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ sequenceId: id, steps })
    });
    if (!r.ok) alert((await r.json()).error || "Save failed");
  }
  async function enroll() {
    if (!listId) return alert("Pick a list id");
    const r = await fetch("/api/sequences/enroll", {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ sequenceId: id, listId })
    });
    const j = await r.json();
    if (r.ok) alert(`Enrolled ${j.enrolled} contacts`);
    else alert(j.error || "Enroll failed");
  }

  const preview = useMemo(()=>{
    const contact = { first_name:"Alex", last_name:"Kim", company:"Acme", email:"alex@acme.com", custom:{ role:"Ops" } };
    const data = { contact };
    const render = (tpl:string)=>tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,(_,k)=>String(k.split(".").reduce((o:any,kk:string)=>o?.[kk] ?? "", data)??""));
    return { subject: render(steps[0]?.subject_template||""), html: render(steps[0]?.html_template||"") };
  }, [steps]);

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <input className="border rounded p-2 flex-1" value={name} onChange={e=>setName(e.target.value)} />
          <input className="border rounded p-2 w-32" type="number" value={dailyCap} onChange={e=>setDailyCap(parseInt(e.target.value||"0"))} />
          <button onClick={save} className="px-3 py-2 rounded bg-black text-white">Save steps</button>
        </div>

        <div className="space-y-3">
          {steps.map((s, i)=>(
            <div key={i} className="border rounded-xl p-3 space-y-2">
              <div className="flex justify-between">
                <div className="font-medium">Step {i+1}</div>
                <button onClick={()=>delStep(i)} className="text-sm underline">Delete</button>
              </div>
              <input className="border rounded p-2 w-full" value={s.subject_template} onChange={e=>setStep(i,{subject_template:e.target.value})} />
              <textarea className="border rounded p-2 w-full min-h-[160px] font-mono" value={s.html_template} onChange={e=>setStep(i,{html_template:e.target.value})} />
              
              <SmartRewritePanel
                subject={s.subject_template || ""}
                body={s.html_template || ""}
                onApply={(subject, body) => {
                  setStep(i, { subject_template: subject, html_template: body });
                }}
                onCreateVariant={s.id ? async (subject, body) => {
                  try {
                    const res = await fetch(`/api/sequences/steps/${s.id}/variants/create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: "AI Variant",
                        subject,
                        body,
                        weight: 100,
                      }),
                    });
                    if (res.ok) {
                      // Optionally reload variants panel or show success message
                      alert("Variant created successfully!");
                    } else {
                      const json = await res.json();
                      alert(`Failed to create variant: ${json.error || "Unknown error"}`);
                    }
                  } catch (e) {
                    console.error("Error creating variant:", e);
                    alert("Failed to create variant");
                  }
                } : undefined}
              />
              
              <div className="grid grid-cols-3 gap-2">
                <label className="text-sm">Wait days
                  <input type="number" className="border rounded p-2 w-full" value={s.wait_days} onChange={e=>setStep(i,{wait_days:parseInt(e.target.value||"0")})}/>
                </label>
                <label className="text-sm">Window start
                  <input className="border rounded p-2 w-full" value={s.window_start} onChange={e=>setStep(i,{window_start:e.target.value})}/>
                </label>
                <label className="text-sm">Window end
                  <input className="border rounded p-2 w-full" value={s.window_end} onChange={e=>setStep(i,{window_end:e.target.value})}/>
                </label>
              </div>
              {s.id && <StepVariantsPanel stepId={s.id} />}
            </div>
          ))}
          <button onClick={addStep} className="px-3 py-2 rounded border">+ Add step</button>
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-sm text-gray-600 mb-2">Enroll a List</div>
          <div className="flex gap-2">
            <input className="border rounded p-2 flex-1" placeholder="List ID (UUID)" value={listId} onChange={e=>setListId(e.target.value)} />
            <button onClick={enroll} className="px-3 py-2 rounded bg-black text-white">Enroll</button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="border rounded-xl">
          <div className="px-3 py-2 border-b text-sm text-gray-600">Preview (Step 1)</div>
          <div className="px-3 py-3 font-medium">{preview.subject}</div>
          <iframe className="w-full h-[420px]" srcDoc={preview.html}/>
        </div>

        <SequenceMetrics id={id}/>
      </div>
    </div>
  );
}

function SequenceMetrics({ id }:{id:string}){
  const [data,setData]=useState<any>(null);
  useEffect(()=>{ fetch(`/api/sequences/${id}/metrics`).then(r=>r.json()).then(setData); },[id]);
  const steps = data?.steps || [];
  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b text-sm text-gray-600">Step Performance</div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr><th className="p-2 text-left">Step</th><th className="p-2 text-left">Sent</th><th className="p-2 text-left">Unique opens</th><th className="p-2 text-left">Unique clicks</th></tr>
        </thead>
        <tbody>
          {steps.map((s:any)=>(
            <tr key={s.step_id} className="border-t">
              <td className="p-2">#{s.position}</td>
              <td className="p-2">{s.sent_jobs}</td>
              <td className="p-2">{s.unique_opens}</td>
              <td className="p-2">{s.unique_clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}