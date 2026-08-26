import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getBaseUrl, getSpotifyRedirectUri } from '../base-url'

describe('Base URL & Spotify Redirect URI (base-url)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses NEXT_PUBLIC_APP_URL when defined', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://wedding-project-web.vercel.app')
    const req = new Request('http://localhost:3000/api/test')
    expect(getBaseUrl(req)).toBe('https://wedding-project-web.vercel.app')
    expect(getSpotifyRedirectUri(req)).toBe('https://wedding-project-web.vercel.app/api/admin/spotify/callback')
  })

  it('strips trailing slash from NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://wedding-project-web.vercel.app///')
    const req = new Request('http://localhost:3000/api/test')
    expect(getBaseUrl(req)).toBe('https://wedding-project-web.vercel.app')
  })

  it('uses VERCEL_PROJECT_PRODUCTION_URL when NEXT_PUBLIC_APP_URL is not set', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'wedding-portal.vercel.app')
    const req = new Request('http://localhost:3000/api/test')
    expect(getBaseUrl(req)).toBe('https://wedding-portal.vercel.app')
  })

  it('throws in production when no production environment variable is defined', () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    const req = new Request('https://malicious-host.com/api/test', {
      headers: { host: 'malicious-host.com' },
    })
    expect(() => getBaseUrl(req)).toThrow(
      'NEXT_PUBLIC_APP_URL o VERCEL_PROJECT_PRODUCTION_URL es obligatorio en producción'
    )
  })

  it('allows localhost and 127.0.0.1 in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    const reqLocal = new Request('http://localhost:3000/api/test', {
      headers: { host: 'localhost:3000' },
    })
    expect(getBaseUrl(reqLocal)).toBe('http://localhost:3000')

    const reqIp = new Request('http://127.0.0.1:3000/api/test', {
      headers: { host: '127.0.0.1:3000' },
    })
    expect(getBaseUrl(reqIp)).toBe('http://127.0.0.1:3000')
  })

  it('defaults untrusted host headers to localhost:3000 in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    const reqUntrusted = new Request('http://evil.com/api/test', {
      headers: { host: 'evil.com' },
    })
    expect(getBaseUrl(reqUntrusted)).toBe('http://localhost:3000')
  })
})
