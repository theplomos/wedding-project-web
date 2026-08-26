import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseGuestSession } from '@/lib/auth'

// GET /api/anecdote: Fetch all approved anecdotes
export async function GET(request: Request) {
  try {
    const session = parseGuestSession(request)
    if (!session.isValid) {
      return NextResponse.json(
        { success: false, error: 'Sesión no válida. Vuelve a introducir el código.' },
        { status: 401 }
      )
    }
    const anecdotes = await prisma.anecdote.findMany({
      where: {
        approved: true,
      },
      include: {
        guest: {
          select: {
            partyName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ success: true, anecdotes })
  } catch (error) {
    console.error('Error fetching approved anecdotes:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener las anécdotas.' },
      { status: 500 }
    )
  }
}

// POST /api/anecdote: Submit a new anecdote
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
    const { guestId, text } = body

    // BOLA check: If they are linking the anecdote to a guest ID, it must match their session guest ID
    if (guestId && (!session.guestId || session.guestId !== guestId)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para este invitado.' },
        { status: 403 }
      )
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'El texto de la anécdota es requerido.' },
        { status: 400 }
      )
    }

    if (text.trim().length > 2000) {
      return NextResponse.json(
        { success: false, error: 'La anécdota no puede superar los 2000 caracteres.' },
        { status: 400 }
      )
    }

    if (guestId) {
      const guestExists = await prisma.guest.findUnique({
        where: { id: guestId },
      })
      if (!guestExists) {
        return NextResponse.json(
          { success: false, error: 'Invitado no encontrado.' },
          { status: 404 }
        )
      }
    }

    const anecdote = await prisma.anecdote.create({
      data: {
        guestId: guestId || null,
        text: text.trim(),
        approved: false, // requires admin moderation
      },
    })

    return NextResponse.json({ success: true, anecdote })
  } catch (error) {
    console.error('Error submitting anecdote:', error)
    return NextResponse.json(
      { success: false, error: 'Error al enviar la anécdota.' },
      { status: 500 }
    )
  }
}
