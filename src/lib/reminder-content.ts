import { waNumber } from './phone'

export type Wave = 'week' | 'day' | 'morning'
export type ReminderLang = 'es' | 'de' | 'pt' | 'en'

export const WAVES: Wave[] = ['week', 'day', 'morning']

// Etiquetas informativas (Europe/Berlin). El envío es manual.
export const WAVE_SCHEDULE: Record<Wave, string> = {
  week: '11 sep 2026 · 10:00 (Europe/Berlin)',
  day: '17 sep 2026 · 10:00 (Europe/Berlin)',
  morning: '18 sep 2026 · 08:00 (Europe/Berlin)',
}

export const MAPS_CEREMONY = 'https://maps.google.com/?q=Freiburger+Munster'
export const MAPS_BANQUET = 'https://maps.google.com/?q=Konzerthaus+Freiburg'

const INTRO: Record<ReminderLang, Record<Wave, string>> = {
  es: {
    week: 'Falta una semana para nuestra boda 🎉',
    day: '¡Mañana es el gran día! 🎉',
    morning: '¡Hoy nos casamos! 🥳 Te esperamos.',
  },
  de: {
    week: 'Nur noch eine Woche bis zu unserer Hochzeit 🎉',
    day: 'Morgen ist der große Tag! 🎉',
    morning: 'Heute heiraten wir! 🥳 Wir freuen uns auf dich.',
  },
  pt: {
    week: 'Falta uma semana para o nosso casamento 🎉',
    day: 'Amanhã é o grande dia! 🎉',
    morning: 'Hoje nos casamos! 🥳 Esperamos por ti.',
  },
  en: {
    week: 'One week to go until our wedding 🎉',
    day: 'Tomorrow is the big day! 🎉',
    morning: "Today we're getting married! 🥳 See you there.",
  },
}

const BODY: Record<ReminderLang, { itinerary: string; dress: string; how: string; sign: string }> = {
  es: {
    itinerary: '📅 18 de septiembre: • 16:30 — Recepción, Konzerthaus Freiburg',
    dress: '👗 Dress code: Summer Party (¡ven con tu ropa favorita!).',
    how: `📍 Recepción — Konzerthaus Freiburg: ${MAPS_BANQUET}\nKonrad-Adenauer-Platz 1, 79098 Freiburg im Breisgau`,
    sign: 'Con cariño, Francisco & Alicia 💍',
  },
  de: {
    itinerary: '📅 18. September: • 16:30 — Empfang, Konzerthaus Freiburg',
    dress: '👗 Dresscode: Summer Party (kommt in eurer Lieblingskleidung!).',
    how: `📍 Empfang — Konzerthaus Freiburg: ${MAPS_BANQUET}\nKonrad-Adenauer-Platz 1, 79098 Freiburg im Breisgau`,
    sign: 'Herzlichst, Francisco & Alicia 💍',
  },
  pt: {
    itinerary: '📅 18 de setembro: • 16:30 — Recepção, Konzerthaus Freiburg',
    dress: '👗 Dress code: Summer Party (vem com as tuas roupas favoritas!).',
    how: `📍 Recepção — Konzerthaus Freiburg: ${MAPS_BANQUET}\nKonrad-Adenauer-Platz 1, 79098 Freiburg im Breisgau`,
    sign: 'Com carinho, Francisco & Alicia 💍',
  },
  en: {
    itinerary: '📅 September 18th: • 4:30 PM — Reception, Konzerthaus Freiburg',
    dress: '👗 Dress code: Summer Party (wear your favorite clothes!).',
    how: `📍 Reception — Konzerthaus Freiburg: ${MAPS_BANQUET}\nKonrad-Adenauer-Platz 1, 79098 Freiburg im Breisgau`,
    sign: 'With love, Francisco & Alicia 💍',
  },
}

const GREETING: Record<ReminderLang, (name: string) => string> = {
  es: (n) => `¡Hola ${n}!`,
  de: (n) => `Hallo ${n}!`,
  pt: (n) => `Olá ${n}!`,
  en: (n) => `Hi ${n}!`,
}

/**
 * Resolves the name to use in reminder greetings.
 * Uses nickname if present, otherwise falls back to the first name of partyName.
 */
export function getGreetingName(partyName: string, nickname?: string | null): string {
  if (nickname && nickname.trim().length > 0) {
    return nickname.trim()
  }
  const cleanParty = partyName ? partyName.trim() : ''
  if (!cleanParty) return ''
  return cleanParty.split(/\s+/)[0].replace(/[.,:;!?]+$/, '')
}

export function renderReminder(
  wave: Wave,
  opts: { partyName: string; nickname?: string | null; language: ReminderLang }
): string {
  const lang: ReminderLang = (['es', 'de', 'pt', 'en'] as const).includes(opts.language)
    ? opts.language
    : 'es'
  const greetingName = getGreetingName(opts.partyName, opts.nickname)
  const b = BODY[lang]
  return [
    `${GREETING[lang](greetingName)} ${INTRO[lang][wave]}`,
    b.itinerary,
    b.dress,
    b.how,
    b.sign,
  ].join('\n')
}

export function waLink(e164: string, message: string): string {
  return `https://api.whatsapp.com/send?phone=${waNumber(e164)}&text=${encodeURIComponent(message)}`
}
