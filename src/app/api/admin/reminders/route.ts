import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkAdmin } from '@/lib/auth'
import { renderReminder, waLink, WAVES, type Wave, type ReminderLang } from '@/lib/reminder-content'

function isWave(v: string | null): v is Wave {
  return v !== null && (WAVES as string[]).includes(v)
}

export async function GET(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const wave = searchParams.get('wave')
    if (!isWave(wave)) {
      return NextResponse.json(
        { success: false, error: 'Parámetro wave inválido (week|day|morning).' },
        { status: 400 }
      )
    }

    // Proyección explícita: solo cargamos lo que el recordatorio necesita
    // (attending + phone + language del RSVP, y el nombre/apodo del invitado).
    // Así dietaryNotes/kidsNames/contribution nunca entran en memoria aquí.
    const guests = await prisma.guest.findMany({
      select: {
        id: true,
        partyName: true,
        nickname: true,
        rsvps: {
          select: { attending: true, phone: true, language: true },
        },
      },
      orderBy: { partyName: 'asc' },
    })
    const logs = await prisma.reminderLog.findMany({ where: { wave } })
    const sentSet = new Set(logs.map((l) => l.guestId))

    const recipients = guests
      .map((g) => ({ g, rsvp: g.rsvps[0] }))
      .filter((x) => x.rsvp && x.rsvp.attending)
      .map((x) => {
        const language = ((x.rsvp!.language as ReminderLang) || 'es')
        const phone = x.rsvp!.phone || null
        const hasPhone = !!phone
        const message = renderReminder(wave, {
          partyName: x.g.partyName,
          nickname: x.g.nickname,
          language,
        })
        return {
          guestId: x.g.id,
          partyName: x.g.partyName,
          nickname: x.g.nickname || null,
          phone,
          language,
          hasPhone,
          message,
          waLink: hasPhone ? waLink(phone!, message) : null,
          sent: sentSet.has(x.g.id),
        }
      })

    return NextResponse.json({ success: true, wave, recipients })
  } catch (error) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const denied = checkAdmin(request)
    if (denied) return denied

    const { guestId, wave, sent } = await request.json()
    if (typeof guestId !== 'string' || !guestId || !isWave(wave) || typeof sent !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'guestId, wave (week|day|morning) y sent (booleano) son obligatorios.' },
        { status: 400 }
      )
    }

    if (!sent) {
      await prisma.reminderLog.deleteMany({ where: { guestId, wave } })
    } else {
      await prisma.reminderLog.upsert({
        where: { guestId_wave: { guestId, wave } },
        update: { sentAt: new Date() },
        create: { guestId, wave },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking reminder:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
