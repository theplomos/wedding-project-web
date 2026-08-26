import { describe, it, expect } from 'vitest'
import { renderReminder, getGreetingName, waLink, WAVES, WAVE_SCHEDULE, MAPS_CEREMONY, MAPS_BANQUET } from '../reminder-content'

describe('WAVES', () => {
  it('1. contains exactly three waves with correct identifiers and in the right order', () => {
    expect(WAVES).toHaveLength(3)
    expect(WAVES).toEqual(['week', 'day', 'morning'])
  })
})

describe('WAVE_SCHEDULE', () => {
  it('2. maps each wave to the correct scheduled date and Europe/Berlin timezone', () => {
    expect(WAVE_SCHEDULE.week).toBe('11 sep 2026 · 10:00 (Europe/Berlin)')
    expect(WAVE_SCHEDULE.day).toBe('17 sep 2026 · 10:00 (Europe/Berlin)')
    expect(WAVE_SCHEDULE.morning).toBe('18 sep 2026 · 08:00 (Europe/Berlin)')
  })
})

describe('renderReminder - es', () => {
  const partyName = 'Familia García'
  const lang = 'es'

  it('3. renders Spanish week wave correctly', () => {
    const msg = renderReminder('week', { partyName, language: lang })
    expect(msg).toContain('¡Hola Familia!')
    expect(msg).toContain('Falta una semana para nuestra boda 🎉')
    expect(msg).toContain('📅 18 de septiembre: • 16:30 — Recepción, Konzerthaus Freiburg')
    expect(msg).toContain('👗 Dress code: Summer Party (¡ven con tu ropa favorita!).')
    expect(msg).toContain(MAPS_BANQUET)
    expect(msg).toContain('Con cariño, Francisco & Alicia 💍')
  })

  it('4. renders Spanish day wave correctly', () => {
    const msg = renderReminder('day', { partyName, language: lang })
    expect(msg).toContain('¡Hola Familia!')
    expect(msg).toContain('¡Mañana es el gran día! 🎉')
  })

  it('5. renders Spanish morning wave correctly', () => {
    const msg = renderReminder('morning', { partyName, language: lang })
    expect(msg).toContain('¡Hola Familia!')
    expect(msg).toContain('¡Hoy nos casamos! 🥳 Te esperamos.')
  })
})

describe('renderReminder - de', () => {
  const partyName = 'Familia Müller'
  const lang = 'de'

  it('6. renders German week wave correctly', () => {
    const msg = renderReminder('week', { partyName, language: lang })
    expect(msg).toContain('Hallo Familia!')
    expect(msg).toContain('Nur noch eine Woche bis zu unserer Hochzeit 🎉')
    expect(msg).toContain('📅 18. September: • 16:30 — Empfang, Konzerthaus Freiburg')
    expect(msg).toContain('👗 Dresscode: Summer Party (kommt in eurer Lieblingskleidung!).')
    expect(msg).toContain(MAPS_BANQUET)
    expect(msg).toContain('Herzlichst, Francisco & Alicia 💍')
  })

  it('7. renders German day wave correctly', () => {
    const msg = renderReminder('day', { partyName, language: lang })
    expect(msg).toContain('Hallo Familia!')
    expect(msg).toContain('Morgen ist der große Tag! 🎉')
  })

  it('8. renders German morning wave correctly', () => {
    const msg = renderReminder('morning', { partyName, language: lang })
    expect(msg).toContain('Hallo Familia!')
    expect(msg).toContain('Heute heiraten wir! 🥳 Wir freuen uns auf dich.')
  })
})

describe('renderReminder - pt', () => {
  const partyName = 'Familia Silva'
  const lang = 'pt'

  it('9. renders Portuguese week wave correctly', () => {
    const msg = renderReminder('week', { partyName, language: lang })
    expect(msg).toContain('Olá Familia!')
    expect(msg).toContain('Falta uma semana para o nosso casamento 🎉')
    expect(msg).toContain('📅 18 de setembro: • 16:30 — Recepção, Konzerthaus Freiburg')
    expect(msg).toContain('👗 Dress code: Summer Party (vem com as tuas roupas favoritas!).')
    expect(msg).toContain(MAPS_BANQUET)
    expect(msg).toContain('Com carinho, Francisco & Alicia 💍')
  })

  it('10. renders Portuguese day wave correctly', () => {
    const msg = renderReminder('day', { partyName, language: lang })
    expect(msg).toContain('Olá Familia!')
    expect(msg).toContain('Amanhã é o grande dia! 🎉')
  })

  it('11. renders Portuguese morning wave correctly', () => {
    const msg = renderReminder('morning', { partyName, language: lang })
    expect(msg).toContain('Olá Familia!')
    expect(msg).toContain('Hoje nos casamos! 🥳 Esperamos por ti.')
  })
})

describe('renderReminder - en', () => {
  const partyName = 'Family Smith'
  const lang = 'en'

  it('12. renders English week wave correctly', () => {
    const msg = renderReminder('week', { partyName, language: lang })
    expect(msg).toContain('Hi Family!')
    expect(msg).toContain('One week to go until our wedding 🎉')
    expect(msg).toContain('📅 September 18th: • 4:30 PM — Reception, Konzerthaus Freiburg')
    expect(msg).toContain('👗 Dress code: Summer Party (wear your favorite clothes!).')
    expect(msg).toContain(MAPS_BANQUET)
    expect(msg).toContain('With love, Francisco & Alicia 💍')
  })

  it('13. renders English day wave correctly', () => {
    const msg = renderReminder('day', { partyName, language: lang })
    expect(msg).toContain('Hi Family!')
    expect(msg).toContain('Tomorrow is the big day! 🎉')
  })

  it('14. renders English morning wave correctly', () => {
    const msg = renderReminder('morning', { partyName, language: lang })
    expect(msg).toContain('Hi Family!')
    expect(msg).toContain("Today we're getting married! 🥳 See you there.")
  })
})

