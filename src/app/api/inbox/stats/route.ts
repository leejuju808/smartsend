import { NextRequest, NextResponse } from 'next/server';
import { createReplyProcessor } from '@/lib/replies';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    const replyProcessor = createReplyProcessor();
    const stats = await replyProcessor.getReplyStats(workspaceId);

    return NextResponse.json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('Error fetching inbox stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch inbox stats' },
      { status: 500 }
    );
  }
} 