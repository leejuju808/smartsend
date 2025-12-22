export type DomainAllowanceInput = {
  todaySent: number;
  maxDailySends?: number | null;
  bounceRate7d: number;
  complaintRate7d: number;
  bounceCeil?: number | null;
  complaintCeil?: number | null;
  warmup: boolean;
  accountAgeDays: number;
  domainAgeDays: number;
};

/**
 * Returns remaining sends allowed today for a recipient domain.
 * Warmup ramp: min(baseCap, rampCurve), where rampCurve grows with age.
 */
export function calcDomainAllowance(input: DomainAllowanceInput) {
  const baseCap = Math.max(25, input.maxDailySends ?? 300);

  if (input.bounceCeil != null && input.bounceRate7d > input.bounceCeil) return 0;
  if (input.complaintCeil != null && input.complaintRate7d > input.complaintCeil) return 0;

  let cap = baseCap;

  if (input.warmup) {
    const age = Math.max(input.accountAgeDays, 1);
    const ramp = Math.round(20 + 15 * Math.log2(age + 1) + 10 * Math.sqrt(age));
    cap = Math.min(cap, Math.max(25, ramp));
  }

  const remaining = Math.max(0, cap - input.todaySent);
  return remaining;
}

