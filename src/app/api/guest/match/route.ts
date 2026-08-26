import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { normalizeName } from '@/lib/normalize-name'
import { checkGuestSession, GUEST_SESSION_COOKIE, signGuestSession } from '@/lib/auth'
import { classifyMatch, FUZZY_THRESHOLD } from '@/lib/guest-match-classify'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// Fallback Levenshtein logic (when pg_trgm is not available)
function levenshteinDistance(s1: string, s2: string): number {
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  return track[s2.length][s1.length];
}

function calculateSimilarity(s1: string, s2: string): number {
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;
  return (maxLength - levenshteinDistance(s1, s2)) / maxLength;
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, 'guest-match', RATE_LIMITS.guestMatch.limit, RATE_LIMITS.guestMatch.windowMs)
    if (limited) return limited

    const denied = checkGuestSession(request)
    if (denied) return denied

    const { name } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Por favor, introduce tu nombre.' },
        { status: 400 }
      )
    }

    if (name.trim().length > 200) {
      return NextResponse.json(
        { success: false, error: 'El nombre es demasiado largo.' },
        { status: 400 }
      )
    }

    const normalized = normalizeName(name)

    // Require at least 2 words (name + surname)
    const words = normalized.split(' ').filter(w => w.length > 0)
    if (words.length < 2) {
      return NextResponse.json(
        { success: false, error: 'NEED_FULL_NAME' },
        { status: 400 }
      )
    }

    let bestScore: number | null = null
    let bestGuest: {
      id: string
      partyName: string
      partySizeMax: number
      status: string
      notPreloaded: boolean
      similarityScore: number
    } | null = null

    try {
      // 1. Try pg_trgm similarity
      const matchedGuests = await prisma.$queryRaw<Array<{
        id: string
        partyName: string
        partySizeMax: number
        status: string
        notPreloaded: boolean
        similarityScore: number
      }>>`
        SELECT id, party_name as "partyName", party_size_max as "partySizeMax", status, not_preloaded as "notPreloaded",
               similarity(searchable_name, ${normalized}) as "similarityScore"
        FROM guests
        WHERE similarity(searchable_name, ${normalized}) >= ${FUZZY_THRESHOLD}
        ORDER BY "similarityScore" DESC
        LIMIT 1;
      `

      if (matchedGuests && matchedGuests.length > 0) {
        bestGuest = matchedGuests[0]
        bestScore = Number(matchedGuests[0].similarityScore)
      }
    } catch (dbError) {
      console.warn('pg_trgm extension appears unavailable, falling back to JS Levenshtein:', dbError)

      // 2. Fallback: fetch all guests and apply Levenshtein
      const guests = await prisma.guest.findMany()
      let highestSimilarity = 0
      let fallbackMatch = null

      for (const guest of guests) {
        const score = calculateSimilarity(guest.searchableName, normalized)
        if (score > highestSimilarity) {
          highestSimilarity = score
          fallbackMatch = guest
        }
      }

      if (highestSimilarity >= FUZZY_THRESHOLD && fallbackMatch) {
        bestScore = highestSimilarity
        bestGuest = {
          id: fallbackMatch.id,
          partyName: fallbackMatch.partyName,
          partySizeMax: fallbackMatch.partySizeMax,
          status: fallbackMatch.status,
          notPreloaded: fallbackMatch.notPreloaded,
          similarityScore: highestSimilarity
        }
      }
    }

    const tier = classifyMatch(bestScore)

    if (tier === 'exact' && bestGuest) {
      // High confidence — return the full match and set session cookie
      const response = NextResponse.json({
        success: true,
        matchTier: 'exact',
        match: bestGuest
      })
      response.cookies.set(GUEST_SESSION_COOKIE, signGuestSession(bestGuest.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      })
      return response
    }

    if (tier === 'fuzzy') {
      // Medium confidence — do NOT reveal any guest data
      return NextResponse.json({
        success: true,
        matchTier: 'fuzzy'
      })
    }

    // Low or no match
    return NextResponse.json({
      success: true,
      matchTier: 'none'
    })
  } catch (error) {
    console.error('Error matching guest name:', error)
    return NextResponse.json(
      { success: false, error: 'Error al buscar el nombre.' },
      { status: 500 }
    )
  }
}
