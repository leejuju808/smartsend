import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCompanyId } from '@/lib/company-helpers'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCurrentCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
    }

    // Get safety dashboard stats using the database function
    const { data: stats, error: statsError } = await supabase.rpc('get_safety_dashboard_stats', {
      _company_id: companyId,
    })

    if (statsError) {
      console.error('Error fetching safety stats:', statsError)
      return NextResponse.json({ error: 'Failed to fetch safety stats' }, { status: 500 })
    }

    // Get employees missing sign-offs
    const { data: missingSignoffs, error: missingError } = await supabase.rpc(
      'get_employees_missing_signoffs',
      {
        _company_id: companyId,
        _days: 7,
      }
    )

    if (missingError) {
      console.error('Error fetching missing signoffs:', missingError)
    }

    // Get recent incidents (last 7 days)
    const { data: recentIncidents, error: incidentsError } = await supabase
      .from('safety_incidents')
      .select(
        `
        id,
        date,
        incident_type,
        severity,
        description,
        employee_id,
        workforce_employees:employee_id (
          id,
          first_name,
          last_name
        )
      `
      )
      .eq('company_id', companyId)
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(5)

    if (incidentsError) {
      console.error('Error fetching recent incidents:', incidentsError)
    }

    return NextResponse.json({
      stats: stats || {
        talks_completed_this_week: 0,
        employees_missing_signoffs: 0,
        recent_incidents: 0,
        safety_risk_score: 0,
      },
      missingSignoffs: missingSignoffs || [],
      recentIncidents: recentIncidents || [],
    })
  } catch (error) {
    console.error('Error in safety dashboard API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
























