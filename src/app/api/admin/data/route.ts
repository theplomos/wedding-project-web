import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkAdmin } from '@/lib/auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    // 1. Obtener todos los invitados con sus RSVPs asociados.
    // Proyección explícita: el dashboard no usa el teléfono (la gestión de
    // teléfonos vive en la pestaña de recordatorios, con su propio endpoint),
    // así que no lo incluimos aquí para no volcar esa PII a todos los admins.
    const guests = await prisma.guest.findMany({
      select: {
        id: true,
        partyName: true,
        partySizeMax: true,
        status: true,
        notPreloaded: true,
        rsvps: {
          select: {
            attending: true,
            numAdults: true,
            numKids: true,
            kidsNames: true,
            dietary: true,
            dietaryNotes: true,
            contribution: true,
          },
        },
      },
      orderBy: {
        partyName: 'asc'
      }
    })

    // 2. Calcular estadísticas de confirmación
    const totalGuests = guests.length
    const respondedGuests = guests.filter(g => g.status === 'RESPONDED').length
    const pendingGuests = totalGuests - respondedGuests

    let totalAdultsAttending = 0
    let totalKidsAttending = 0
    const dietaryCounts = {
      OMNIVORO: 0,
      VEGETARIANO: 0,
      VEGANO: 0,
      OTRO: 0
    }

    const rsvps = guests.flatMap(g => g.rsvps)
    rsvps.forEach(rsvp => {
      if (rsvp.attending) {
        totalAdultsAttending += rsvp.numAdults
        totalKidsAttending += rsvp.numKids
        
        if (rsvp.dietary in dietaryCounts) {
          dietaryCounts[rsvp.dietary as keyof typeof dietaryCounts]++
        }
      }
    })

    return NextResponse.json({
      success: true,
      stats: {
        totalGuests,
        respondedGuests,
        pendingGuests,
        totalAdultsAttending,
        totalKidsAttending,
        dietaryCounts
      },
      guests
    })
  } catch (error) {
    console.error('Error fetching admin data:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
