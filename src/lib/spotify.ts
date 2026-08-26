import prisma from './prisma'

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const SPOTIFY_PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

let cachedClientToken: string | null = null
let cachedClientTokenExpiresAt: number = 0

function getBasicAuthHeader() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET) are not configured.')
  }
  const credentials = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}

export async function getClientCredentialsToken(): Promise<string> {
  const now = Date.now()
  if (cachedClientToken && cachedClientTokenExpiresAt > now + 60000) {
    return cachedClientToken
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to get Spotify client credentials token: ${res.statusText}. Details: ${errorText}`)
  }

  const data = (await res.json()) as SpotifyTokenResponse
  cachedClientToken = data.access_token
  cachedClientTokenExpiresAt = now + data.expires_in * 1000

  return cachedClientToken
}

export function getAuthorizeUrl(redirectUri: string, state: string): string {
  if (!SPOTIFY_CLIENT_ID) {
    throw new Error('Spotify Client ID is not configured.')
  }
  const scopes = 'playlist-modify-public playlist-modify-private'
  return `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    show_dialog: 'true',
  }).toString()}`
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<void> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to exchange Spotify authorization code: ${res.statusText}. Details: ${errorText}`)
  }

  const data = (await res.json()) as SpotifyTokenResponse
  if (!data.refresh_token) {
    throw new Error('No refresh token returned by Spotify.')
  }

  await prisma.systemConfig.upsert({
    where: { key: 'spotify_refresh_token' },
    update: { value: data.refresh_token },
    create: { key: 'spotify_refresh_token', value: data.refresh_token },
  })
}

export async function getHostAccessToken(): Promise<string> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'spotify_refresh_token' },
  })

  if (!config || !config.value) {
    throw new Error('Spotify is not authorized yet. Please log in as admin and link your Spotify account.')
  }

  const refreshToken = config.value

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to refresh Spotify host access token: ${res.statusText}. Details: ${errorText}`)
  }

  const data = (await res.json()) as SpotifyTokenResponse

  if (data.refresh_token) {
    await prisma.systemConfig.update({
      where: { key: 'spotify_refresh_token' },
      data: { value: data.refresh_token },
    })
  }

  return data.access_token
}

export async function addTrackToPlaylist(trackId: string): Promise<void> {
  if (!SPOTIFY_PLAYLIST_ID) {
    throw new Error('Spotify playlist ID (SPOTIFY_PLAYLIST_ID) is not configured.')
  }

  const accessToken = await getHostAccessToken()

  const res = await fetch(`https://api.spotify.com/v1/playlists/${SPOTIFY_PLAYLIST_ID}/tracks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uris: [`spotify:track:${trackId}`],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to add track to Spotify playlist: ${res.statusText}. Details: ${errorText}`)
  }
}

export async function searchTracks(query: string) {
  const token = await getClientCredentialsToken()

  const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Spotify search failed: ${res.statusText}. Details: ${errorText}`)
  }

  const data = await res.json()
  return data.tracks?.items || []
}
