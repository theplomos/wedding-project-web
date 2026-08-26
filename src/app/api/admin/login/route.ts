import { NextResponse } from 'next/server'
import { timingSafeStringEqual } from '@/lib/auth'
import { signAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Rate-limit admin login attempts to slow brute-force attacks.
  const denied = rateLimit(request, 'admin-login', RATE_LIMITS.validatePasscode.limit, RATE_LIMITS.validatePasscode.windowMs)
  if (denied) return denied

  try {
    const expectedPassword = process.env.ADMIN_PASSWORD

    if (!expectedPassword) {
      return NextResponse.json(
        { success: false, error: 'Configuración del servidor incompleta.' },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!password || !timingSafeStringEqual(password, expectedPassword)) {
      return NextResponse.json(
        { success: false, error: 'Contraseña incorrecta.' },
        { status: 401 }
      )
    }

    // Sign a session token and set it as an httpOnly cookie.
    const token = signAdminSession()
    const response = NextResponse.json({ success: true })

    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60, // 2 hours — matches ADMIN_SESSION_MAX_AGE_MS in admin-auth.ts
    })

    return response
  } catch (error) {
    console.error('Error in admin login route:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
