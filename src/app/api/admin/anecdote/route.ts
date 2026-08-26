import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkAdmin } from '@/lib/auth'

// GET /api/admin/anecdote: Fetch all anecdotes (both approved and unapproved)
export async function GET(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const anecdotes = await prisma.anecdote.findMany({
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
    console.error('Error fetching anecdotes for admin:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}

// POST /api/admin/anecdote: Toggle approval status of an anecdote
export async function POST(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const body = await request.json()
    const { id, approved } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'El ID de la anécdota es requerido.' },
        { status: 400 }
      )
    }

    if (typeof approved !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'El estado de aprobación debe ser un booleano.' },
        { status: 400 }
      )
    }

    const existingAnecdote = await prisma.anecdote.findUnique({
      where: { id },
    })

    if (!existingAnecdote) {
      return NextResponse.json(
        { success: false, error: 'Anécdota no encontrada.' },
        { status: 404 }
      )
    }

    const updatedAnecdote = await prisma.anecdote.update({
      where: { id },
      data: { approved },
    })

    return NextResponse.json({ success: true, anecdote: updatedAnecdote })
  } catch (error) {
    console.error('Error updating anecdote approval:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/anecdote: Delete an anecdote
export async function DELETE(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    // Try query param first, then body
    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')

    if (!id) {
      try {
        const body = await request.json()
        id = body.id
      } catch {
        // Body reading failed
      }
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'El ID de la anécdota es requerido.' },
        { status: 400 }
      )
    }

    const existingAnecdote = await prisma.anecdote.findUnique({
      where: { id },
    })

    if (!existingAnecdote) {
      return NextResponse.json(
        { success: false, error: 'Anécdota no encontrada.' },
        { status: 404 }
      )
    }

    await prisma.anecdote.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting anecdote:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
