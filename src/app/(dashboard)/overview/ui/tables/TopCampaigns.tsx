"use client";

import * as React from "react";

type Row = {
  campaign_id: string;
  campaign_name: string | null;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
};

export function TopCampaigns({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <Th>Campaign</Th>
            <Th className="text-right">Delivered</Th>
            <Th className="text-right">Opens</Th>
            <Th className="text-right">Clicks</Th>
            <Th className="text-right">Replies</Th>
            <Th className="text-right">Open %</Th>
            <Th className="text-right">Click %</Th>
            <Th className="text-right">Reply %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.campaign_id} className="border-t">
              <Td>{r.campaign_name ?? r.campaign_id.slice(0, 8)}</Td>
              <TdRight>{r.delivered}</TdRight>
              <TdRight>{r.opens}</TdRight>
              <TdRight>{r.clicks}</TdRight>
              <TdRight>{r.replies}</TdRight>
              <TdRight>{r.open_rate}%</TdRight>
              <TdRight>{r.click_rate}%</TdRight>
              <TdRight>{r.reply_rate}%</TdRight>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-center text-muted-foreground" colSpan={8}>
                No campaigns yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: any) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}
function Td({ children }: any) {
  return <td className="px-3 py-2">{children}</td>;
}
function TdRight({ children }: any) {
  return <td className="px-3 py-2 text-right tabular-nums">{children}</td>;
}