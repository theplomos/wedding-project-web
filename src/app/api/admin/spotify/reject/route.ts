import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkAdmin } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const { suggestionId } = await request.json()

    if (!suggestionId) {
      return NextResponse.json({ success: false, error: 'suggestionId es requerido.' }, { status: 400 })
    }

    const suggestion = await prisma.spotifySuggestion.findUnique({
      where: { id: suggestionId }
    })

    if (!suggestion) {
      return NextResponse.json({ success: false, error: 'Sugerencia no encontrada.' }, { status: 404 })
    }

    // Actualizar base de datos
    const updated = await prisma.spotifySuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'REJECTED'
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Canción rechazada correctamente.',
      suggestion: updated
    })
  } catch (error: any) {
    console.error('Error in Spotify reject route:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 })
  }
}
