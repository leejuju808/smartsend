// Block 255100 — SmartSend AI Insurance Claim Engine v1
// Adjuster Communication Templates
// Pre-built templates for communicating with adjusters

export interface AdjusterTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[]; // Array of variable names that can be replaced
}

export const ADJUSTER_TEMPLATES: AdjusterTemplate[] = [
  {
    id: 'initial_claim',
    name: 'Initial Claim Submission',
    subject: 'Insurance Claim Documentation - Claim #{claim_number}',
    body: `Dear {adjuster_name},

I am writing to submit documentation for insurance claim #{claim_number} for {homeowner_name} at {address}.

Attached is our complete damage report and code-required items missing from your Xactimate scope.

**Claim Details:**
- Claim Number: {claim_number}
- Property: {address}
- Carrier: {carrier}
- Date of Loss: {loss_date}

**Damage Summary:**
{damage_summary}

**Code-Required Items Missing from Scope:**
{missing_code_items}

Please review the attached documentation and photos. We are available to discuss this claim at your convenience.

Best regards,
{contractor_name}
{contractor_phone}
{contractor_email}`,
    variables: [
      'claim_number',
      'adjuster_name',
      'homeowner_name',
      'address',
      'carrier',
      'loss_date',
      'damage_summary',
      'missing_code_items',
      'contractor_name',
      'contractor_phone',
      'contractor_email',
    ],
  },
  {
    id: 'supplement_request',
    name: 'Supplement Request',
    subject: 'Supplement Request - Claim #{claim_number} - Supplement #{supplement_number}',
    body: `Dear {adjuster_name},

I am submitting Supplement #{supplement_number} for claim #{claim_number} at {address}.

**Supplement Items:**
{supplement_items}

**Justification:**
{supplement_justification}

**Supporting Documentation:**
- Photos with AI damage detection included
- Code references: {code_references}
- Measurement reports

Total Supplement Amount: ${supplement_total}

Please review Supplement #{supplement_number} and the attached documentation. These items are necessary for proper code compliance and complete scope of work.

I am available to discuss this supplement at your convenience.

Best regards,
{contractor_name}
{contractor_phone}
{contractor_email}`,
    variables: [
      'claim_number',
      'supplement_number',
      'adjuster_name',
      'address',
      'supplement_items',
      'supplement_justification',
      'code_references',
      'supplement_total',
      'contractor_name',
      'contractor_phone',
      'contractor_email',
    ],
  },
  {
    id: 'code_compliance',
    name: 'Code Compliance Argument',
    subject: 'Code-Required Items - Claim #{claim_number}',
    body: `Dear {adjuster_name},

Regarding claim #{claim_number} at {address}, I need to bring to your attention several code-required items that are missing from the approved scope.

**Local Building Code Requirements:**
{code_requirements}

**Missing Items:**
{missing_items}

These items are required by {local_code} and must be included in the scope of work to ensure code compliance. Failure to include these items would result in code violations and potential liability issues.

**Code References:**
{code_references}

I have attached photos and documentation supporting these code requirements. Please review and approve these items for inclusion in the claim.

Thank you for your attention to this matter.

Best regards,
{contractor_name}
{contractor_phone}
{contractor_email}`,
    variables: [
      'claim_number',
      'adjuster_name',
      'address',
      'code_requirements',
      'missing_items',
      'local_code',
      'code_references',
      'contractor_name',
      'contractor_phone',
      'contractor_email',
    ],
  },
  {
    id: 'damage_explanation',
    name: 'Damage Explanation',
    subject: 'Damage Documentation - Claim #{claim_number}',
    body: `Dear {adjuster_name},

I am providing detailed documentation of the damage found at {address} for claim #{claim_number}.

**Damage Type:** {damage_type}
**Location:** {damage_location}
**Severity:** {damage_severity}

**Detailed Findings:**
{damage_findings}

**AI Analysis:**
Our AI damage classification system has analyzed the photos and identified:
- Primary Damage Type: {ai_damage_type}
- Confidence Level: {ai_confidence}%
- Specific Indicators: {ai_indicators}

**Photos:**
{photo_summary}

**Recommended Action:**
{recommended_action}

The attached photos and AI analysis provide clear evidence of the damage. Please review and approve the necessary scope of work.

Best regards,
{contractor_name}
{contractor_phone}
{contractor_email}`,
    variables: [
      'claim_number',
      'adjuster_name',
      'address',
      'damage_type',
      'damage_location',
      'damage_severity',
      'damage_findings',
      'ai_damage_type',
      'ai_confidence',
      'ai_indicators',
      'photo_summary',
      'recommended_action',
      'contractor_name',
      'contractor_phone',
      'contractor_email',
    ],
  },
  {
    id: 'rebuttal_lowball',
    name: 'Rebuttal for Lowball Offer',
    subject: 'Re: Claim #{claim_number} - Scope Review Request',
    body: `Dear {adjuster_name},

I have reviewed the approved scope for claim #{claim_number} at {address} and need to address several concerns.

**Scope Discrepancies:**
{scope_discrepancies}

**Missing Items:**
{missing_items}

**Under-Quantified Items:**
{under_quantified_items}

**Code-Required Items:**
{code_required_items}

The current approved scope does not reflect the actual damage and code requirements. I have attached:
- Detailed damage photos with AI analysis
- Code reference documentation
- Measurement reports
- Material specifications

**Requested Adjustments:**
{requested_adjustments}

Total Additional Amount: ${additional_amount}

I respectfully request a review of the scope to ensure it accurately reflects the damage and meets code requirements. I am available to meet on-site to review these items together.

Thank you for your consideration.

Best regards,
{contractor_name}
{contractor_phone}
{contractor_email}`,
    variables: [
      'claim_number',
      'adjuster_name',
      'address',
      'scope_discrepancies',
      'missing_items',
      'under_quantified_items',
      'code_required_items',
      'requested_adjustments',
      'additional_amount',
      'contractor_name',
      'contractor_phone',
      'contractor_email',
    ],
  },
  {
    id: 'follow_up',
    name: 'Follow-Up on Pending Items',
    subject: 'Follow-Up: Claim #{claim_number} - Pending Items',
    body: `Dear {adjuster_name},

I am following up on claim #{claim_number} at {address} regarding the following pending items:

**Pending Items:**
{pending_items}

**Status:**
- Supplement #{supplement_number}: {supplement_status}
- Missing Items: {missing_items_status}
- Code Items: {code_items_status}

I submitted {submission_date} and have not yet received a response. Could you please provide an update on the status of these items?

I am available to discuss this claim at your convenience. Please let me know if you need any additional documentation.

Thank you for your attention.

Best regards,
{contractor_name}
{contractor_phone}
{contractor_email}`,
    variables: [
      'claim_number',
      'adjuster_name',
      'address',
      'pending_items',
      'supplement_number',
      'supplement_status',
      'missing_items_status',
      'code_items_status',
      'submission_date',
      'contractor_name',
      'contractor_phone',
      'contractor_email',
    ],
  },
];

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): AdjusterTemplate | undefined {
  return ADJUSTER_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Render template with variables
 */
export function renderTemplate(
  template: AdjusterTemplate,
  variables: Record<string, string>
): { subject: string; body: string } {
  let subject = template.subject;
  let body = template.body;

  // Replace all variables
  template.variables.forEach((variable) => {
    const value = variables[variable] || `{${variable}}`;
    const regex = new RegExp(`\\{${variable}\\}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  });

  return { subject, body };
}





















