/**
 * Block 12900: API route wrapper for permission checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { checkPermission, PermissionAction, getCurrentUserRole } from '@/lib/permissions/block12900';

export interface PermissionContext {
  orgId: string;
  userId: string;
  role: string | null;
}

/**
 * Get current user's org context
 */
async function getOrgContext(): Promise<PermissionContext | null> {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    // Get current org from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_org_id) {
      return null;
    }

    const role = await getCurrentUserRole();

    return {
      orgId: profile.current_org_id,
      userId: user.id,
      role: role || null,
    };
  } catch (error) {
    console.error('Error getting org context:', error);
    return null;
  }
}

/**
 * Wrapper for API routes that require a specific permission
 */
export function withPermission(
  action: PermissionAction,
  handler: (req: NextRequest, context: PermissionContext) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const context = await getOrgContext();
      
      if (!context) {
        return NextResponse.json(
          {
            error: 'insufficient_permissions',
            message: 'You must be a member of an organization to access this feature.',
          },
          { status: 403 }
        );
      }

      const hasPermission = await checkPermission(
        context.orgId,
        context.userId,
        action
      );

      if (!hasPermission) {
        return NextResponse.json(
          {
            error: 'insufficient_permissions',
            message: 'Upgrade your role to access this feature.',
          },
          { status: 403 }
        );
      }

      return handler(req, context);
    } catch (error: any) {
      console.error('Permission check error:', error);
      
      if (error.message === 'insufficient_permissions') {
        return NextResponse.json(
          {
            error: 'insufficient_permissions',
            message: 'Upgrade your role to access this feature.',
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Wrapper that requires org membership (any role)
 */
export function withOrgMember(
  handler: (req: NextRequest, context: PermissionContext) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const context = await getOrgContext();
      
      if (!context) {
        return NextResponse.json(
          {
            error: 'unauthorized',
            message: 'You must be a member of an organization.',
          },
          { status: 401 }
        );
      }

      return handler(req, context);
    } catch (error: any) {
      console.error('Org member check error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}




























































