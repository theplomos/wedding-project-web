import { NextResponse } from 'next/server'
import { searchTracks } from '@/lib/spotify'
import prisma from '@/lib/prisma'
import { checkGuestSession } from '@/lib/auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    const denied = checkGuestSession(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || !query.trim()) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required.' }, { status: 400 })
    }

    const cleanQuery = query.trim().slice(0, 100)
    const tracks = await searchTracks(cleanQuery)

    const trackIds = tracks.map((track: any) => track.id)
    const existingSuggestions = await prisma.spotifySuggestion.findMany({
      where: {
        trackId: { in: trackIds },
      },
    })

    const mappedTracks = tracks.map((track: any) => {
      const suggestion = existingSuggestions.find((s) => s.trackId === track.id)
      const releaseYear = track.album?.release_date ? String(track.album.release_date).substring(0, 4) : ''
      return {
        id: track.id,
        name: track.name,
        artists: track.artists.map((a: any) => a.name).join(', '),
        albumName: track.album.name,
        releaseYear,
        imageUrl: track.album.images?.[0]?.url || '',
        previewUrl: track.preview_url || '',
        isSuggested: !!suggestion,
        suggestionStatus: suggestion ? suggestion.status : null,
        votes: suggestion ? suggestion.votes : 0,
      }
    })

    return NextResponse.json({ success: true, tracks: mappedTracks })
  } catch (error: any) {
    console.error('Error in Spotify search route:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 })
  }
}
