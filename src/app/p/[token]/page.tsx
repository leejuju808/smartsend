// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// Page: Public Proposal Viewer (Homeowner-Facing)

"use client";

import { ProposalViewerV2 } from "@/components/proposals/ProposalViewerV2";
import { use } from "react";

export default function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return <ProposalViewerV2 token={token} />;
}
































