import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkAdmin } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const suggestions = await prisma.spotifySuggestion.findMany({
      include: {
        guest: {
          select: {
            partyName: true
          }
        }
      },
      orderBy: [
        { votes: 'desc' },
        { suggestedAt: 'desc' }
      ]
    })

    return NextResponse.json({ success: true, suggestions })
  } catch (error: any) {
    console.error('Error in GET suggestions route:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 })
  }
}
