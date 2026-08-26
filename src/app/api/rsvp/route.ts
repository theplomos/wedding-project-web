import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { normalizeName } from '@/lib/normalize-name'
import { parseGuestSession, GUEST_SESSION_COOKIE, signGuestSession } from '@/lib/auth'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

const VALID_DIETARY_PREFERENCES = ['OMNIVORO', 'VEGETARIANO', 'VEGANO', 'OTRO']
const VALID_LANGUAGES = ['es', 'de', 'pt', 'en']


// GET: Fetch existing RSVP for a guest
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
      return NextResponse.json(
        { success: false, error: 'guestId es requerido.' },
        { status: 400 }
      )
    }

    // BOLA check: leer un RSVP requiere una sesión específica de invitado que
    // sea dueña de este guestId. Una sesión solo-passcode (sin guestId) no puede
    // consultar el RSVP de un invitado arbitrario.
    if (!session.guestId || session.guestId !== guestId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para acceder a este invitado.' },
        { status: 403 }
      )
    }

    const rsvp = await prisma.rSVP.findFirst({
      where: { guestId }
    })

    // No exponer el teléfono al cliente (PII). Solo indicar si existe uno guardado.
    if (!rsvp) {
      return NextResponse.json({ success: true, rsvp: null })
    }
    const { phone: storedPhone, ...rsvpWithoutPhone } = rsvp
    return NextResponse.json({
      success: true,
      rsvp: { ...rsvpWithoutPhone, hasPhone: !!storedPhone }
    })
  } catch (error) {
    console.error('Error fetching RSVP:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener confirmación.' },
      { status: 500 }
    )
  }
}

