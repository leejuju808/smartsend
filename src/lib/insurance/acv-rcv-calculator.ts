// Block 255100 — SmartSend AI Insurance Claim Engine v1
// ACV/RCV Calculator
// Calculates Actual Cash Value, Replacement Cost Value, depreciation, and payouts

export interface ACVRCVCalculation {
  rcv: number; // Replacement Cost Value
  depreciation: number; // Depreciation amount
  depreciationPercent: number; // Depreciation percentage
  acv: number; // Actual Cash Value (RCV - Depreciation)
  deductible: number; // Deductible amount
  totalOwedToContractor: number; // RCV - Depreciation (what contractor gets)
  homeownerOwed: number; // Deductible (what homeowner pays)
  breakdown: {
    rcv: number;
    depreciation: number;
    acv: number;
    deductible: number;
    firstCheck: number; // ACV - Deductible (first check)
    depreciationCheck: number; // Depreciation (second check)
    totalOwed: number; // Total owed to contractor
  };
}

export interface ClaimFinancials {
  rcv?: number;
  depreciation?: number;
  depreciationPercent?: number;
  acv?: number;
  deductible?: number;
}

/**
 * Calculate ACV/RCV breakdown for insurance claim
 */
export function calculateACVRCV(
  financials: ClaimFinancials
): ACVRCVCalculation {
  const rcv = financials.rcv || 0;
  const deductible = financials.deductible || 0;

  // Calculate depreciation
  let depreciation = financials.depreciation || 0;
  let depreciationPercent = financials.depreciationPercent || 0;

  if (depreciationPercent > 0 && depreciation === 0) {
    // Calculate depreciation from percentage
    depreciation = (rcv * depreciationPercent) / 100;
  } else if (depreciation > 0 && depreciationPercent === 0) {
    // Calculate percentage from amount
    depreciationPercent = rcv > 0 ? (depreciation / rcv) * 100 : 0;
  }

  // ACV = RCV - Depreciation
  const acv = rcv - depreciation;

  // First check = ACV - Deductible (if ACV > Deductible)
  const firstCheck = Math.max(0, acv - deductible);

  // Depreciation check = Depreciation (paid after work is complete)
  const depreciationCheck = depreciation;

  // Total owed to contractor = RCV - Depreciation (what contractor gets)
  const totalOwedToContractor = rcv - depreciation;

  // Homeowner owes = Deductible
  const homeownerOwed = deductible;

  return {
    rcv,
    depreciation,
    depreciationPercent,
    acv,
    deductible,
    totalOwedToContractor,
    homeownerOwed,
    breakdown: {
      rcv,
      depreciation,
      acv,
      deductible,
      firstCheck,
      depreciationCheck,
      totalOwed: totalOwedToContractor,
    },
  };
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Get human-readable explanation of ACV/RCV
 */
export function getACVRCVExplanation(calculation: ACVRCVCalculation): string {
  const { rcv, depreciation, acv, deductible, breakdown } = calculation;

  return `
**Insurance Claim Breakdown:**

**RCV (Replacement Cost Value):** ${formatCurrency(rcv)}
This is the total cost to replace your roof.

**Depreciation:** ${formatCurrency(depreciation)} (${calculation.depreciationPercent.toFixed(1)}%)
Insurance companies reduce payout based on roof age and wear.

**ACV (Actual Cash Value):** ${formatCurrency(acv)}
This is RCV minus depreciation - what insurance initially pays.

**Deductible:** ${formatCurrency(deductible)}
This is your out-of-pocket cost.

**First Check:** ${formatCurrency(breakdown.firstCheck)}
You'll receive this after claim approval (ACV - Deductible).

**Depreciation Check:** ${formatCurrency(breakdown.depreciationCheck)}
You'll receive this after work is complete.

**Total Owed to Contractor:** ${formatCurrency(breakdown.totalOwed)}
This is what the contractor receives (RCV - Depreciation).

**Your Out-of-Pocket:** ${formatCurrency(deductible)}
This is your deductible amount.
  `.trim();
}





