describe('renderReminder - Fallback & Edge Cases', () => {
  it("15. falls back to Spanish ('es') when language is unsupported or empty", () => {
    // Unsupported language 'fr'
    const msgFr = renderReminder('week', { partyName: 'Jean', language: 'fr' as any })
    expect(msgFr).toContain('¡Hola Jean!')
    expect(msgFr).toContain('Falta una semana para nuestra boda 🎉')
    expect(msgFr).toContain('Con cariño, Francisco & Alicia 💍')

    // Empty language
    const msgEmpty = renderReminder('day', { partyName: 'Jean', language: '' as any })
    expect(msgEmpty).toContain('¡Hola Jean!')
    expect(msgEmpty).toContain('¡Mañana es el gran día! 🎉')
  })

  it('16. handles empty string and whitespace partyNames', () => {
    const msgEmpty = renderReminder('morning', { partyName: '', language: 'es' })
    expect(msgEmpty).toContain('¡Hola !') // Check greeting is "¡Hola !"
    expect(msgEmpty).toContain('¡Hoy nos casamos!')

    const msgSpace = renderReminder('morning', { partyName: '   ', language: 'es' })
    expect(msgSpace).toContain('¡Hola !')
  })

  it('17. handles special characters in partyNames and preserves them correctly', () => {
    const specialNames = [
      'José & María / Ana-Luisa',
      '🌈 Emojis & Symbols 💖',
      'Dr. Hans-Jürgen Müller-Lüdenscheidt',
      'O\'Connor, L\'Hôpital & Nuñez'
    ]

    for (const name of specialNames) {
      const msg = renderReminder('week', { partyName: name, language: 'en' })
      const expectedGreetingName = getGreetingName(name)
      expect(msg).toContain(`Hi ${expectedGreetingName}!`)
    }
  })
})

describe('getGreetingName', () => {
  it('uses nickname when provided and non-empty', () => {
    expect(getGreetingName('Francisco Barrientos', 'Pancho')).toBe('Pancho')
  })

  it('trims nickname whitespace', () => {
    expect(getGreetingName('Francisco Barrientos', '  Pancho  ')).toBe('Pancho')
  })

  it('falls back to first name when nickname is null', () => {
    expect(getGreetingName('Francisco Barrientos', null)).toBe('Francisco')
  })

  it('falls back to first name when nickname is undefined', () => {
    expect(getGreetingName('Francisco Barrientos')).toBe('Francisco')
  })

  it('falls back to first name when nickname is empty string or spaces', () => {
    expect(getGreetingName('Francisco Barrientos', '')).toBe('Francisco')
    expect(getGreetingName('Francisco Barrientos', '   ')).toBe('Francisco')
  })

  it('handles single word partyName correctly without nickname', () => {
    expect(getGreetingName('Marianne', null)).toBe('Marianne')
  })

  it('strips trailing punctuation from first name fallback', () => {
    expect(getGreetingName('O\'Connor, L\'Hôpital', null)).toBe('O\'Connor')
  })
})

describe('renderReminder with nickname', () => {
  it('uses nickname in greeting line when provided', () => {
    const text = renderReminder('week', { partyName: 'Francisco Barrientos', nickname: 'Pancho', language: 'es' })
    expect(text).toContain('¡Hola Pancho!')
  })

  it('uses first name in greeting line when nickname is null', () => {
    const text = renderReminder('week', { partyName: 'Francisco Barrientos', nickname: null, language: 'es' })
    expect(text).toContain('¡Hola Francisco!')
  })
})

describe('waLink', () => {
  it('18. encodes spaces, special characters, and emojis correctly for WhatsApp URL structure', () => {
    const baseMessage = '¡Hola! ¿Cómo estás? 🚀 Nos vemos pronto a las 13:00.'
    const link = waLink('+34612345678', baseMessage)

    // Verify phone number cleaning via waNumber inside waLink (strips +)
    expect(link).toContain('https://api.whatsapp.com/send?phone=34612345678')

    // Verify correct URL percent encoding of the query parameters
    const expectedEncodedText = encodeURIComponent(baseMessage)
    expect(link).toBe(`https://api.whatsapp.com/send?phone=34612345678&text=${expectedEncodedText}`)

    // Specifically verify some encoded characters:
    // ' ' -> %20
    // '¿' -> %C2%BF
    // '🚀' -> %F0%9F%9A%80
    expect(link).toContain('%20')
    expect(link).toContain('%C2%BF')
    expect(link).toContain('%F0%9F%9A%80')
  })

  it('19. handles multiple spaces, newlines, and trailing special symbols', () => {
    const complexMsg = 'Line 1\nLine 2\n\nDress Code: Summer Party! ✨💍'
    const link = waLink('+4917612345678', complexMsg)

    expect(link).toContain('https://api.whatsapp.com/send?phone=4917612345678')
    expect(link).toContain(encodeURIComponent(complexMsg))
  })
})
