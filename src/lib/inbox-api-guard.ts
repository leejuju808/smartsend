/**
 * Block 19750 — Inbox API Route Guard
 * Helper function to protect inbox API routes with access checks
 */

import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { checkInboxAccessServer } from './inbox-access';

/**
 * Guard function to check inbox access for API routes
 * Returns null if access is granted, or a NextResponse error if denied
 */
export async function requireInboxAccess(): Promise<NextResponse | null> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await checkInboxAccessServer(user.id);

    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error: 'Inbox access denied',
          message: 'You do not have access to the inbox feature. This is currently in beta.',
          accessLevel: access.accessLevel,
        },
        { status: 403 }
      );
    }

    return null; // Access granted
  } catch (error: any) {
    console.error('Error checking inbox access:', error);
    return NextResponse.json(
      { error: 'Failed to verify access' },
      { status: 500 }
    );
  }
}

/**
 * Use this in API routes like:
 * 
 * export async function GET(req: Request) {
 *   const accessCheck = await requireInboxAccess();
 *   if (accessCheck) return accessCheck;
 *   
 *   // ... rest of your route logic
 * }
 */



















































