'use client'

import { useState, useEffect, useRef } from 'react'
import { translations, Language, languages } from '../lib/translations'
import { fase2Translations } from '../lib/fase2-translations'
import { normalizePhone, LANG_DEFAULT_COUNTRY } from '@/lib/phone'
import type { CountryCode } from 'libphonenumber-js'

interface Guest {
  id: string
  partyName: string
  partySizeMax: number
  status: string
  notPreloaded: boolean
  similarityScore?: number
}

interface RSVP {
  id?: string
  attending: boolean
  numAdults: number
  numKids: number
  kidsNames?: string
  dietary: 'OMNIVORO' | 'VEGETARIANO' | 'VEGANO' | 'OTRO'
  dietaryNotes?: string
  contribution?: string
}

export default function Home() {
  // Multi-language state
  const [lang, setLang] = useState<Language>('es')
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false)
  const langDropdownRef = useRef<HTMLDivElement>(null)

  // Passcode verification
  const [passcode, setPasscode] = useState('')
  const [isPasscodeValid, setIsPasscodeValid] = useState<boolean | null>(null)
  const [passcodeError, setPasscodeError] = useState('')
  const [isCheckingPasscode, setIsCheckingPasscode] = useState(false)

  // RSVP flow state
  const [step, setStep] = useState<'landing' | 'match' | 'confirm' | 'form' | 'success'>('landing')
  const [guestName, setGuestName] = useState('')
  const [matchedGuest, setMatchedGuest] = useState<Guest | null>(null)
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // RSVP form fields
  const [attending, setAttending] = useState(true)
  const [numAdults, setNumAdults] = useState(1)
  const [numKids, setNumKids] = useState(0)
  const [kidsNames, setKidsNames] = useState('')
  const [dietary, setDietary] = useState<'OMNIVORO' | 'VEGETARIANO' | 'VEGANO' | 'OTRO'>('OMNIVORO')
  const [dietaryNotes, setDietaryNotes] = useState('')
  const [contribution, setContribution] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('DE')
  const [hasStoredPhone, setHasStoredPhone] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Phase 2 state
  const [experienceTab, setExperienceTab] = useState<'spotify' | 'drive' | 'anecdotes'>('spotify')
  const [spotifyQuery, setSpotifyQuery] = useState('')
  const [spotifyResults, setSpotifyResults] = useState<any[] | null>(null)
  const [isSpotifySearching, setIsSpotifySearching] = useState(false)
  const [spotifyError, setSpotifyError] = useState('')
  const [mySuggestions, setMySuggestions] = useState<any[]>([])
  const [spotifySuccessMsg, setSpotifySuccessMsg] = useState('')
  const [suggestingTrackId, setSuggestingTrackId] = useState<string | null>(null)
  const [isDriveUploading, setIsDriveUploading] = useState(false)
  const [driveProgress, setDriveProgress] = useState(0)
  const [driveMessage, setDriveMessage] = useState({ text: '', isError: false })
  const [anecdoteText, setAnecdoteText] = useState('')
  const [anecdoteAnonymous, setAnecdoteAnonymous] = useState(false)
  const [isAnecdoteSubmitting, setIsAnecdoteSubmitting] = useState(false)
  const [anecdoteMessage, setAnecdoteMessage] = useState('')
  const [approvedAnecdotes, setApprovedAnecdotes] = useState<any[]>([])
  const [activeAnecdoteIndex, setActiveAnecdoteIndex] = useState(0)

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const rsvpSectionRef = useRef<HTMLDivElement>(null)

  // Session expired (401 from a gated API) — send the guest back to the passcode step
  const handleSessionExpired = () => {
    localStorage.removeItem('wedding_passcode_valid')
    setIsPasscodeValid(false)
    setStep('landing')
  }

  // Click outside language dropdown close handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Detect browser language or saved preference
  useEffect(() => {
    const savedLang = localStorage.getItem('wedding_lang') as Language | null
    if (savedLang && ['es', 'de', 'pt', 'en'].includes(savedLang)) {
      setLang(savedLang)
    } else {
      const browserLang = navigator.language || (navigator as any).userLanguage || 'es'
      const shortLang = browserLang.split('-')[0].toLowerCase() as Language
      if (['es', 'de', 'pt', 'en'].includes(shortLang)) {
        setLang(shortLang)
      } else {
        setLang('es')
      }
    }
  }, [])

  useEffect(() => {
    setPhoneCountry(LANG_DEFAULT_COUNTRY[lang] ?? 'DE')
  }, [lang])

  // Validate passcode and load guest cache on mount
  useEffect(() => {
    const cachedPasscode = localStorage.getItem('wedding_passcode_valid')
    if (cachedPasscode === 'true') {
      setIsPasscodeValid(true)
    } else {
      setIsPasscodeValid(false)
    }

    const cachedGuest = localStorage.getItem('wedding_guest')
    if (cachedGuest) {
      try {
        const parsed = JSON.parse(cachedGuest)
        setMatchedGuest(parsed)
        loadExistingRSVP(parsed.id)
        fetchMySuggestions(parsed.id)
        setStep('success')
      } catch (e) {
        console.warn('Could not parse cached guest', e)
      }
    }
    fetchApprovedAnecdotes()
  }, [])

  // Automatically fetch suggestions when guest updates
  useEffect(() => {
    if (matchedGuest) {
      localStorage.setItem('wedding_guest', JSON.stringify(matchedGuest))
      fetchMySuggestions(matchedGuest.id)
    } else {
      localStorage.removeItem('wedding_guest')
      setMySuggestions([])
    }
  }, [matchedGuest])

  // Countdown calculation
  useEffect(() => {
    // Sept 18, 2026 12:00:00
    const weddingDate = new Date("Sep 18, 2026 18:30:00").getTime()

    const interval = setInterval(() => {
      const now = new Date().getTime()
      const distance = weddingDate - now

      if (distance < 0) {
        clearInterval(interval)
        return
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24))
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((distance % (1000 * 60)) / 1000)

      setTimeLeft({ days, hours, minutes, seconds })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Fetch Spotify Suggestions
  const fetchMySuggestions = async (guestId: string) => {
    try {
      const res = await fetch(`/api/spotify/suggest?guestId=${guestId}`)
      if (res.status === 401) {
        handleSessionExpired()
        return
      }
      const data = await res.json()
      if (data.success) {
        setMySuggestions(data.suggestions)
      }
    } catch (e) {
      console.error('Error fetching suggestions:', e)
    }
  }

  // Fetch Approved Anecdotes
  const fetchApprovedAnecdotes = async () => {
    try {
      const res = await fetch('/api/anecdote')
      const data = await res.json()
      if (data.success) {
        setApprovedAnecdotes(data.anecdotes)
      }
    } catch (e) {
      console.error('Error fetching anecdotes:', e)
    }
  }

  // Spotify Search
  const handleSpotifySearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!spotifyQuery.trim()) return
    setIsSpotifySearching(true)
    setSpotifyError('')
    setSpotifySuccessMsg('')
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(spotifyQuery)}&guestId=${matchedGuest?.id || ''}`)
      if (res.status === 401) {
        handleSessionExpired()
        return
      }
      const data = await res.json()
      if (data.success) {
        setSpotifyResults(data.tracks)
      } else {
        setSpotifyError(data.error || 'Error al buscar.')
      }
    } catch (err) {
      setSpotifyError('Error de conexión.')
    } finally {
      setIsSpotifySearching(false)
    }
  }

  // Spotify Suggest
  const handleSpotifySuggest = async (track: any) => {
    if (!matchedGuest || suggestingTrackId === track.id) return
    setSuggestingTrackId(track.id)
    setSpotifyError('')
    setSpotifySuccessMsg('')
    try {
      const res = await fetch('/api/spotify/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: matchedGuest.id,
          trackId: track.id,
          trackName: track.name,
          artistName: track.artists || 'Unknown Artist',
          releaseYear: track.releaseYear || ''
        })
      })
      if (res.status === 401) {
        handleSessionExpired()
        return
      }
      const data = await res.json()
      if (data.success) {
        setSpotifySuccessMsg(
          data.voted
            ? fase2Translations[lang].spotifyVoteSuccess
            : fase2Translations[lang].spotifySuggestSuccess
        )
        fetchMySuggestions(matchedGuest.id)
        if (spotifyQuery.trim()) {
          handleSpotifySearch()
        }
      } else {
        setSpotifyError(data.error || 'Error al sugerir la canción.')
      }
    } catch (err) {
      setSpotifyError('Error de conexión con el servidor.')
    } finally {
      setSuggestingTrackId(null)
    }
  }

  // Direct Cloudinary Upload
  const handleDriveUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]

    const maxMB = 50
    if (file.size > maxMB * 1024 * 1024) {
      setDriveMessage({ text: `${fase2Translations[lang].driveUploadError || 'Error.'} Max ${maxMB}MB.`, isError: true })
      return
    }

    setIsDriveUploading(true)
    setDriveProgress(0)
    setDriveMessage({ text: '', isError: false })

    try {
      // Step 1: Obtain upload signature / parameters from server
      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          guestName: matchedGuest?.partyName || 'Invitado',
        }),
      })

      if (res.status === 401) {
        setIsDriveUploading(false)
        handleSessionExpired()
        return
      }

      const sigData = await res.json()
      if (!res.ok || !sigData.success || !sigData.uploadUrl || !sigData.params) {
        setIsDriveUploading(false)
        setDriveMessage({ text: sigData.error || fase2Translations[lang].driveUploadError, isError: true })
        return
      }

      // Step 2: Upload file directly to Cloudinary via XMLHttpRequest for progress tracking
      const formData = new FormData()
      Object.entries(sigData.params).forEach(([key, value]) => {
        formData.append(key, value as string)
      })
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', sigData.uploadUrl, true)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentage = Math.round((event.loaded / event.total) * 100)
          setDriveProgress(percentage)
        }
      }

      xhr.onload = () => {
        setIsDriveUploading(false)
        if (xhr.status >= 200 && xhr.status < 300) {
          setDriveMessage({ text: fase2Translations[lang].driveUploadSuccess, isError: false })
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText)
            setDriveMessage({ text: errRes.error?.message || fase2Translations[lang].driveUploadError, isError: true })
          } catch {
            setDriveMessage({ text: fase2Translations[lang].driveUploadError, isError: true })
          }
        }
      }

      xhr.onerror = () => {
        setIsDriveUploading(false)
        setDriveMessage({ text: 'Error de red al subir archivo.', isError: true })
      }

      xhr.send(formData)
    } catch (err: any) {
      setIsDriveUploading(false)
      setDriveMessage({ text: err?.message || fase2Translations[lang].driveUploadError, isError: true })
    }
  }

  // Anecdote Submit
  const handleAnecdoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!anecdoteText.trim()) return
    setIsAnecdoteSubmitting(true)
    setAnecdoteMessage('')
    try {
      const res = await fetch('/api/anecdote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: anecdoteAnonymous ? null : (matchedGuest?.id || null),
          text: anecdoteText
        })
      })
      if (res.status === 401) {
        handleSessionExpired()
        return
      }
      const data = await res.json()
      if (data.success) {
        setAnecdoteText('')
        setAnecdoteMessage(fase2Translations[lang].anecdoteSuccess)
        fetchApprovedAnecdotes() // Refresh public anecdotes carousel
      } else {
        setAnecdoteMessage(data.error || 'Error al enviar anécdota.')
      }
    } catch (err) {
      setAnecdoteMessage('Error de conexión.')
    } finally {
      setIsAnecdoteSubmitting(false)
    }
  }

  // Check passcode
  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasscodeError('')
    setIsCheckingPasscode(true)

    try {
      const res = await fetch('/api/auth/validate-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })

      const data = await res.json()

      if (data.success) {
        localStorage.setItem('wedding_passcode_valid', 'true')
        setIsPasscodeValid(true)
      } else {
        setPasscodeError(data.error || translations[lang].errorPasscode)
      }
    } catch (err) {
      setPasscodeError(translations[lang].errorServer)
    } finally {
      setIsCheckingPasscode(false)
    }
  }

  // Search guest by name
  const handleNameSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError('')

    // Client-side validation: require at least 2 words (name + surname)
    const trimmed = guestName.trim()
    const words = trimmed.split(/\s+/).filter(w => w.length > 0)
    if (words.length < 2) {
      setSearchError(translations[lang].searchNeedFullName)
      return
    }

    setIsSearching(true)

    try {
      const res = await fetch('/api/guest/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })

      if (res.status === 401) {
        handleSessionExpired()
        return
      }

      const data = await res.json()

      if (data.success) {
        if (data.matchTier === 'exact' && data.match) {
          // High confidence match — go to confirm step
          setMatchedGuest(data.match)
          setNumAdults(Math.min(data.match.partySizeMax, 2))
          setStep('confirm')
        } else if (data.matchTier === 'fuzzy') {
          // Medium confidence — show helpful retry message, stay on search step
          setSearchError(translations[lang].fuzzyMatchDesc)
        } else {
          // No match at all — go to the "not found" confirm step
          setMatchedGuest(null)
          setStep('confirm')
        }
      } else {
        // Handle specific error codes
        if (data.error === 'NEED_FULL_NAME') {
          setSearchError(translations[lang].searchNeedFullName)
        } else {
          setSearchError(data.error || translations[lang].searchErrorName)
        }
      }
    } catch (err) {
      setSearchError(translations[lang].searchErrorNetwork)
    } finally {
      setIsSearching(false)
    }
  }

  // Pre-load RSVP if guest has already responded
  const loadExistingRSVP = async (guestId: string) => {
    try {
      const res = await fetch(`/api/rsvp?guestId=${guestId}`)
      if (res.status === 401) {
        handleSessionExpired()
        return
      }
      const data = await res.json()
      if (data.success && data.rsvp) {
        setAttending(data.rsvp.attending)
        setNumAdults(data.rsvp.numAdults)
        setNumKids(data.rsvp.numKids)
        setKidsNames(data.rsvp.kidsNames || '')
        setDietary(data.rsvp.dietary)
        setDietaryNotes(data.rsvp.dietaryNotes || '')
        setContribution(data.rsvp.contribution || '')
        // El servidor ya no devuelve el número (PII); solo si hay uno guardado.
        setHasStoredPhone(!!data.rsvp.hasPhone)
        setPhone('')
      }
    } catch (e) {
      console.warn('Could not load existing RSVP details', e)
    }
  }

  const handleConfirmGuest = async (isCorrect: boolean) => {
    if (isCorrect && matchedGuest) {
      await loadExistingRSVP(matchedGuest.id)
      setStep('form')
    } else {
      // Si no es el invitado correcto o no se encontró coincidencia
      setStep('form') // Va al formulario igualmente, se creará uno nuevo
    }
  }

  // Submit RSVP form
  const handleRsvpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setIsSubmitting(true)

    try {
      let phoneE164: string | null = null
      if (attending) {
        if (phone.trim()) {
          const result = normalizePhone(phone, phoneCountry)
          if (!result.valid) {
            setSubmitError(translations[lang].phoneInvalidError)
            setIsSubmitting(false)
            return
          }
          phoneE164 = result.e164!
        } else if (!hasStoredPhone) {
          // Ni número escrito ni guardado: obligatorio.
          setSubmitError(translations[lang].phoneRequiredError)
          setIsSubmitting(false)
          return
        }
        // Campo vacío con número ya guardado: se conserva (phoneE164 = null → el servidor lo mantiene).
      }

      const payload = {
        guestId: matchedGuest?.id || null,
        partyName: matchedGuest ? null : guestName, // si no hay coincidencia, registrar como nuevo con el nombre ingresado
        attending,
        numAdults,
        numKids,
        kidsNames: numKids > 0 ? kidsNames : '',
        dietary,
        dietaryNotes,
        contribution,
        phone: phoneE164,
        language: lang,
      }

      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 401) {
        handleSessionExpired()
        return
      }

      const data = await res.json()

      if (data.success) {
        setStep('success')
        // Si el invitado era nuevo, actualizar localmente
        if (!matchedGuest && data.rsvp) {
          setMatchedGuest({
            id: data.rsvp.guestId,
            partyName: guestName,
            partySizeMax: numAdults + numKids,
            status: 'RESPONDED',
            notPreloaded: true
          })
        }
      } else {
        setSubmitError(data.error || translations[lang].rsvpSubmitError)
      }
    } catch (err) {
      setSubmitError(translations[lang].rsvpSubmitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  const scrollToRsvp = () => {
    setStep('match')
    setTimeout(() => {
      rsvpSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  // Display loading screen while validating cache
  if (isPasscodeValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rose-50/50">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-rose-600 text-5xl animate-pulse">favorite</span>
          <p className="font-body text-rose-800 text-sm tracking-widest uppercase">
            {lang === 'es' ? 'Cargando Portal...' : lang === 'de' ? 'Portal wird geladen...' : lang === 'pt' ? 'Carregando Portal...' : 'Loading Portal...'}
          </p>
        </div>
      </div>
    )
  }

  // Render Passcode Gate if not authenticated
  if (!isPasscodeValid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Floating Language Selector */}
        <div className="fixed top-4 right-4 z-[100]" ref={langDropdownRef}>
          <div className="relative">
            <button
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/45 text-slate-800 font-semibold text-xs transition-all hover:bg-white/60 shadow-md cursor-pointer select-none"
              aria-expanded={isLangDropdownOpen}
              aria-haspopup="listbox"
            >
              <span>{languages.find(l => l.code === lang)?.flag}</span>
              <span className="uppercase font-semibold">{lang}</span>
              <span className={`material-symbols-outlined text-[14px] transition-transform duration-200 ${isLangDropdownOpen ? 'rotate-180' : ''}`}>
                keyboard_arrow_down
              </span>
            </button>

            {isLangDropdownOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white/80 backdrop-blur-lg border border-rose-100 rounded-2xl shadow-lg py-2 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLang(l.code);
                      localStorage.setItem('wedding_lang', l.code);
                      setIsLangDropdownOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-2 text-left text-xs font-semibold w-full transition-colors cursor-pointer ${lang === l.code
                        ? 'bg-rose-100/50 text-rose-900'
                        : 'text-slate-700 hover:bg-rose-50/40'
                      }`}
                  >
                    <span className="text-base">{l.flag}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Aurora Background */}
        <div className="aurora-bg">
          <div className="aurora-glow glow-1"></div>
          <div className="aurora-glow glow-2"></div>
          <div className="aurora-glow glow-3"></div>
        </div>

        <div className="max-w-md w-full glass-card rounded-3xl p-8 md:p-12 text-center flex flex-col gap-8 relative z-10 transition-all duration-500">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-rose-700 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
            <h1 className="font-display text-4xl text-rose-900 leading-tight">F & A</h1>
            <div className="h-px w-16 bg-rose-300/50 my-2"></div>
            <p className="font-body text-sm uppercase tracking-[0.2em] text-rose-800/80">{translations[lang].portalTitle}</p>
          </div>

          <form onSubmit={handlePasscodeSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col text-left gap-1">
              <label htmlFor="passcode" className="font-body text-xs text-slate-600 uppercase tracking-widest ml-1">{translations[lang].enterPasscode}</label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={translations[lang].passcodePlaceholder}
                className="w-full bg-white/60 border border-rose-200/50 rounded-full px-5 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50 text-center placeholder:text-slate-400"
                disabled={isCheckingPasscode}
                required
              />
            </div>
            {passcodeError && (
              <p className="font-body text-xs text-red-600">{passcodeError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-600 to-rose-800 text-white rounded-full py-4 font-body tracking-wider text-sm font-medium hover:shadow-lg hover:shadow-rose-700/30 transition-all duration-300 cursor-pointer"
              disabled={isCheckingPasscode}
            >
              {isCheckingPasscode ? translations[lang].validating : translations[lang].validateBtn}
            </button>
          </form>

          <p className="font-body text-xs text-slate-500">
            {translations[lang].passcodeHelp}
          </p>
        </div>
      </div>
    )
  }

  // Render Full Wedding Website (Authed)
  return (
    <div className="min-h-screen flex flex-col relative antialiased selection:bg-primary-container selection:text-primary-on-container">
      {/* Aurora Background */}
      <div className="aurora-bg">
        <div className="aurora-glow glow-1"></div>
        <div className="aurora-glow glow-2"></div>
        <div className="aurora-glow glow-3"></div>
      </div>

      {/* Top Navigation */}
      <header className="fixed top-0 w-full z-50 bg-white/30 backdrop-blur-md border-b border-white/20 shadow-sm transition-all duration-300">
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-rose-700" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
            <span className="font-display italic text-2xl text-rose-700">{translations[lang].title}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Language Selector inside Header */}
            <div className="relative" ref={langDropdownRef}>
              <button
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 border border-slate-200/50 text-slate-800 font-semibold text-xs transition-all hover:bg-white/80 shadow-sm cursor-pointer select-none"
              >
                <span>{languages.find(l => l.code === lang)?.flag}</span>
                <span className="uppercase font-semibold">{lang}</span>
                <span className={`material-symbols-outlined text-[14px] transition-transform duration-200 ${isLangDropdownOpen ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>

              {isLangDropdownOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white/90 backdrop-blur-lg border border-rose-100 rounded-2xl shadow-lg py-2 flex flex-col gap-1 z-50">
                  {languages.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        setLang(l.code);
                        localStorage.setItem('wedding_lang', l.code);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`flex items-center gap-3 px-4 py-2 text-left text-xs font-semibold w-full transition-colors cursor-pointer ${lang === l.code
                          ? 'bg-rose-100/50 text-rose-900'
                          : 'text-slate-700 hover:bg-rose-50/45'
                        }`}
                    >
                      <span className="text-base">{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={scrollToRsvp}
              className="bg-rose-700 text-white px-5 py-2 rounded-full font-body text-sm font-medium tracking-wide hover:bg-rose-800 transition-colors shadow-md cursor-pointer"
            >
              {translations[lang].confirmNav}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow pt-24 pb-16 px-4 md:px-8 lg:px-12 max-w-7xl mx-auto w-full relative z-10 flex flex-col gap-16 md:gap-24">

        {/* Hero Section */}
        <section className="min-h-[470px] sm:min-h-[520px] md:min-h-[580px] flex flex-col items-center justify-center text-center relative mt-6 md:mt-12 rounded-3xl overflow-hidden glass-card px-4 py-8 md:p-16">
          {/* Hero image — optimized framing and zoom for mobile */}
          <img
            src="/20250906_192032.jpeg"
            alt="Francisco & Alicia"
            className="absolute inset-0 w-full h-full object-cover object-[45%_30%] md:object-center pointer-events-none z-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-rose-950/90 via-rose-950/40 to-rose-950/70 z-0"></div>
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 via-black/20 to-transparent z-0 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl mx-auto">
            <div className="px-5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/25 shadow-md">
              <p className="font-body text-xs md:text-sm tracking-[0.28em] text-rose-100 font-semibold uppercase drop-shadow">
                {translations[lang].weAreGettingMarried}
              </p>
            </div>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl text-white leading-tight drop-shadow-lg">
              Francisco <span className="font-light italic text-rose-300">&amp;</span> Alicia
            </h1>
            <div className="flex flex-col items-center gap-2 mt-4 text-white/90">
              <p className="font-body text-xl md:text-2xl font-light drop-shadow">{translations[lang].date}</p>
              <div className="flex items-center gap-2 text-rose-200">
                <span className="material-symbols-outlined text-sm">location_on</span>
                <p className="font-body text-base tracking-wide font-medium drop-shadow">Freiburg, {lang === 'de' ? 'Deutschland' : lang === 'en' ? 'Germany' : lang === 'pt' ? 'Alemanha' : 'Alemania'}</p>
              </div>
            </div>

            {/* Countdown Widget */}
            <div className="grid grid-cols-4 gap-4 md:gap-8 mt-12 w-full max-w-lg bg-black/30 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl md:text-4xl text-white font-bold drop-shadow">{String(timeLeft.days).padStart(2, '0')}</span>
                <span className="font-body text-xs text-rose-200 uppercase tracking-widest mt-1">{translations[lang].days}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl md:text-4xl text-white font-bold drop-shadow">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="font-body text-xs text-rose-200 uppercase tracking-widest mt-1">{translations[lang].hours}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl md:text-4xl text-white font-bold drop-shadow">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="font-body text-xs text-rose-200 uppercase tracking-widest mt-1">{translations[lang].minutes}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl md:text-4xl text-white font-bold drop-shadow">{String(timeLeft.seconds).padStart(2, '0')}</span>
                <span className="font-body text-xs text-rose-200 uppercase tracking-widest mt-1">{translations[lang].seconds}</span>
              </div>
            </div>

            {/* Main CTA */}
            <button
              onClick={scrollToRsvp}
              className="mt-12 group relative px-8 py-4 bg-rose-700 text-white rounded-full font-body tracking-wider text-sm md:text-base overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-rose-700/30 cursor-pointer"
            >
              <span className="relative z-10 flex items-center gap-2">
                {translations[lang].rsvpBtn}
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-rose-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        </section>

        {/* Our Story Section */}
        <section className="max-w-4xl mx-auto text-center px-4">
          <h2 className="font-display text-3xl md:text-4xl text-rose-900 mb-8 italic">{translations[lang].storyTitle}</h2>
          <div className="glass-card p-8 md:p-12 rounded-3xl relative">
            <p className="font-body text-slate-700 leading-relaxed text-lg md:text-xl font-light">
              {translations[lang].storyText}
            </p>
          </div>
        </section>

        {/* Details Bento Grid */}
        <section className="w-full">
          <div className="flex items-center justify-center gap-4 mb-10">
            <div className="h-px w-16 bg-rose-300/50"></div>
            <h2 className="font-display text-2xl md:text-3xl text-rose-900 tracking-wide">{translations[lang].detailsTitle}</h2>
            <div className="h-px w-16 bg-rose-300/50"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-[minmax(250px,auto)]">

            {/* Ceremony Card — hidden until further notice */}
            <div className="hidden">
            <div className="glass-card rounded-3xl p-8 flex flex-col justify-between group hover:bg-white/30 transition-all duration-500">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-2xl bg-rose-100/50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-600">church</span>
                </div>
                <span className="font-body text-xs uppercase tracking-widest text-slate-500 font-semibold">{translations[lang].bentoCeremonyTime}</span>
              </div>
              <div>
                <h3 className="font-display text-2xl text-rose-900 mb-2 group-hover:text-rose-700 transition-colors">{translations[lang].bentoCeremonyTitle}</h3>
                <p className="font-body text-slate-600 mb-4 text-sm leading-relaxed">{translations[lang].bentoCeremonyDesc}</p>
                <a className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 hover:text-rose-800" href="https://maps.google.com/?q=Freiburger+Munster" target="_blank">
                  {translations[lang].bentoCeremonyBtn} <span className="material-symbols-outlined text-[16px]">north_east</span>
                </a>
              </div>
            </div>
            </div>

            {/* Banquet Card */}
            <div className="glass-card rounded-3xl p-8 flex flex-col justify-between group hover:bg-white/30 transition-all duration-500">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-2xl bg-rose-100/50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-600">restaurant</span>
                </div>
                <span className="font-body text-xs uppercase tracking-widest text-slate-500 font-semibold">{translations[lang].bentoBanquetTime}</span>
              </div>
              <div>
                <h3 className="font-display text-2xl text-rose-900 mb-2 group-hover:text-rose-700 transition-colors">{translations[lang].bentoBanquetTitle}</h3>
                <p className="font-body text-slate-600 mb-4 text-sm leading-relaxed">{translations[lang].bentoBanquetDesc}</p>
                <a className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 hover:text-rose-800" href="https://maps.google.com/?q=Konzerthaus+Freiburg" target="_blank" rel="noopener noreferrer">
                  {translations[lang].bentoBanquetBtn} <span className="material-symbols-outlined text-[16px]">north_east</span>
                </a>
              </div>
            </div>

            {/* Dress Code Card */}
            <div className="glass-card rounded-3xl p-8 flex flex-col justify-between group hover:bg-white/30 transition-all duration-500">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-2xl bg-rose-100/50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-600">styler</span>
                </div>
              </div>
              <div>
                <h3 className="font-display text-2xl text-rose-900 mb-2 group-hover:text-rose-700 transition-colors">{translations[lang].bentoDressCodeTitle}</h3>
                <p className="font-body text-slate-600 mb-4 text-sm leading-relaxed">{translations[lang].bentoDressCodeDesc}</p>
                <div className="flex gap-2 mt-4">
                  <span className="px-3 py-1 bg-white/40 rounded-full text-xs font-semibold text-slate-700">{translations[lang].bentoDressCodeTag1}</span>
                  <span className="px-3 py-1 bg-white/40 rounded-full text-xs font-semibold text-slate-700">{translations[lang].bentoDressCodeTag2}</span>
                </div>
              </div>
            </div>

            {/* Gallery teaser */}
            <div className="glass-card rounded-3xl overflow-hidden md:col-span-2 lg:col-span-3 h-64 relative group">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url('/20240213_162058.jpeg')` }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-rose-950/60 to-transparent"></div>
              <div className="absolute bottom-6 left-8 right-8">
                <h4 className="font-display text-white text-2xl mb-1">{translations[lang].bentoGalleryTitle}</h4>
                <p className="font-body text-white/80 text-sm">{translations[lang].bentoGalleryDesc}</p>
              </div>
            </div>

          </div>
        </section>

        {/* RSVP Interaction Section */}
        <section ref={rsvpSectionRef} className="max-w-2xl mx-auto w-full scroll-mt-24">
          <div className="flex flex-col items-center gap-4 mb-8 text-center">
            <h2 className="font-display text-3xl text-rose-900">{translations[lang].rsvpFlowTitle}</h2>
            <p className="font-body text-sm text-slate-600 max-w-md">
              {translations[lang].rsvpFlowSubtitle}
            </p>
          </div>

          <div className="glass-card rounded-3xl p-8 shadow-md relative overflow-hidden min-h-[300px] flex flex-col justify-center">

            {/* STEP 1: INITIAL BUTTON */}
            {step === 'landing' && (
              <div className="text-center py-6 flex flex-col items-center gap-6">
                <span className="material-symbols-outlined text-rose-700 text-5xl">mail</span>
                <p className="font-body text-slate-700 text-lg">{translations[lang].landingTitle}</p>
                <button
                  onClick={() => setStep('match')}
                  className="bg-rose-700 text-white px-8 py-3 rounded-full font-body text-sm font-semibold tracking-wider hover:bg-rose-800 transition-colors shadow-md cursor-pointer"
                >
                  {translations[lang].landingBtn}
                </button>
              </div>
            )}

            {/* STEP 2: NAME MATCH SEARCH */}
            {step === 'match' && (
              <form onSubmit={handleNameSearchSubmit} className="flex flex-col gap-6">
                <h3 className="font-display text-xl text-rose-900 text-center">{translations[lang].searchTitle}</h3>
                <div className="flex flex-col gap-2">
                  <label htmlFor="guestName" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].searchNameLabel}</label>
                  <input
                    id="guestName"
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={translations[lang].searchNamePlaceholder}
                    className="w-full bg-white/70 border border-rose-200/50 rounded-full px-5 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    disabled={isSearching}
                    required
                  />
                  <p className="text-xs text-slate-500 ml-1">{translations[lang].searchHelp}</p>
                </div>
                {searchError && (
                  <p className="font-body text-xs text-red-600 text-center">{searchError}</p>
                )}
                <div className="flex justify-between items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setStep('landing')}
                    className="border border-rose-300 text-rose-800 px-6 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-100/30 cursor-pointer"
                    disabled={isSearching}
                  >
                    {translations[lang].backBtn}
                  </button>
                  <button
                    type="submit"
                    className="bg-rose-700 text-white px-8 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-md flex-1 cursor-pointer"
                    disabled={isSearching}
                  >
                    {isSearching ? translations[lang].searching : translations[lang].searchBtn}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: CONFIRM MATCH */}
            {step === 'confirm' && (
              <div className="flex flex-col gap-6 text-center">
                {matchedGuest ? (
                  <>
                    <h3 className="font-display text-2xl text-rose-900">{translations[lang].isThatYouTitle}</h3>
                    <div className="bg-white/40 rounded-2xl p-6 border border-white/50 shadow-sm max-w-sm mx-auto w-full">
                      <p className="font-display text-xl text-rose-950 font-bold">{matchedGuest.partyName}</p>
                      <p className="font-body text-xs text-slate-500 uppercase tracking-widest mt-1">{translations[lang].partyLimitLabel}: {matchedGuest.partySizeMax}</p>
                      {matchedGuest.status === 'RESPONDED' && (
                        <span className="mt-3 inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                          {translations[lang].alreadyConfirmedLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 max-w-md mx-auto w-full mt-4">
                      <button
                        onClick={() => {
                          setStep('match')
                          setMatchedGuest(null)
                        }}
                        className="border border-rose-300 text-rose-800 px-6 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-100/30 flex-1 cursor-pointer"
                      >
                        {translations[lang].noSearchAgain}
                      </button>
                      <button
                        onClick={() => handleConfirmGuest(true)}
                        className="bg-rose-700 text-white px-8 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-md flex-1 cursor-pointer"
                      >
                        {translations[lang].yesItsMe}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-display text-2xl text-rose-900">{translations[lang].guestNotFoundTitle}</h3>
                    <p className="font-body text-slate-700 leading-relaxed text-sm max-w-sm mx-auto">
                      {translations[lang].noMatchDesc} &quot;<strong>{guestName}</strong>&quot;.
                    </p>
                    <div className="bg-rose-50/50 border border-rose-200/50 rounded-2xl p-4 text-left max-w-sm mx-auto">
                      <p className="text-xs text-slate-600 font-medium">{translations[lang].recommendationLabel}</p>
                      <ul className="list-disc list-inside text-xs text-slate-500 mt-1 flex flex-col gap-1">
                        <li>{translations[lang].recommendationTip1}</li>
                        <li>{translations[lang].recommendationTip2}</li>
                        <li>{translations[lang].recommendationTip3}</li>
                      </ul>
                    </div>
                    <div className="flex gap-4 max-w-md mx-auto w-full mt-4">
                      <button
                        onClick={() => setStep('match')}
                        className="border border-rose-300 text-rose-800 px-6 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-100/30 flex-1 cursor-pointer"
                      >
                        {translations[lang].backToSearchBtn}
                      </button>
                      <button
                        onClick={() => handleConfirmGuest(false)}
                        className="bg-rose-700 text-white px-8 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-md flex-1 cursor-pointer"
                      >
                        {translations[lang].continueAndRegister}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STEP 4: RSVP FORM */}
            {step === 'form' && (
              <form onSubmit={handleRsvpSubmit} className="flex flex-col gap-6">
                <h3 className="font-display text-xl text-rose-900 text-center">
                  {translations[lang].formForLabel} {matchedGuest ? matchedGuest.partyName : guestName}
                </h3>

                {/* Attending Toggle */}
                <div className="flex items-center justify-between bg-white/40 border border-white/50 rounded-2xl p-4 shadow-sm">
                  <span className="font-body text-sm font-semibold text-slate-800">{translations[lang].attendanceLabel}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setAttending(false)}
                      className={`px-4 py-2 rounded-full font-body text-xs font-semibold transition-all cursor-pointer ${!attending ? 'bg-rose-700 text-white shadow-sm' : 'bg-slate-200/50 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {translations[lang].attendingNo}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttending(true)}
                      className={`px-4 py-2 rounded-full font-body text-xs font-semibold transition-all cursor-pointer ${attending ? 'bg-rose-700 text-white shadow-sm' : 'bg-slate-200/50 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {translations[lang].attendingYes}
                    </button>
                  </div>
                </div>

                {attending && (
                  <>
                    {/* Guest counts */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label htmlFor="numAdults" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].numAdultsLabel}</label>
                        <select
                          id="numAdults"
                          value={numAdults}
                          onChange={(e) => setNumAdults(Number(e.target.value))}
                          className="bg-white/70 border border-rose-200/50 rounded-full px-4 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        >
                          {[1, 2, 3, 4, 5, 6].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="numKids" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].numKidsLabel}</label>
                        <select
                          id="numKids"
                          value={numKids}
                          onChange={(e) => setNumKids(Number(e.target.value))}
                          className="bg-white/70 border border-rose-200/50 rounded-full px-4 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        >
                          {[0, 1, 2, 3, 4].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Kids names if kids > 0 */}
                    {numKids > 0 && (
                      <div className="flex flex-col gap-1">
                        <label htmlFor="kidsNames" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].kidsNamesLabel}</label>
                        <input
                          id="kidsNames"
                          type="text"
                          value={kidsNames}
                          onChange={(e) => setKidsNames(e.target.value)}
                          placeholder={translations[lang].kidsNamesPlaceholder}
                          className="w-full bg-white/70 border border-rose-200/50 rounded-full px-5 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                          required
                        />
                      </div>
                    )}

                    {/* Dietary preference */}
                    <div className="flex flex-col gap-2">
                      <span className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].menuPrefsLabel}</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(['OMNIVORO', 'VEGETARIANO', 'VEGANO', 'OTRO'] as const).map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setDietary(option)}
                            className={`py-3 rounded-xl font-body text-xs font-semibold transition-all cursor-pointer ${dietary === option
                                ? 'bg-rose-700 text-white shadow-sm border border-rose-800'
                                : 'bg-white/60 text-slate-700 border border-rose-200/40 hover:bg-rose-100/30'
                              }`}
                          >
                            {option === 'OMNIVORO' ? translations[lang].menuOmnivore : option === 'VEGETARIANO' ? translations[lang].menuVegetarian : option === 'VEGANO' ? translations[lang].menuVegan : translations[lang].menuOther}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Allergies / Notes */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="dietaryNotes" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].allergyNotesLabel}</label>
                      <textarea
                        id="dietaryNotes"
                        value={dietaryNotes}
                        onChange={(e) => setDietaryNotes(e.target.value)}
                        placeholder={translations[lang].allergyNotesPlaceholder}
                        rows={2}
                        className="w-full bg-white/70 border border-rose-200/50 rounded-2xl px-5 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                      />
                    </div>

                    {/* Contribution */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="contribution" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].musicContribLabel}</label>
                      <input
                        id="contribution"
                        type="text"
                        value={contribution}
                        onChange={(e) => setContribution(e.target.value)}
                        placeholder={translations[lang].musicContribPlaceholder}
                        className="w-full bg-white/70 border border-rose-200/50 rounded-full px-5 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                      />
                    </div>

                    {/* Phone (WhatsApp) — obligatorio si asiste */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="phone" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">{translations[lang].phoneLabel}</label>
                      <div className="flex gap-2">
                        <select
                          aria-label="País"
                          value={phoneCountry}
                          onChange={(e) => setPhoneCountry(e.target.value as CountryCode)}
                          className="bg-white/70 border border-rose-200/50 rounded-full px-3 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        >
                          <option value="ES">🇪🇸 +34</option>
                          <option value="DE">🇩🇪 +49</option>
                          <option value="PT">🇵🇹 +351</option>
                          <option value="GB">🇬🇧 +44</option>
                          <option value="FR">🇫🇷 +33</option>
                          <option value="IT">🇮🇹 +39</option>
                          <option value="CH">🇨🇭 +41</option>
                          <option value="AT">🇦🇹 +43</option>
                          <option value="US">🇺🇸 +1</option>
                        </select>
                        <input
                          id="phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder={translations[lang].phonePlaceholder}
                          className="flex-1 bg-white/70 border border-rose-200/50 rounded-full px-5 py-3 font-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                          required={attending && !hasStoredPhone}
                        />
                      </div>
                      {hasStoredPhone && (
                        <p className="font-body text-[11px] text-slate-500 ml-1">{translations[lang].phoneStoredHint}</p>
                      )}
                      <p className="font-body text-[11px] text-slate-500 ml-1">{translations[lang].phoneHelp}</p>
                    </div>
                  </>
                )}

                {/* Attending is false */}
                {!attending && (
                  <div className="bg-rose-50/50 rounded-2xl p-6 border border-rose-200/40 text-center max-w-md mx-auto w-full">
                    <p className="font-body text-sm text-slate-700">{translations[lang].notAttendingNotice}</p>
                  </div>
                )}

                {submitError && (
                  <p className="font-body text-xs text-red-600 text-center">{submitError}</p>
                )}

                <div className="flex justify-between items-center gap-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setStep('confirm')}
                    className="border border-rose-300 text-rose-800 px-6 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-100/30 cursor-pointer"
                    disabled={isSubmitting}
                  >
                    {translations[lang].backBtn}
                  </button>
                  <button
                    type="submit"
                    className="bg-rose-700 text-white px-8 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-md flex-1 cursor-pointer"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? translations[lang].sendingRsvp : translations[lang].rsvpBtn}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 5: SUCCESS STATE */}
            {step === 'success' && (
              <div className="text-center py-6 flex flex-col items-center gap-6">
                <span className="material-symbols-outlined text-green-600 text-6xl">check_circle</span>
                <h3 className="font-display text-3xl text-rose-900">{translations[lang].thankYouTitle}</h3>
                <div className="max-w-md">
                  <p className="font-body text-slate-700 text-base leading-relaxed">
                    {translations[lang].successDescAttending}
                  </p>
                  {attending ? (
                    <p className="font-body text-slate-600 text-sm mt-2">
                      {translations[lang].successDescAttending2}
                    </p>
                  ) : (
                    <p className="font-body text-slate-600 text-sm mt-2">
                      {translations[lang].successDescNotAttending}
                    </p>
                  )}
                </div>

                <div className="flex gap-4 mt-2">
                  <button
                    onClick={() => setStep('form')}
                    className="border border-rose-300 text-rose-800 px-6 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-100/30 cursor-pointer"
                  >
                    {translations[lang].editRsvpBtn}
                  </button>
                  <button
                    onClick={() => setStep('landing')}
                    className="bg-rose-700 text-white px-8 py-3 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-md cursor-pointer"
                  >
                    {translations[lang].rsvpBackHomeBtn}
                  </button>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* Guest Experiences Section (Phase 2) */}
        <section className="max-w-4xl mx-auto w-full mt-12 md:mt-16 scroll-mt-24">
          <div className="flex flex-col items-center gap-4 mb-8 text-center">
            <h2 className="font-display text-3xl text-rose-900">{fase2Translations[lang].experienceTitle}</h2>
            <p className="font-body text-sm text-slate-600 max-w-md">
              {fase2Translations[lang].experienceSubtitle}
            </p>
          </div>

          {!matchedGuest ? (
            <div className="glass-card rounded-3xl p-8 text-center flex flex-col items-center gap-4 border border-rose-200/30">
              <span className="material-symbols-outlined text-rose-300 text-5xl animate-pulse">lock</span>
              <p className="font-body text-slate-650 text-sm max-w-md leading-relaxed">
                {fase2Translations[lang].experienceLocked}
              </p>
              <button
                onClick={() => {
                  setStep('match')
                  rsvpSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="mt-2 bg-rose-700 text-white px-6 py-2 rounded-full font-body text-xs font-semibold tracking-wider hover:bg-rose-800 transition-colors shadow-sm cursor-pointer"
              >
                {translations[lang].landingBtn}
              </button>
            </div>
          ) : (
            <div className="glass-card rounded-3xl p-6 md:p-8 border border-white/50 shadow-md flex flex-col gap-6">
              {/* Tab Selector */}
              <div className="flex bg-slate-200/50 rounded-2xl p-1.5 self-center max-w-md w-full">
                {(['spotify', 'drive', 'anecdotes'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setExperienceTab(tab)}
                    className={`flex-1 py-3 text-center rounded-xl font-body text-xs font-bold transition-all cursor-pointer ${experienceTab === tab
                        ? 'bg-rose-700 text-white shadow-md'
                        : 'text-slate-600 hover:bg-rose-50/20'
                      }`}
                  >
                    {tab === 'spotify'
                      ? fase2Translations[lang].tabMusic
                      : tab === 'drive'
                        ? fase2Translations[lang].tabPhotos
                        : fase2Translations[lang].tabStories}
                  </button>
                ))}
              </div>

              <div className="min-h-[350px]">
                {/* SPOTIFY TAB */}
                {experienceTab === 'spotify' && (
                  <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                    <form onSubmit={handleSpotifySearch} className="flex gap-2">
                      <input
                        type="text"
                        value={spotifyQuery}
                        onChange={(e) => setSpotifyQuery(e.target.value)}
                        placeholder={fase2Translations[lang].spotifySearchPlaceholder}
                        className="flex-grow bg-white/70 border border-rose-200/50 rounded-full px-5 py-3 font-body text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        disabled={isSpotifySearching}
                      />
                      <button
                        type="submit"
                        className="bg-rose-700 text-white px-6 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        disabled={isSpotifySearching}
                      >
                        <span className="material-symbols-outlined text-sm">search</span>
                        {isSpotifySearching ? fase2Translations[lang].spotifySearching : fase2Translations[lang].spotifySearchBtn}
                      </button>
                    </form>

                    {spotifyError && (
                      <p className="font-body text-xs text-red-600 text-center">{spotifyError}</p>
                    )}
                    {spotifySuccessMsg && (
                      <p className="font-body text-xs text-green-700 text-center font-semibold">{spotifySuccessMsg}</p>
                    )}

                    {/* Search Results */}
                    {spotifyResults && (
                      <div className="bg-white/40 border border-white/50 rounded-2xl p-4 flex flex-col gap-3 max-h-72 overflow-y-auto scrollbar-thin">
                        {spotifyResults.length > 0 ? (
                          spotifyResults.map((track) => (
                            <div key={track.id} className="flex items-center justify-between gap-4 p-2 hover:bg-white/30 rounded-xl transition-all">
                              <div className="flex items-center gap-3 min-w-0">
                                {track.album?.images?.[2]?.url ? (
                                  <img
                                    src={track.album.images[2].url}
                                    alt={track.name}
                                    className="w-10 h-10 rounded-lg object-cover shadow-sm"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700">
                                    <span className="material-symbols-outlined text-sm">music_note</span>
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-body text-sm font-semibold text-slate-800 truncate">{track.name}</p>
                                  <p className="font-body text-xs text-slate-500 truncate">
                                    {track.artists}{track.releaseYear ? ` • ${track.releaseYear}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div>
                                {track.isSuggested ? (
                                  <button
                                    onClick={() => handleSpotifySuggest(track)}
                                    disabled={suggestingTrackId === track.id}
                                    className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-1.5 rounded-full font-body text-xs font-semibold hover:bg-rose-100/50 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">thumb_up</span>
                                    {fase2Translations[lang].spotifyVoteBtn} ({track.votes})
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSpotifySuggest(track)}
                                    disabled={suggestingTrackId === track.id}
                                    className="bg-rose-700 text-white px-4 py-1.5 rounded-full font-body text-xs font-semibold hover:bg-rose-800 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {fase2Translations[lang].spotifySuggestBtn}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-xs text-slate-500 py-4">No se encontraron resultados.</p>
                        )}
                      </div>
                    )}

                    {/* Guest's Suggestions List */}
                    {mySuggestions.length > 0 && (
                      <div className="flex flex-col gap-3 mt-2 border-t border-rose-100/50 pt-4">
                        <h4 className="font-display text-sm font-semibold text-rose-900 uppercase tracking-widest">{fase2Translations[lang].spotifyMySuggestions}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {mySuggestions.map((s) => (
                            <div key={s.id} className="bg-white/40 border border-white/50 rounded-xl p-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-body text-xs font-semibold text-slate-800 truncate">{s.trackName}</p>
                                <p className="font-body text-[10px] text-slate-500 truncate">
                                  {s.artistName}{s.releaseYear ? ` • ${s.releaseYear}` : ''}
                                </p>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${s.status === 'APPROVED'
                                  ? 'bg-green-100 text-green-800'
                                  : s.status === 'REJECTED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                {s.status === 'APPROVED' ? 'Aprobada' : s.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* DRIVE TAB */}
                {experienceTab === 'drive' && (
                  <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                    <div
                      onClick={() => document.getElementById('drive-file-input')?.click()}
                      className="border-2 border-dashed border-rose-200/50 rounded-2xl p-8 md:p-12 text-center hover:border-rose-700 hover:bg-white/30 cursor-pointer transition-all flex flex-col items-center gap-4"
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (e.dataTransfer.files) {
                          handleDriveUpload(e.dataTransfer.files)
                        }
                      }}
                    >
                      <input
                        id="drive-file-input"
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => handleDriveUpload(e.target.files)}
                        disabled={isDriveUploading}
                      />
                      <span className="material-symbols-outlined text-rose-700 text-5xl">cloud_upload</span>
                      <p className="font-body text-slate-700 font-semibold text-sm">
                        {fase2Translations[lang].driveDropzoneText}
                      </p>
                      <p className="font-body text-slate-400 text-xs">
                        {fase2Translations[lang].driveMaxSize}
                      </p>
                    </div>

                    {isDriveUploading && (
                      <div className="flex flex-col gap-2 max-w-xs mx-auto w-full">
                        <div className="flex justify-between text-xs text-slate-600 font-semibold">
                          <span>{fase2Translations[lang].driveUploading}</span>
                          <span>{driveProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden border border-slate-100">
                          <div
                            className="bg-rose-700 h-full rounded-full transition-all duration-300"
                            style={{ width: `${driveProgress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {driveMessage.text && (
                      <div className={`p-4 rounded-xl text-center text-xs font-semibold max-w-md mx-auto w-full ${driveMessage.isError ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
                        }`}>
                        {driveMessage.text}
                      </div>
                    )}
                  </div>
                )}

                {/* ANECDOTES TAB */}
                {experienceTab === 'anecdotes' && (
                  <div className="flex flex-col gap-8 animate-in fade-in duration-300">
                    <form onSubmit={handleAnecdoteSubmit} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <textarea
                          value={anecdoteText}
                          onChange={(e) => setAnecdoteText(e.target.value)}
                          placeholder={fase2Translations[lang].anecdotePlaceholder}
                          rows={3}
                          className="w-full bg-white/70 border border-rose-200/50 rounded-2xl px-5 py-3 font-body text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                          required
                          disabled={isAnecdoteSubmitting}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <label className="flex items-center gap-2 text-xs text-slate-650 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={anecdoteAnonymous}
                            onChange={(e) => setAnecdoteAnonymous(e.target.checked)}
                            className="rounded text-rose-700 focus:ring-rose-500 h-4 w-4 border-slate-300"
                            disabled={isAnecdoteSubmitting}
                          />
                          Enviar de forma anónima
                        </label>

                        <button
                          type="submit"
                          className="bg-rose-700 text-white px-6 py-2.5 rounded-full font-body text-xs uppercase tracking-wider font-semibold hover:bg-rose-800 transition-colors shadow-sm cursor-pointer"
                          disabled={isAnecdoteSubmitting || !anecdoteText.trim()}
                        >
                          {isAnecdoteSubmitting ? fase2Translations[lang].anecdoteSending : fase2Translations[lang].anecdoteSendBtn}
                        </button>
                      </div>

                      {anecdoteMessage && (
                        <p className="font-body text-xs text-center text-green-700 font-semibold">{anecdoteMessage}</p>
                      )}
                    </form>

                    {/* Approved anecdotes carousel */}
                    {approvedAnecdotes.length > 0 && (
                      <div className="border-t border-rose-100/50 pt-6 flex flex-col gap-4">
                        <div className="text-center">
                          <h4 className="font-display text-lg text-rose-900">{fase2Translations[lang].anecdoteTitle}</h4>
                          <p className="font-body text-[10px] uppercase tracking-widest text-slate-500">{fase2Translations[lang].anecdoteSubtitle}</p>
                        </div>

                        <div className="relative min-h-[120px] flex items-center justify-center bg-rose-50/20 border border-rose-100/30 rounded-2xl p-6 text-center max-w-xl mx-auto w-full group shadow-sm">
                          <p className="font-body text-slate-700 italic text-sm font-light leading-relaxed max-w-md">
                            &ldquo;{approvedAnecdotes[activeAnecdoteIndex]?.text}&rdquo;
                          </p>
                          <span className="absolute bottom-3 right-4 font-body text-[10px] text-slate-500 font-semibold">
                            — {approvedAnecdotes[activeAnecdoteIndex]?.guest?.partyName || fase2Translations[lang].anecdoteAnonymous}
                          </span>

                          {approvedAnecdotes.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setActiveAnecdoteIndex((prev) => (prev === 0 ? approvedAnecdotes.length - 1 : prev - 1))}
                                className="absolute left-2 w-8 h-8 rounded-full bg-white/60 border border-rose-200 flex items-center justify-center text-rose-800 hover:bg-white transition-all cursor-pointer shadow-sm"
                              >
                                <span className="material-symbols-outlined text-sm">chevron_left</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveAnecdoteIndex((prev) => (prev === approvedAnecdotes.length - 1 ? 0 : prev + 1))}
                                className="absolute right-2 w-8 h-8 rounded-full bg-white/60 border border-rose-200 flex items-center justify-center text-rose-800 hover:bg-white transition-all cursor-pointer shadow-sm"
                              >
                                <span className="material-symbols-outlined text-sm">chevron_right</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full py-12 bg-rose-50/70 border-t border-rose-100 flex flex-col items-center gap-4 px-4 text-center mt-auto">
        <img
          src="/favicon.png"
          alt="Logo"
          className="w-7 h-7 object-contain opacity-75 hover:opacity-100 transition-opacity"
        />
        <div className="font-display text-xl text-rose-800 tracking-wider">Francisco & Alicia</div>
        <p className="font-body text-sm text-slate-500">{translations[lang].footerText}</p>
        <p className="font-body text-xs text-rose-900/60 font-medium tracking-wide flex items-center justify-center gap-1 mt-1">
          <span>{translations[lang].craftedBy}</span>
        </p>
      </footer>
    </div>
  )
}
