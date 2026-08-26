import { NextResponse } from 'next/server'
import { GUEST_SESSION_COOKIE, signGuestSession, timingSafeStringEqual } from '@/lib/auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, 'validate-passcode', RATE_LIMITS.validatePasscode.limit, RATE_LIMITS.validatePasscode.windowMs)
    if (limited) return limited

    const { passcode } = await request.json()

    // GUEST_PASSCODE es la única fuente de verdad (server-side, no expuesta al
    // cliente). NEXT_PUBLIC_PASSCODE está deprecado y ya no se usa como fallback.
    const expectedPasscode = process.env.GUEST_PASSCODE

    if (!passcode) {
      return NextResponse.json(
        { success: false, error: 'Por favor, introduce el código.' },
        { status: 400 }
      )
    }

    if (!expectedPasscode) {
      return NextResponse.json(
        { success: false, error: 'Configuración del servidor incompleta.' },
        { status: 500 }
      )
    }

    if (timingSafeStringEqual(passcode.trim(), expectedPasscode)) {
      const response = NextResponse.json({ success: true })
      response.cookies.set(GUEST_SESSION_COOKIE, signGuestSession(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      })
      return response
    }

    return NextResponse.json(
      { success: false, error: 'Código incorrecto.' },
      { status: 401 }
    )
  } catch (error) {
    console.error('Error in validate-passcode route:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
