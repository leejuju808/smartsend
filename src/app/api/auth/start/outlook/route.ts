import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId') || undefined
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_OAUTH_REDIRECT_URL!,
    response_mode: 'query',
    scope: [
      'openid',
      'offline_access',
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
    ].join(' '),
  })
  if (userId) params.set('state', JSON.stringify({ userId }))
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  return NextResponse.redirect(authUrl)
}

