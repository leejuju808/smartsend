/**
 * POST /api/financing/soft-pull
 * Perform instant financing pre-approval (soft pull - no credit impact)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { performSoftPull, type SoftPullRequest } from '@/lib/financing/lenders';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const {
      jobId,
      customerId,
      amount,
      customerName,
      address,
      city,
      state,
      zip,
      ssnLast4,
      income,
      phone,
      email,
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount is required and must be greater than 0' },
        { status: 400 }
      );
    }

    if (!customerName || !address || !city || !state || !zip) {
      return NextResponse.json(
        { error: 'Customer information is required' },
        { status: 400 }
      );
    }

    // Get team_id from job or customer
    let teamId: string | null = null;
    let companyId: string | null = null;

    if (jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('team_id, company_id')
        .eq('id', jobId)
        .single();

      if (job) {
        teamId = job.team_id;
        companyId = job.company_id;
      }
    } else if (customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('team_id, company_id')
        .eq('id', customerId)
        .single();

      if (customer) {
        teamId = customer.team_id;
        companyId = customer.company_id;
      }
    }

    if (!teamId) {
      return NextResponse.json(
        { error: 'Could not determine team. Please provide jobId or customerId' },
        { status: 400 }
      );
    }

    // Perform soft pull
    const softPullRequest: SoftPullRequest = {
      customerName,
      address,
      city,
      state,
      zip,
      ssnLast4,
      income: income ? parseFloat(income) : undefined,
      phone,
      email,
      loanAmount: parseFloat(amount),
    };

    const softPullResponse = await performSoftPull(softPullRequest);

    // Create financing application record
    const { data: application, error: applicationError } = await supabase
      .from('financing_applications')
      .insert({
        job_id: jobId || null,
        customer_id: customerId || null,
        team_id: teamId,
        company_id: companyId,
        amount_requested: amount,
        soft_pull_done: true,
        soft_pull_timestamp: new Date().toISOString(),
        lender: softPullResponse.offers.length > 0 ? softPullResponse.offers[0].lender : null,
        lender_application_id: softPullResponse.lenderApplicationId || null,
        status: softPullResponse.preApproved ? 'pre_approved' : 'denied',
        customer_name: customerName,
        customer_address: address,
        customer_city: city,
        customer_state: state,
        customer_zip: zip,
        customer_ssn_last4: ssnLast4 || null,
        customer_income: income ? parseFloat(income) : null,
        customer_phone: phone || null,
        customer_email: email || null,
        offer: {
          creditScore: softPullResponse.creditScore,
          message: softPullResponse.message,
        },
        metadata: {
          softPullResponse: softPullResponse,
        },
      })
      .select()
      .single();

    if (applicationError) {
      console.error('Error creating financing application:', applicationError);
      // Continue anyway - soft pull succeeded
    }

    // Create financing offers if pre-approved
    if (softPullResponse.preApproved && application && softPullResponse.offers.length > 0) {
      const offersToInsert = softPullResponse.offers.map((offer) => ({
        application_id: application.id,
        plan_name: offer.planName,
        monthly_payment: offer.monthlyPayment,
        term_months: offer.termMonths,
        apr: offer.apr,
        same_as_cash: offer.sameAsCash,
        total_amount: offer.totalAmount,
        down_payment: offer.downPayment,
        lender: offer.lender,
        lender_offer_id: offer.lenderOfferId || null,
        is_available: true,
        is_recommended: offer.isRecommended || false,
        metadata: offer.metadata || {},
      }));

      await supabase.from('financing_offers').insert(offersToInsert);

      // Create event
      await supabase.from('financing_events').insert({
        application_id: application.id,
        event_type: 'pre_approved',
        message: softPullResponse.message || 'Pre-approval completed',
        event_data: {
          offersCount: softPullResponse.offers.length,
          creditScore: softPullResponse.creditScore,
        },
      });
    } else if (application) {
      // Create event for denial
      await supabase.from('financing_events').insert({
        application_id: application.id,
        event_type: 'denied',
        message: softPullResponse.message || 'Application denied',
        event_data: {
          creditScore: softPullResponse.creditScore,
        },
      });
    }

    return NextResponse.json({
      success: true,
      applicationId: application?.id || null,
      preApproved: softPullResponse.preApproved,
      offers: softPullResponse.offers,
      creditScore: softPullResponse.creditScore,
      message: softPullResponse.message,
    });
  } catch (error: any) {
    console.error('Error performing soft pull:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform soft pull' },
      { status: 500 }
    );
  }
}





















