import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAuthorizeUrl } from '@/lib/spotify'
import { getSpotifyRedirectUri } from '@/lib/base-url'
import { checkAdmin } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const redirectUri = getSpotifyRedirectUri(request)

    // Generate secure random state
    const state = crypto.randomBytes(16).toString('hex')

    const url = getAuthorizeUrl(redirectUri, state)
    const response = NextResponse.json({ success: true, url })

    // Set state cookie
    response.cookies.set('spotify_auth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 5 // 5 minutes is plenty
    })

    return response
  } catch (error: any) {
    console.error('Error in Spotify login route:', error)
    // SEC-04: Do not return internal error.message to the client
    return NextResponse.json({ success: false, error: 'Error al iniciar la vinculación con Spotify.' }, { status: 500 })
  }
}
