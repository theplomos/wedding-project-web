import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE } from '@/lib/admin-auth'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: Request) {
  // Require an active admin session; prevents random unauthenticated calls.
  const unauthorized = checkAdmin(request)
  if (unauthorized) return unauthorized

  const response = NextResponse.json({ success: true })
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