// POST: Create or update RSVP
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
    const {
      guestId,
      partyName, // solo si es un invitado nuevo no precargado
      attending,
      numAdults: numAdultsRaw,
      numKids: numKidsRaw,
      kidsNames,
      dietary,
      dietaryNotes,
      contribution,
      phone,
      language
    } = body

    // BOLA check: si la petición apunta a un guestId existente, la sesión debe
    // ser dueña de ese guestId. El alta de un invitado nuevo no precargado
    // (sin guestId, con partyName) sí se permite con una sesión solo-passcode.
    if (guestId && session.guestId !== guestId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para acceder a este invitado.' },
        { status: 403 }
      )
    }

    if (typeof attending !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'attending debe ser un valor booleano.' },
        { status: 400 }
      )
    }

    const numAdults = Number(numAdultsRaw)
    const numKids = Number(numKidsRaw)

    if (!Number.isInteger(numAdults) || numAdults < 0 || numAdults > 50) {
      return NextResponse.json(
        { success: false, error: 'numAdults debe ser un número entero entre 0 y 50.' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(numKids) || numKids < 0 || numKids > 50) {
      return NextResponse.json(
        { success: false, error: 'numKids debe ser un número entero entre 0 y 50.' },
        { status: 400 }
      )
    }

    if (!dietary || !VALID_DIETARY_PREFERENCES.includes(dietary)) {
      return NextResponse.json(
        { success: false, error: 'Preferencia alimenticia inválida.' },
        { status: 400 }
      )
    }

    if (kidsNames && typeof kidsNames === 'string' && kidsNames.length > 500) {
      return NextResponse.json(
        { success: false, error: 'kidsNames no puede superar los 500 caracteres.' },
        { status: 400 }
      )
    }

    if (dietaryNotes && typeof dietaryNotes === 'string' && dietaryNotes.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Las notas de dieta no pueden superar los 500 caracteres.' },
        { status: 400 }
      )
    }

    if (contribution && typeof contribution === 'string' && contribution.length > 500) {
      return NextResponse.json(
        { success: false, error: 'La contribución no puede superar los 500 caracteres.' },
        { status: 400 }
      )
    }

    // Teléfono: validar el formato si se envía uno (fail-fast, antes de tocar la DB).
    // La regla "obligatorio" se resuelve más abajo, tras buscar el RSVP existente,
    // para poder conservar el número guardado en una edición sin re-escribirlo.
    const phoneProvided = typeof phone === 'string' && phone.trim().length > 0
    let providedPhoneE164: string | null = null
    if (attending && phoneProvided) {
      const parsed = parsePhoneNumberFromString(phone.trim())
      if (!parsed || !parsed.isValid()) {
        return NextResponse.json(
          { success: false, error: 'Teléfono válido en formato internacional (ej. +49...).' },
          { status: 400 }
        )
      }
      providedPhoneE164 = parsed.number
    }
    // Invitado nuevo que asiste: el teléfono es obligatorio (no hay uno guardado).
    if (attending && !phoneProvided && !guestId && partyName) {
      return NextResponse.json(
        { success: false, error: 'Teléfono obligatorio para confirmar asistencia.' },
        { status: 400 }
      )
    }

    const finalLanguage = VALID_LANGUAGES.includes(language) ? language : 'es'

    let finalGuestId = guestId
    let isNewGuest = false

    // Si no hay guestId y el nombre es provisto, significa que es un invitado no precargado
    if (!finalGuestId && partyName) {
      isNewGuest = true
      const searchableName = normalizeName(partyName)
      const id = searchableName.replace(/\s+/g, '-') + '-new'

      const partySize = numAdults + numKids
      const partySizeMax = Number.isInteger(partySize) && partySize > 0 ? partySize : 2

      const newGuest = await prisma.guest.create({
        data: {
          id,
          partyName,
          searchableName,
          partySizeMax,
          notPreloaded: true,
          status: 'RESPONDED'
        }
      })
      finalGuestId = newGuest.id
    }

    if (!finalGuestId) {
      return NextResponse.json(
        { success: false, error: 'guestId o partyName es requerido.' },
        { status: 400 }
      )
    }

    // 1. Upsert del RSVP
    const existingRsvp = await prisma.rSVP.findFirst({
      where: { guestId: finalGuestId }
    })

    // Resolver el teléfono final: usar el nuevo si se envió; si no, conservar el
    // guardado. Si asiste y no hay ninguno (ni enviado ni guardado), es obligatorio.
    let phoneE164: string | null = existingRsvp?.phone ?? null
    if (attending) {
      if (providedPhoneE164) {
        phoneE164 = providedPhoneE164
      } else if (!phoneE164) {
        return NextResponse.json(
          { success: false, error: 'Teléfono obligatorio para confirmar asistencia.' },
          { status: 400 }
        )
      }
    }

    let rsvp
    if (existingRsvp) {
      rsvp = await prisma.rSVP.update({
        where: { id: existingRsvp.id },
        data: {
          attending,
          numAdults,
          numKids,
          kidsNames,
          dietary,
          dietaryNotes,
          contribution,
          phone: phoneE164,
          language: finalLanguage,
          submittedAt: new Date()
        }
      })
    } else {
      rsvp = await prisma.rSVP.create({
        data: {
          guestId: finalGuestId,
          attending,
          numAdults,
          numKids,
          kidsNames,
          dietary,
          dietaryNotes,
          contribution,
          phone: phoneE164,
          language: finalLanguage
        }
      })
    }

    // 2. Marcar al invitado como Respondido
    await prisma.guest.update({
      where: { id: finalGuestId },
      data: { status: 'RESPONDED' }
    })

    // No exponer el teléfono al cliente (PII). El GET tampoco lo devuelve.
    const { phone: _phone, ...rsvpWithoutPhone } = rsvp
    const response = NextResponse.json({ success: true, rsvp: rsvpWithoutPhone })
    if (finalGuestId) {
      // Set or upgrade the guest-specific cookie
      response.cookies.set(GUEST_SESSION_COOKIE, signGuestSession(finalGuestId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      })
    }
    return response
  } catch (error) {
    console.error('Error submitting RSVP:', error)
    return NextResponse.json(
      { success: false, error: 'Error al enviar confirmación.' },
      { status: 500 }
    )
  }
}
