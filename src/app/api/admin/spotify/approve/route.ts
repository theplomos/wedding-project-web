import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { addTrackToPlaylist } from '@/lib/spotify'
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

    if (suggestion.status === 'APPROVED') {
      return NextResponse.json({ success: true, message: 'La canción ya ha sido aprobada.' })
    }

    // Agregar canción a la playlist real de Spotify
    await addTrackToPlaylist(suggestion.trackId)

    // Actualizar base de datos
    const updated = await prisma.spotifySuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Canción aprobada y añadida a la playlist de Spotify.',
      suggestion: updated
    })
  } catch (error: any) {
    console.error('Error in Spotify approve route:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 })
  }
}
