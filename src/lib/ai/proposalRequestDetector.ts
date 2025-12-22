// Block 20520 — SmartSend Proposal Request Detector
// Detects when homeowners ask for proposals/quotes

/**
 * Detect if a homeowner message requests a proposal/quote
 */
export function detectProposalRequest(messageText: string): boolean {
  if (!messageText) return false;

  const lowerText = messageText.toLowerCase();

  // Patterns that indicate proposal request
  const proposalPatterns = [
    /send.*me.*(?:quote|proposal|estimate|bid)/i,
    /can.*you.*send.*(?:quote|proposal|estimate)/i,
    /I.*need.*(?:quote|proposal|estimate)/i,
    /want.*(?:quote|proposal|estimate)/i,
    /get.*me.*(?:quote|proposal|estimate)/i,
    /(?:quote|proposal|estimate).*please/i,
    /(?:email|send).*(?:quote|proposal|estimate)/i,
  ];

  return proposalPatterns.some((pattern) => pattern.test(lowerText));
}

/**
 * Check if proposal should be auto-generated based on context
 */
export function shouldAutoGenerateProposal(context: {
  hasEstimate: boolean;
  insuranceClaimStatus?: string;
  homeownerRequested?: boolean;
}): boolean {
  // Auto-generate if:
  // 1. Homeowner explicitly requested
  if (context.homeownerRequested) return true;

  // 2. Insurance claim approved but homeowner undecided
  if (
    context.insuranceClaimStatus === "approved" ||
    context.insuranceClaimStatus === "approved_acv_only"
  ) {
    return true;
  }

  // 3. Has estimate and insurance claim is in progress
  if (
    context.hasEstimate &&
    (context.insuranceClaimStatus === "under_review" ||
      context.insuranceClaimStatus === "supplements_needed")
  ) {
    return true;
  }

  return false;
}
















































