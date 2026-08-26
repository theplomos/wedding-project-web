import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseGuestSession } from '@/lib/auth'

const MAX_SUGGESTIONS_PER_GUEST = 8

export async function GET(request: Request) {
  try {
    const session = parseGuestSession(request)
    if (!session.isValid) {
      return NextResponse.json(
        { success: false, error: 'Sesión no válida. Vuelve a introducir el código.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const guestId = searchParams.get('guestId')

    if (!guestId) {
      return NextResponse.json({ success: false, error: 'guestId es requerido.' }, { status: 400 })
    }

    if (!session.guestId || session.guestId !== guestId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para acceder a este invitado.' },
        { status: 403 }
      )
    }

    const suggestions = await prisma.spotifySuggestion.findMany({
      where: {
        OR: [
          { guestId },
          { voterIds: { has: guestId } }
        ]
      },
      orderBy: { suggestedAt: 'desc' }
    })

    return NextResponse.json({ success: true, suggestions })
  } catch (error) {
    console.error('Error fetching Spotify suggestions:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = parseGuestSession(request)
    if (!session.isValid) {
      return NextResponse.json(
        { success: false, error: 'Sesión no válida. Vuelve a introducir el código.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { guestId, trackId, trackName, artistName, releaseYear } = body

    if (!guestId) {
      return NextResponse.json({ success: false, error: 'guestId es requerido.' }, { status: 400 })
    }

    // BOLA check: Ensure session.guestId matches the guestId requesting the suggestion
    if (!session.guestId || session.guestId !== guestId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para acceder a este invitado.' },
        { status: 403 }
      )
    }

    if (!trackId || !trackName || !artistName) {
      return NextResponse.json({ success: false, error: 'trackId, trackName y artistName son requeridos.' }, { status: 400 })
    }

    let formattedReleaseYear: string | null = null
    if (releaseYear) {
      const yearStr = String(releaseYear).trim().slice(0, 4)
      if (/^\d{4}$/.test(yearStr)) {
        formattedReleaseYear = yearStr
      }
    }

    // Verificar que el invitado exista
    const guest = await prisma.guest.findUnique({
      where: { id: guestId }
    })

    if (!guest) {
      return NextResponse.json({ success: false, error: 'Invitado no encontrado.' }, { status: 404 })
    }

    // Verificar si la canción ya fue sugerida
    const existing = await prisma.spotifySuggestion.findFirst({
      where: { trackId }
    })

    if (existing) {
      return await registerVote(existing, guestId, formattedReleaseYear)
    }

    // Verificar el límite de canciones por invitado y crear la sugerencia de forma atómica
    // para evitar condiciones de carrera con peticiones concurrentes.
    try {
      const suggestion = await prisma.$transaction(async (tx) => {
        const count = await tx.spotifySuggestion.count({
          where: { guestId }
        })

        if (count >= MAX_SUGGESTIONS_PER_GUEST) {
          throw new Error('SUGGESTION_LIMIT_REACHED')
        }

        return tx.spotifySuggestion.create({
          data: {
            guestId,
            trackId,
            trackName,
            artistName,
            releaseYear: formattedReleaseYear,
            status: 'PENDING',
            votes: 1,
            voterIds: [guestId]
          }
        })
      })

      return NextResponse.json({
        success: true,
        message: 'Canción sugerida correctamente.',
        suggestion
      })
    } catch (createError: any) {
      // Carrera: otra petición creó la misma canción entre el findFirst y el
      // create. trackId es @unique, así que Prisma lanza P2002 → tratar como voto.
      if (createError?.code === 'P2002') {
        const nowExisting = await prisma.spotifySuggestion.findUnique({ where: { trackId } })
        if (nowExisting) {
          return await registerVote(nowExisting, guestId, formattedReleaseYear)
        }
      }
      throw createError
    }
  } catch (error: any) {
    if (error instanceof Error && error.message === 'SUGGESTION_LIMIT_REACHED') {
      return NextResponse.json({
        success: false,
        error: `Has alcanzado el límite de ${MAX_SUGGESTIONS_PER_GUEST} canciones sugeridas para tu invitación.`
      }, { status: 400 })
    }
    console.error('Error in Spotify suggest route:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 })
  }
}

/**
 * Registra el voto de un invitado sobre una sugerencia existente. Cada invitado
 * cuenta como máximo un voto (rastreado en voterIds), evitando el inflado
 * ilimitado de votos. No cuenta contra el límite de 8 canciones propias.
 */
async function registerVote(
  existing: { id: string; voterIds: string[]; releaseYear?: string | null },
  guestId: string,
  incomingReleaseYear?: string | null
) {
  if (existing.voterIds.includes(guestId)) {
    return NextResponse.json({
      success: true,
      message: 'Ya votaste esta canción anteriormente.',
      suggestion: existing
    })
  }

  const dataToUpdate: any = {
    votes: { increment: 1 },
    voterIds: { push: guestId }
  }

  if (!existing.releaseYear && incomingReleaseYear) {
    dataToUpdate.releaseYear = incomingReleaseYear
  }

  const updated = await prisma.spotifySuggestion.update({
    where: { id: existing.id },
    data: dataToUpdate
  })

  return NextResponse.json({
    success: true,
    message: 'Esta canción ya estaba sugerida. ¡Se ha sumado tu voto!',
    suggestion: updated
  })
}
