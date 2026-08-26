'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface Guest {
  id: string
  partyName: string
  partySizeMax: number
  status: 'PENDING' | 'RESPONDED'
  notPreloaded: boolean
  createdAt: string
  rsvps: Array<{
    attending: boolean
    numAdults: number
    numKids: number
    kidsNames?: string
    dietary: string
    dietaryNotes?: string
    contribution?: string
    phone?: string | null
    language?: string | null
    submittedAt: string
  }>
  reminderLogs?: Array<{
    wave: string
    sentAt: string
  }>
}

interface Stats {
  totalGuests: number
  respondedGuests: number
  pendingGuests: number
  totalAdultsAttending: number
  totalKidsAttending: number
  dietaryCounts: {
    OMNIVORO: number
    VEGETARIANO: number
    VEGANO: number
    OTRO: number
  }
}

interface ReminderRecipient {
  guestId: string
  partyName: string
  phone: string | null
  language: string
  hasPhone: boolean
  message: string
  waLink: string | null
  sent: boolean
}

type CloudinaryResource = {
  public_id: string
  secure_url: string
  resource_type: 'image' | 'video'
  format: string
  bytes: number
  created_at: string
  folder: string
  guestName?: string
  display_name?: string
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Dashboard Data
  const [guests, setGuests] = useState<Guest[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  
  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'responded' | 'attending' | 'not-attending' | 'not-preloaded'>('all')

  // Phase 2 admin states
  const [adminTab, setAdminTab] = useState<'guests' | 'photos' | 'spotify' | 'anecdotes' | 'reminders'>('guests')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [anecdotes, setAnecdotes] = useState<any[]>([])
  const [spotifySuccess, setSpotifySuccess] = useState<boolean | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [reminderWave, setReminderWave] = useState<'week' | 'day' | 'morning'>('week')
  const [reminders, setReminders] = useState<ReminderRecipient[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)

  // Photos & Videos gallery
  const [mediaResources, setMediaResources] = useState<CloudinaryResource[]>([])
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all')
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set())
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)
  const [guestFilter, setGuestFilter] = useState<string>('all')

  const fetchSpotifySuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/spotify/suggestions')
      const data = await res.json()
      if (data.success) {
        setSuggestions(data.suggestions)
      }
    } catch (e) {
      console.error('Error loading suggestions:', e)
    }
  }, [])

  const fetchAdminAnecdotes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/anecdote')
      const data = await res.json()
      if (data.success) {
        setAnecdotes(data.anecdotes)
      }
    } catch (e) {
      console.error('Error loading anecdotes:', e)
    }
  }, [])

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/admin/data')
      const data = await res.json()

      if (data.success) {
        setGuests(data.guests)
        setStats(data.stats)
        setIsAuthorized(true)

        // Load Phase 2 admin data
        fetchSpotifySuggestions()
        fetchAdminAnecdotes()
      } else {
        setIsAuthorized(false)
      }
    } catch {
      setIsAuthorized(false)
    } finally {
      setIsLoading(false)
    }
  }, [fetchSpotifySuggestions, fetchAdminAnecdotes])

  // Check auth and query params on mount
  useEffect(() => {
    fetchDashboardData()

    const params = new URLSearchParams(window.location.search)
    if (params.get('spotify') === 'success') {
      setSpotifySuccess(true)
      setAdminTab('spotify')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('spotify') === 'error') {
      setSpotifySuccess(false)
      setAdminTab('spotify')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [fetchDashboardData])

  const fetchMedia = useCallback(async (type: 'all' | 'image' | 'video' = 'all') => {
    setMediaLoading(true)
    setMediaError('')
    try {
      const res = await fetch(`/api/admin/media?type=${type}`)
      const data = await res.json()
      if (data.success) {
        setMediaResources(data.resources)
        setGuestFilter('all')
      } else {
        setMediaError(data.error || 'Error al cargar medios.')
      }
    } catch {
      setMediaError('Error de red.')
    } finally {
      setMediaLoading(false)
    }
  }, [])

  const WAVE_LABELS: Record<'week' | 'day' | 'morning', string> = {
    week: '1 semana antes · 11 sep 10:00',
    day: '1 día antes · 17 sep 10:00',
    morning: 'Mañana de la boda · 18 sep 08:00',
  }

  const fetchReminders = useCallback(async (wave: 'week' | 'day' | 'morning') => {
    setRemindersLoading(true)
    try {
      const res = await fetch(`/api/admin/reminders?wave=${wave}`)
      const data = await res.json()
      if (data.success) setReminders(data.recipients)
    } catch (e) {
      console.error('Error loading reminders:', e)
    } finally {
      setRemindersLoading(false)
    }
  }, [])

  const markReminder = useCallback(async (guestId: string, wave: 'week' | 'day' | 'morning', sent: boolean) => {
    setReminders((prev) => prev.map((r) => (r.guestId === guestId ? { ...r, sent } : r)))
    try {
      const res = await fetch('/api/admin/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, wave, sent }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to mark reminder')
      }
    } catch (e) {
      console.error('Error marking reminder:', e)
      // revertir en caso de error
      setReminders((prev) => prev.map((r) => (r.guestId === guestId ? { ...r, sent: !sent } : r)))
    }
  }, [])

  useEffect(() => {
    if (isAuthorized && adminTab === 'reminders') {
      fetchReminders(reminderWave)
    }
  }, [isAuthorized, adminTab, reminderWave, fetchReminders])

  useEffect(() => {
    if (isAuthorized && adminTab === 'photos') {
      fetchMedia(mediaFilter)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, adminTab])

  const uniqueGuests = useMemo(() =>
    [...new Set(mediaResources.map(r => r.guestName || 'Sin nombre'))].sort(),
  [mediaResources])

  const filteredResources = useMemo(() =>
    guestFilter === 'all'
      ? mediaResources
      : mediaResources.filter(r => (r.guestName || 'Sin nombre') === guestFilter),
  [mediaResources, guestFilter])

  const getWhatsAppReminderLink = useCallback((partyName: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const message = `¡Hola ${partyName}! Queremos recordarte confirmar tu asistencia para la boda de Francisco & Alicia. Puedes hacerlo en la web: ${baseUrl} usando tu código de invitación. ¡Te esperamos!`;
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  }, []);

  const handleExportCSV = useCallback(() => {
    const headers = [
      'Invitado / Familia',
      'Limite de Invitados',
      'Estado de Registro',
      'Asiste',
      'Adultos',
      'Ninos',
      'Nombres de Ninos',
      'Preferencia Alimentaria',
      'Alergias / Notas',
      'Contribucion',
      'No Precargado'
    ];

    const rows = guests.map(guest => {
      const rsvp = guest.rsvps[0];
      return [
        `"${guest.partyName.replace(/"/g, '""')}"`,
        guest.partySizeMax,
        guest.status === 'RESPONDED' ? 'Respondido' : 'Pendiente',
        guest.status === 'RESPONDED' && rsvp ? (rsvp.attending ? 'Si' : 'No') : '—',
        guest.status === 'RESPONDED' && rsvp && rsvp.attending ? rsvp.numAdults : 0,
        guest.status === 'RESPONDED' && rsvp && rsvp.attending ? rsvp.numKids : 0,
        guest.status === 'RESPONDED' && rsvp && rsvp.numKids > 0 ? `"${(rsvp.kidsNames || '').replace(/"/g, '""')}"` : '—',
        guest.status === 'RESPONDED' && rsvp && rsvp.attending ? rsvp.dietary : '—',
        guest.status === 'RESPONDED' && rsvp && rsvp.attending ? `"${(rsvp.dietaryNotes || '').replace(/"/g, '""')}"` : '—',
        guest.status === 'RESPONDED' && rsvp ? `"${(rsvp.contribution || '').replace(/"/g, '""')}"` : '—',
        guest.notPreloaded ? 'Si' : 'No'
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `invitados_boda_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [guests]);

  const handleLinkSpotify = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/spotify/login')
      const data = await res.json()
      if (data.success && data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Error al iniciar la vinculación con Spotify.')
      }
    } catch {
      alert('Error de red.')
    }
  }, [])

  const handleApproveSuggestion = useCallback(async (id: string) => {
    setIsActionLoading(true)
    try {
      const res = await fetch('/api/admin/spotify/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ suggestionId: id })
      })
      const data = await res.json()
      if (data.success) {
        fetchSpotifySuggestions()
      } else {
        alert(data.error || 'Error al aprobar.')
      }
    } catch {
      alert('Error de red.')
    } finally {
      setIsActionLoading(false)
    }
  }, [fetchSpotifySuggestions])

  const handleRejectSuggestion = useCallback(async (id: string) => {
    setIsActionLoading(true)
    try {
      const res = await fetch('/api/admin/spotify/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ suggestionId: id })
      })
      const data = await res.json()
      if (data.success) {
        fetchSpotifySuggestions()
      } else {
        alert(data.error || 'Error al rechazar.')
      }
    } catch {
      alert('Error de red.')
    } finally {
      setIsActionLoading(false)
    }
  }, [fetchSpotifySuggestions])

  const handleToggleAnecdoteApproval = useCallback(async (id: string, currentApproved: boolean) => {
    setIsActionLoading(true)
    try {
      const res = await fetch('/api/admin/anecdote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, approved: !currentApproved })
      })
      const data = await res.json()
      if (data.success) {
        fetchAdminAnecdotes()
      } else {
        alert(data.error || 'Error al moderar.')
      }
    } catch {
      alert('Error de red.')
    } finally {
      setIsActionLoading(false)
    }
  }, [fetchAdminAnecdotes])

  const handleDeleteAnecdote = useCallback(async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta anécdota permanentemente?')) return
    setIsActionLoading(true)
    try {
      const res = await fetch(`/api/admin/anecdote?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        fetchAdminAnecdotes()
      } else {
        alert(data.error || 'Error al eliminar.')
      }
    } catch {
      alert('Error de red.')
    } finally {
      setIsActionLoading(false)
    }
  }, [fetchAdminAnecdotes])

  const handleDownloadSingle = useCallback(async (resource: CloudinaryResource) => {
    const res = await fetch(resource.secure_url)
    const blob = await res.blob()
    const randomId = resource.public_id.split('/').pop() ?? 'archivo'
    const prefix = resource.guestName ? resource.guestName.replace(/[^\w\-]/g, '_') + '_' : ''
    const filename = prefix + randomId + '.' + resource.format
    saveAs(blob, filename)
  }, [])

  const handleBatchDownload = useCallback(async () => {
    if (selectedMedia.size === 0) return
    setIsBatchDownloading(true)
    try {
      const zip = new JSZip()
      const selected = mediaResources.filter(r => selectedMedia.has(r.public_id))
      await Promise.all(selected.map(async (resource) => {
        const res = await fetch(resource.secure_url)
        const blob = await res.blob()
        const randomId = resource.public_id.split('/').pop() ?? 'archivo'
        const prefix = resource.guestName ? resource.guestName.replace(/[^\w\-]/g, '_') + '_' : ''
        const filename = prefix + randomId + '.' + resource.format
        zip.file(filename, blob)
      }))
      const content = await zip.generateAsync({ type: 'blob' })
      saveAs(content, `boda_fotos_${new Date().toISOString().slice(0, 10)}.zip`)
      setSelectedMedia(new Set())
    } finally {
      setIsBatchDownloading(false)
    }
  }, [selectedMedia, mediaResources])

  const handleLoginSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setPassword('')
        await fetchDashboardData()
      } else {
        setAuthError(data.error || 'Contraseña incorrecta.')
      }
    } catch {
      setAuthError('Error de red al iniciar sesión.')
    } finally {
      setIsLoading(false)
    }
  }, [password, fetchDashboardData])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch (e) {
      console.error('Error logging out:', e)
    }
    setIsAuthorized(false)
    setPassword('')
    setGuests([])
    setStats(null)
  }, [])

  const filteredGuests = useMemo(() => guests.filter(guest => {
    // Search filter
    const matchesSearch = guest.partyName.toLowerCase().includes(searchTerm.toLowerCase())
    if (!matchesSearch) return false

    // Category filter
    const rsvp = guest.rsvps[0]
    switch (filterType) {
      case 'pending':
        return guest.status === 'PENDING'
      case 'responded':
        return guest.status === 'RESPONDED'
      case 'attending':
        return guest.status === 'RESPONDED' && rsvp?.attending === true
      case 'not-attending':
        return guest.status === 'RESPONDED' && rsvp?.attending === false
      case 'not-preloaded':
        return guest.notPreloaded === true
      default:
        return true
    }
  }), [guests, searchTerm, filterType])

  // Login View
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Aurora Background */}
        <div className="aurora-bg">
          <div className="aurora-glow glow-1"></div>
          <div className="aurora-glow glow-2"></div>
        </div>

        <div className="max-w-md w-full glass-card rounded-3xl p-8 text-center flex flex-col gap-6 relative z-10">
          <div className="flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-rose-700 text-5xl">lock</span>
            <h1 className="font-display text-3xl text-rose-900">Panel de Control</h1>
            <p className="font-body text-xs text-slate-500 uppercase tracking-widest">Admin Boda Francisco & Alicia</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col text-left gap-1">
              <label htmlFor="adminPassword" className="font-body text-xs text-slate-600 uppercase tracking-widest font-semibold ml-1">Contraseña de Admin</label>
              <input
                id="adminPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Introduce la contraseña"
                className="w-full bg-white/70 border border-rose-200/50 rounded-full px-5 py-3 font-body text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                disabled={isLoading}
                required
              />
            </div>
            {authError && (
              <p className="font-body text-xs text-red-600">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-rose-700 text-white rounded-full py-3.5 font-body tracking-wider text-sm font-semibold hover:bg-rose-800 transition-colors shadow-md cursor-pointer"
              disabled={isLoading}
            >
              {isLoading ? 'Accediendo...' : 'Entrar al Panel'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Dashboard View
  return (
    <div className="min-h-screen bg-rose-50/30 flex flex-col font-body">
      
      {/* Top Header */}
      <header className="bg-white border-b border-rose-100 px-6 py-4 shadow-sm sticky top-0 z-45">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-rose-700 text-3xl">dashboard</span>
            <div>
              <h1 className="font-display text-xl text-rose-900 font-bold">Panel de Control</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Boda Francisco & Alicia</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-slate-500 hover:text-rose-700 text-sm font-medium border border-slate-200 rounded-full px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">logout</span> Salir
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-6 md:p-8 flex flex-col gap-8">
        
        {/* Tab Selection */}
        <div className="flex bg-white border border-rose-100 rounded-2xl p-1.5 self-start max-w-2xl w-full shadow-sm">
          {(['guests', 'photos', 'spotify', 'anecdotes', 'reminders'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setAdminTab(tab)}
              className={`flex-1 py-2.5 text-center rounded-xl font-body text-xs font-bold transition-all cursor-pointer ${
                adminTab === tab
                  ? 'bg-rose-700 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-rose-50/20'
              }`}
            >
              {tab === 'guests'
                ? '👥 Invitados'
                : tab === 'photos'
                ? '📷 Fotos'
                : tab === 'spotify'
                ? '🎵 Spotify'
                : tab === 'anecdotes'
                ? '💬 Anécdotas'
                : '🔔 Recordatorios'}
            </button>
          ))}
        </div>
        
        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total RSVP Responses */}
            <div className="bg-white border border-rose-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-700">
                <span className="material-symbols-outlined text-2xl">people</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Confirmaciones</p>
                <p className="text-2xl font-bold text-slate-800">{stats.respondedGuests} / {stats.totalGuests}</p>
                <p className="text-[10px] text-slate-400">({stats.pendingGuests} pendientes)</p>
              </div>
            </div>

            {/* Total Adults Attending */}
            <div className="bg-white border border-rose-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-700">
                <span className="material-symbols-outlined text-2xl">family_restroom</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Adultos Confirmados</p>
                <p className="text-2xl font-bold text-slate-800">{stats.totalAdultsAttending}</p>
                <p className="text-[10px] text-slate-400">Asistencia confirmada</p>
              </div>
            </div>

            {/* Total Kids Attending */}
            <div className="bg-white border border-rose-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-700">
                <span className="material-symbols-outlined text-2xl">child_care</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Niños Confirmados</p>
                <p className="text-2xl font-bold text-slate-800">{stats.totalKidsAttending}</p>
                <p className="text-[10px] text-slate-400">Asistencia confirmada</p>
              </div>
            </div>

            {/* Dietary Preference Summary */}
            <div className="bg-white border border-rose-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Restricciones Dieta</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Omní:</span>
                  <span className="font-bold text-slate-800">{stats.dietaryCounts.OMNIVORO}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vege:</span>
                  <span className="font-bold text-slate-800">{stats.dietaryCounts.VEGETARIANO}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vega:</span>
                  <span className="font-bold text-slate-800">{stats.dietaryCounts.VEGANO}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Otro:</span>
                  <span className="font-bold text-slate-800">{stats.dietaryCounts.OTRO}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {adminTab === 'photos' && (
          <section className="flex flex-col gap-6">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex bg-white border border-rose-100 rounded-xl p-1 gap-1 shadow-sm">
                {(['all', 'image', 'video'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setMediaFilter(f); fetchMedia(f) }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      mediaFilter === f ? 'bg-rose-700 text-white shadow-sm' : 'text-slate-600 hover:bg-rose-50'
                    }`}
                  >
                    {f === 'all' ? '📁 Todos' : f === 'image' ? '🖼 Fotos' : '🎥 Videos'}
                  </button>
                ))}
              </div>
              {uniqueGuests.length > 0 && (
                <select
                  value={guestFilter}
                  onChange={e => setGuestFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-300"
                >
                  <option value="all">Todos los invitados</option>
                  {uniqueGuests.map(g => (
                    <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {selectedMedia.size > 0 && (
                  <span className="text-xs text-slate-500">{selectedMedia.size} seleccionados</span>
                )}
                <button
                  onClick={() => setSelectedMedia(new Set(filteredResources.map(r => r.public_id)))}
                  className="text-xs text-slate-600 hover:text-rose-700 border border-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Seleccionar todos
                </button>
                <button
                  onClick={() => setSelectedMedia(new Set())}
                  className="text-xs text-slate-600 hover:text-rose-700 border border-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Limpiar
                </button>
                <button
                  onClick={handleBatchDownload}
                  disabled={selectedMedia.size === 0 || isBatchDownloading}
                  className="flex items-center gap-1.5 bg-rose-700 text-white text-xs font-bold rounded-full px-4 py-2 hover:bg-rose-800 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  {isBatchDownloading ? 'Descargando...' : 'Descargar lote'}
                </button>
              </div>
            </div>

            {mediaLoading && (
              <p className="text-sm text-slate-500 text-center py-12">Cargando medios...</p>
            )}
            {mediaError && (
              <p className="text-sm text-red-600 text-center py-4">{mediaError}</p>
            )}

            {!mediaLoading && !mediaError && mediaResources.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-5xl">photo_library</span>
                <p className="mt-2 text-sm">No hay medios todavía.</p>
              </div>
            )}

            {!mediaLoading && filteredResources.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredResources.map((resource) => {
                    const isSelected = selectedMedia.has(resource.public_id)
                    const guestFolder = resource.guestName || 'Sin nombre'
                    return (
                      <div
                        key={resource.public_id}
                        className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
                          isSelected ? 'border-rose-600 shadow-md' : 'border-transparent hover:border-rose-200'
                        }`}
                        onClick={() =>
                          setSelectedMedia(prev => {
                            const next = new Set(prev)
                            if (next.has(resource.public_id)) next.delete(resource.public_id)
                            else next.add(resource.public_id)
                            return next
                          })
                        }
                      >
                        {resource.resource_type === 'image' ? (
                          <img
                            src={resource.secure_url}
                            alt={resource.display_name ?? resource.public_id}
                            className="w-full aspect-square object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={resource.secure_url}
                            className="w-full aspect-square object-cover"
                            muted
                            playsInline
                            onMouseOver={e => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                            onMouseOut={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                          />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                        <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-rose-600 border-rose-600'
                            : 'bg-white/80 border-white/80 opacity-0 group-hover:opacity-100'
                        }`}>
                          {isSelected && <span className="material-symbols-outlined text-white text-xs">check</span>}
                        </div>
                        <div className="absolute top-2 right-2">
                          <span className="text-xs bg-black/50 text-white rounded-full px-2 py-0.5">
                            {resource.resource_type === 'video' ? '🎥' : '🖼'}
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-all flex items-end justify-between">
                          <p className="text-white text-[10px] truncate max-w-[80%]">{guestFolder}</p>
                          <button
                            onClick={e => { e.stopPropagation(); handleDownloadSingle(resource) }}
                            className="text-white hover:text-rose-300 transition-colors cursor-pointer"
                            title="Descargar"
                          >
                            <span className="material-symbols-outlined text-base">download</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-400 text-center">{filteredResources.length}{guestFilter !== 'all' ? ` de ${mediaResources.length}` : ''} archivos</p>
              </>
            )}
          </section>
        )}

        {adminTab === 'guests' && (
          /* Filter and Table Card */
          <div className="bg-white border border-rose-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            
            {/* Filters Area */}
            <div className="border-b border-rose-50 p-6 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:max-w-xl">
                {/* Search Input */}
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar invitado por nombre..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 bg-slate-50/50"
                  />
                </div>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-700 text-white rounded-full text-xs font-bold hover:bg-rose-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span> Exportar a CSV
                </button>
              </div>
              
              {/* Category Filter buttons */}
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'pending', label: 'Pendientes' },
                  { id: 'responded', label: 'Respondieron' },
                  { id: 'attending', label: 'Asisten' },
                  { id: 'not-attending', label: 'No Asisten' },
                  { id: 'not-preloaded', label: 'No Precargados' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilterType(f.id as any)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      filterType === f.id
                        ? 'bg-rose-700 text-white border-rose-800 shadow-sm'
                        : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table Container */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-rose-50/40 text-rose-900 border-b border-rose-100 font-semibold text-xs uppercase tracking-wider">
                    <th className="px-6 py-4">Invitado / Familia</th>
                    <th className="px-6 py-4">Límite</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Asistencia</th>
                    <th className="px-6 py-4">Adultos / Niños</th>
                    <th className="px-6 py-4">Dieta</th>
                    <th className="px-6 py-4">Alergias / Notas</th>
                    <th className="px-6 py-4">Contribución</th>
                    <th className="px-6 py-4 text-center">Acciones / Recordatorio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50 text-sm text-slate-700">
                  {filteredGuests.length > 0 ? (
                    filteredGuests.map(guest => {
                      const rsvp = guest.rsvps[0]
                      return (
                        <tr key={guest.id} className="hover:bg-rose-50/10 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-900">{guest.partyName}</span>
                            {guest.notPreloaded && (
                              <span className="ml-2 inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-semibold rounded-full">
                                No precargado
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono">{guest.partySizeMax}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              guest.status === 'RESPONDED'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {guest.status === 'RESPONDED' ? 'Respondido' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {guest.status === 'RESPONDED' && rsvp ? (
                              <span className={`font-semibold ${rsvp.attending ? 'text-green-600' : 'text-red-600'}`}>
                                {rsvp.attending ? 'Sí asiste' : 'No asiste'}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {guest.status === 'RESPONDED' && rsvp && rsvp.attending ? (
                              <span>
                                Ad: <strong className="text-slate-900">{rsvp.numAdults}</strong> / Niñ: <strong className="text-slate-900">{rsvp.numKids}</strong>
                                {rsvp.numKids > 0 && rsvp.kidsNames && (
                                  <span className="block text-[11px] text-slate-500 font-light truncate max-w-xs" title={rsvp.kidsNames}>
                                    ({rsvp.kidsNames})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 uppercase font-mono text-xs">
                            {guest.status === 'RESPONDED' && rsvp && rsvp.attending ? (
                              rsvp.dietary === 'OMNIVORO' ? 'Omnívoro' : rsvp.dietary === 'VEGETARIANO' ? 'Vegetariano' : rsvp.dietary === 'VEGANO' ? 'Vegano' : 'Otro'
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 max-w-xs truncate" title={rsvp?.dietaryNotes || ''}>
                            {guest.status === 'RESPONDED' && rsvp && rsvp.attending && rsvp.dietaryNotes ? (
                              <span className="text-slate-600 italic">{rsvp.dietaryNotes}</span>
                            ) : (
                              <span className="text-slate-400 font-light">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 max-w-xs truncate" title={rsvp?.contribution || ''}>
                            {guest.status === 'RESPONDED' && rsvp && rsvp.contribution ? (
                              <span className="text-slate-800">{rsvp.contribution}</span>
                            ) : (
                              <span className="text-slate-400 font-light">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            {guest.status === 'PENDING' ? (
                              <a
                                href={getWhatsAppReminderLink(guest.partyName)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 hover:bg-green-100 transition-colors cursor-pointer"
                              >
                                Recordar por WA
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium italic">✓ Respondido</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-400">
                        No se encontraron invitados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="border-t border-rose-50 p-4 bg-slate-50/50 text-xs text-slate-400 flex justify-between items-center">
              <p>Mostrando {filteredGuests.length} de {guests.length} invitados.</p>
              <p>Boda Francisco & Alicia - Freiburg 2026</p>
            </div>
          </div>
        )}

        {adminTab === 'spotify' && (
          <div className="bg-white border border-rose-100 rounded-2xl shadow-sm overflow-hidden flex flex-col p-6 gap-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-rose-50 pb-4">
              <div>
                <h2 className="font-display text-xl text-rose-900 font-bold">Sugerencias de Música</h2>
                <p className="text-xs text-slate-400">Vea y apruebe las canciones sugeridas por los invitados para la playlist de Spotify.</p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleLinkSpotify}
                  className="bg-green-700 text-white font-body text-xs font-semibold px-4 py-2.5 rounded-full hover:bg-green-800 transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">sync</span> Vincular Spotify
                </button>
              </div>
            </div>

            {spotifySuccess === true && (
              <div className="p-4 bg-green-50 text-green-800 border border-green-200 rounded-xl text-xs font-semibold">
                ¡Cuenta de Spotify vinculada exitosamente! El refresh token se ha guardado de forma segura en la base de datos.
              </div>
            )}
            {spotifySuccess === false && (
              <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-semibold">
                Error al vincular con Spotify. Verifica las credenciales SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-rose-50/40 text-rose-900 border-b border-rose-100 font-semibold text-xs uppercase tracking-wider">
                    <th className="px-6 py-4">Canción</th>
                    <th className="px-6 py-4">Artista</th>
                    <th className="px-6 py-4">Sugerida Por</th>
                    <th className="px-6 py-4 text-center">Votos</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50 text-sm text-slate-700">
                  {suggestions.length > 0 ? (
                    suggestions.map((s) => (
                      <tr key={s.id} className="hover:bg-rose-50/10 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900">{s.trackName}</td>
                        <td className="px-6 py-4">{s.artistName}{s.releaseYear ? ` (${s.releaseYear})` : ''}</td>
                        <td className="px-6 py-4">{s.guest?.partyName || 'Invitado'}</td>
                        <td className="px-6 py-4 text-center font-bold font-mono">{s.votes}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'APPROVED'
                              ? 'bg-green-100 text-green-800'
                              : s.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {s.status === 'APPROVED' ? 'Aprobada' : s.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {s.status === 'PENDING' && (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleRejectSuggestion(s.id)}
                                disabled={isActionLoading}
                                className="border border-red-300 text-red-700 hover:bg-red-50 text-xs px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer"
                              >
                                Rechazar
                              </button>
                              <button
                                onClick={() => handleApproveSuggestion(s.id)}
                                disabled={isActionLoading}
                                className="bg-rose-700 text-white hover:bg-rose-800 text-xs px-3.5 py-1.5 rounded-full font-semibold transition-colors cursor-pointer shadow-sm"
                              >
                                Aprobar
                              </button>
                            </div>
                          )}
                          {s.status === 'APPROVED' && (
                            <span className="text-xs text-slate-400 italic">Enviada a Playlist</span>
                          )}
                          {s.status === 'REJECTED' && (
                            <span className="text-xs text-slate-400 italic">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No hay canciones sugeridas todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === 'anecdotes' && (
          <div className="bg-white border border-rose-100 rounded-2xl shadow-sm overflow-hidden flex flex-col p-6 gap-6">
            <div>
              <h2 className="font-display text-xl text-rose-900 font-bold">Moderación de Anécdotas</h2>
              <p className="text-xs text-slate-400">Moderación y lectura de anécdotas compartidas por los invitados.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-rose-50/40 text-rose-900 border-b border-rose-100 font-semibold text-xs uppercase tracking-wider">
                    <th className="px-6 py-4">Autor</th>
                    <th className="px-6 py-4 w-1/2">Anécdota</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50 text-sm text-slate-700">
                  {anecdotes.length > 0 ? (
                    anecdotes.map((a) => (
                      <tr key={a.id} className="hover:bg-rose-50/10 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {a.guest?.partyName || <span className="text-slate-400 italic">Anónimo</span>}
                        </td>
                        <td className="px-6 py-4 text-slate-600 italic leading-relaxed whitespace-pre-line">&ldquo;{a.text}&rdquo;</td>
                        <td className="px-6 py-4 text-xs font-mono">{new Date(a.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            a.approved ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {a.approved ? 'Aprobada (Pública)' : 'Privada / Oculta'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleToggleAnecdoteApproval(a.id, a.approved)}
                              disabled={isActionLoading}
                              className={`border text-xs px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer ${
                                a.approved 
                                  ? 'border-slate-300 text-slate-700 hover:bg-slate-50' 
                                  : 'border-green-300 text-green-700 hover:bg-green-50'
                              }`}
                            >
                              {a.approved ? 'Ocultar' : 'Aprobar'}
                            </button>
                            <button
                              onClick={() => handleDeleteAnecdote(a.id)}
                              disabled={isActionLoading}
                              className="border border-red-300 text-red-700 hover:bg-red-50 text-xs px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">
                        No hay anécdotas escritas todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === 'reminders' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {(['week', 'day', 'morning'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setReminderWave(w)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    reminderWave === w ? 'bg-rose-700 text-white shadow-sm' : 'bg-slate-200/60 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {WAVE_LABELS[w]}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                {reminders.filter((r) => r.sent).length} / {reminders.length} enviados ·{' '}
                {reminders.filter((r) => !r.hasPhone).length} sin teléfono
              </p>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-green-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${reminders.length > 0 ? (reminders.filter((r) => r.sent).length / reminders.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {remindersLoading ? (
              <p className="text-sm text-slate-500">Cargando…</p>
            ) : (
              <div className="flex flex-col gap-2">
                {reminders.map((r) => (
                  <div
                    key={r.guestId}
                    className={`flex flex-col gap-2 rounded-2xl border p-4 ${
                      r.sent ? 'border-green-300 bg-green-50/40' : 'border-rose-200/50 bg-white/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">{r.partyName}</p>
                        <p className="text-xs text-slate-500">
                          {r.language?.toUpperCase()} · {r.phone || 'sin teléfono'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.hasPhone && r.waLink ? (
                          <a
                            href={r.waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            Abrir WhatsApp
                          </a>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-4 py-2 text-xs text-slate-500">
                            Falta teléfono
                          </span>
                        )}
                        <button
                          onClick={() => markReminder(r.guestId, reminderWave, !r.sent)}
                          className={`rounded-full px-4 py-2 text-xs font-semibold cursor-pointer ${
                            r.sent ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-rose-700 text-white hover:bg-rose-800'
                          }`}
                        >
                          {r.sent ? 'Marcar pendiente' : 'Marcar enviado'}
                        </button>
                      </div>
                    </div>
                    <details className="text-xs text-slate-600">
                      <summary className="cursor-pointer select-none font-medium">Ver mensaje</summary>
                      <div className="mt-3 flex justify-end">
                        <div className="relative max-w-xs rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-3 shadow-sm text-sm text-slate-800 font-[system-ui,sans-serif] leading-snug whitespace-pre-wrap break-words">
                          {r.message.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                            /^https?:\/\//.test(part) ? (
                              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#0c6aab] underline break-all">{part}</a>
                            ) : part
                          )}
                          <span className="mt-1 block text-right text-[10px] text-slate-400">
                            {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} ✓✓
                          </span>
                        </div>
                      </div>
                    </details>
                  </div>
                ))}
                {reminders.length === 0 && (
                  <p className="text-sm text-slate-500">No hay asistentes confirmados todavía.</p>
                )}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
