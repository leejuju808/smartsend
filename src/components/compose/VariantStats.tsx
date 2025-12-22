'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { supabaseBrowser } from '@/lib/supabase-browser'

export default function VariantStats({ 
  campaignId 
}: {
  campaignId: string
}) {
  const [rows, setRows] = useState<any[]>([])
  const [variantLabels, setVariantLabels] = useState<Record<string, string>>({})
  
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser()
      
      // Fetch variant labels
      const { data: variants } = await sb
        .from('template_variants')
        .select('id, label')
      
      if (variants) {
        const labelMap: Record<string, string> = {}
        variants.forEach(v => {
          labelMap[v.id] = v.label
        })
        setVariantLabels(labelMap)
      }
      
      const { data, error } = await sb.rpc('get_variant_reply_stats', { c_id: campaignId })
      if (!error) setRows(data || [])
    })()
  }, [campaignId])

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <div className="text-sm font-medium mb-2">Variant Performance</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Variant</th>
                <th>Sent</th>
                <th>Replies</th>
                <th>Reply %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.variant_id}>
                  <td>{variantLabels[r.variant_id] || r.variant_id}</td>
                  <td>{r.sent_count}</td>
                  <td>{r.reply_count}</td>
                  <td>{r.reply_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

