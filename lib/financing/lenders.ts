/**
 * Multi-Lender Integration Service
 * 
 * Integrates with financing providers like Hearth, Sunlight, Wisetack, Enhancify
 * For now, this is a mock implementation that simulates lender responses
 * In production, replace with actual API calls to lender services
 */

export type LenderName = 'hearth' | 'sunlight' | 'wisetack' | 'enhancify';

export interface LenderOffer {
  lender: LenderName;
  planName: string;
  monthlyPayment: number;
  termMonths: number;
  apr: number;
  sameAsCash: boolean;
  totalAmount: number;
  downPayment: number;
  isRecommended?: boolean;
  lenderOfferId?: string;
  metadata?: Record<string, any>;
}

export interface SoftPullRequest {
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ssnLast4?: string;
  income?: number;
  phone?: string;
  email?: string;
  loanAmount: number;
}

export interface SoftPullResponse {
  success: boolean;
  preApproved: boolean;
  offers: LenderOffer[];
  creditScore?: number;
  message?: string;
  lenderApplicationId?: string;
}

/**
 * Calculate monthly payment for a loan
 */
export function calculateMonthlyPayment(
  loanAmount: number,
  apr: number,
  termMonths: number
): number {
  if (apr === 0) {
    // Same-as-cash (0% APR)
    return Math.round((loanAmount / termMonths) * 100) / 100;
  }

  const monthlyRate = apr / 100 / 12;
  const payment =
    (monthlyRate * loanAmount) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  return Math.round(payment * 100) / 100;
}

/**
 * Get standard financing options for a given amount
 * These are typical roofing financing options
 */
export function getStandardFinancingOptions(
  amount: number,
  state?: string
): LenderOffer[] {
  const options: LenderOffer[] = [];

  // 12 Months Same-As-Cash (0% APR) - Usually available
  options.push({
    lender: 'hearth',
    planName: '12 Months Same-As-Cash',
    monthlyPayment: calculateMonthlyPayment(amount, 0, 12),
    termMonths: 12,
    apr: 0,
    sameAsCash: true,
    totalAmount: amount,
    downPayment: 0,
    isRecommended: amount <= 15000, // Recommended for smaller jobs
  });

  // 36 Month Payment Plan (6.99% APR)
  options.push({
    lender: 'sunlight',
    planName: '36 Month Payment Plan',
    monthlyPayment: calculateMonthlyPayment(amount, 6.99, 36),
    termMonths: 36,
    apr: 6.99,
    sameAsCash: false,
    totalAmount: calculateMonthlyPayment(amount, 6.99, 36) * 36,
    downPayment: 0,
    isRecommended: amount > 15000 && amount <= 25000,
  });

  // 60 Month Payment Plan (8.99% APR)
  options.push({
    lender: 'wisetack',
    planName: '60 Month Payment Plan',
    monthlyPayment: calculateMonthlyPayment(amount, 8.99, 60),
    termMonths: 60,
    apr: 8.99,
    sameAsCash: false,
    totalAmount: calculateMonthlyPayment(amount, 8.99, 60) * 60,
    downPayment: 0,
    isRecommended: amount > 25000,
  });

  // 18 Months Same-As-Cash (for larger jobs)
  if (amount > 20000) {
    options.push({
      lender: 'enhancify',
      planName: '18 Months Same-As-Cash',
      monthlyPayment: calculateMonthlyPayment(amount, 0, 18),
      termMonths: 18,
      apr: 0,
      sameAsCash: true,
      totalAmount: amount,
      downPayment: 0,
    });
  }

  return options;
}

/**
 * Perform soft pull pre-approval check
 * 
 * In production, this would:
 * 1. Call lender APIs with customer information
 * 2. Perform soft credit check (no impact on credit score)
 * 3. Return instant pre-approval offers
 * 
 * For now, this simulates the process
 */
export async function performSoftPull(
  request: SoftPullRequest
): Promise<SoftPullResponse> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Mock credit score based on income (simplified)
  const estimatedCreditScore = request.income
    ? Math.min(850, Math.max(600, 600 + (request.income - 30000) / 500))
    : 700;

  // Determine if pre-approved (mock logic)
  const preApproved =
    estimatedCreditScore >= 650 &&
    request.loanAmount <= 50000 &&
    (!request.income || request.income >= 30000);

  if (!preApproved) {
    return {
      success: true,
      preApproved: false,
      offers: [],
      creditScore: estimatedCreditScore,
      message:
        'We found some alternative financing options that may work for your budget.',
    };
  }

  // Get standard offers
  const offers = getStandardFinancingOptions(request.loanAmount, request.state);

  // Mark the best offer as recommended
  const recommendedOffer = offers.find((o) => o.isRecommended) || offers[0];
  if (recommendedOffer) {
    recommendedOffer.isRecommended = true;
  }

  return {
    success: true,
    preApproved: true,
    offers,
    creditScore: estimatedCreditScore,
    lenderApplicationId: `APP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    message: "You're Pre-Approved!",
  };
}

/**
 * Get available lenders for a given region/state
 */
export function getAvailableLenders(state?: string): LenderName[] {
  // All lenders available nationwide
  // In production, this would check lender availability by state
  return ['hearth', 'sunlight', 'wisetack', 'enhancify'];
}

/**
 * Get lender display name
 */
export function getLenderDisplayName(lender: LenderName): string {
  const names: Record<LenderName, string> = {
    hearth: 'Hearth',
    sunlight: 'Sunlight',
    wisetack: 'Wisetack',
    enhancify: 'Enhancify',
  };
  return names[lender] || lender;
}

/**
 * Get best offer from multiple lenders
 */
export function getBestOffer(offers: LenderOffer[]): LenderOffer | null {
  if (offers.length === 0) return null;

  // Prioritize same-as-cash offers, then lowest APR, then lowest monthly payment
  return offers.reduce((best, current) => {
    if (!best) return current;

    // Same-as-cash always wins
    if (current.sameAsCash && !best.sameAsCash) return current;
    if (!current.sameAsCash && best.sameAsCash) return best;

    // Lower APR wins
    if (current.apr < best.apr) return current;
    if (current.apr > best.apr) return best;

    // Lower monthly payment wins
    if (current.monthlyPayment < best.monthlyPayment) return current;

    return best;
  }, null as LenderOffer | null);
}





















