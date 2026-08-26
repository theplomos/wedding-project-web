import { NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/spotify'
import { getBaseUrl, getSpotifyRedirectUri } from '@/lib/base-url'
import { parseCookie, checkAdmin } from '@/lib/auth'

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request)

  const unauthorized = checkAdmin(request)
  if (unauthorized) {
    return NextResponse.redirect(`${baseUrl}/admin?spotify=error&message=${encodeURIComponent('No autorizado.')}`)
  }

  const cookieHeader = request.headers.get('cookie')
  const savedState = parseCookie(cookieHeader, 'spotify_auth_state')

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Delete the state cookie immediately on return
    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set('spotify_auth_state', '', { path: '/', maxAge: 0 })
      return res
    }

    if (error) {
      return clearStateCookie(
        NextResponse.redirect(`${baseUrl}/admin?spotify=error&message=${encodeURIComponent('Error de autorización con Spotify.')}`)
      )
    }

    if (!savedState || !state || savedState !== state) {
      return clearStateCookie(
        NextResponse.redirect(`${baseUrl}/admin?spotify=error&message=${encodeURIComponent('Verificación de estado fallida (posible CSRF).')}`)
      )
    }

    if (!code) {
      return clearStateCookie(
        NextResponse.redirect(`${baseUrl}/admin?spotify=error&message=${encodeURIComponent('Código de autorización faltante.')}`)
      )
    }

    // Must match the redirect_uri sent by the login route exactly.
    const redirectUri = getSpotifyRedirectUri(request)

    await exchangeCodeForTokens(code, redirectUri)

    return clearStateCookie(NextResponse.redirect(`${baseUrl}/admin?spotify=success`))
  } catch (error: any) {
    console.error('Error in Spotify callback route:', error)
    return NextResponse.redirect(`${baseUrl}/admin?spotify=error&message=${encodeURIComponent('Error al vincular la cuenta de Spotify.')}`)
  }
}
