import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/drive/upload/route'
import { signGuestSession, GUEST_SESSION_COOKIE } from '@/lib/auth'
import { resetRateLimitStore } from '@/lib/rate-limit'

describe('Drive Upload Endpoint Security (/api/drive/upload)', () => {
  const SESSION_SECRET = 'test-secret-32-chars-minimum-drive-ok!'

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET)
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud')
    vi.stubEnv('CLOUDINARY_UPLOAD_PRESET', 'test-preset')
    vi.stubEnv('NODE_ENV', 'test')
    resetRateLimitStore()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function createUploadRequest(body: Record<string, unknown>, cookieToken?: string): Request {
    const token = cookieToken ?? signGuestSession()
    return new Request('http://localhost/api/drive/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `${GUEST_SESSION_COOKIE}=${token}`,
      },
      body: JSON.stringify(body),
    })
  }

  it('rejects unauthenticated requests with 401', async () => {
    const req = new Request('http://localhost/api/drive/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', fileSize: 1024 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects disallowed file extensions (e.g. .exe, .sh, .php)', async () => {
    const reqExe = createUploadRequest({
      fileName: 'malware.exe',
      fileType: 'application/x-msdownload',
      fileSize: 1024,
    })
    const resExe = await POST(reqExe)
    expect(resExe.status).toBe(400)
    const bodyExe = await resExe.json()
    expect(bodyExe.success).toBe(false)

    const reqSh = createUploadRequest({
      fileName: 'script.sh',
      fileType: 'text/x-sh',
      fileSize: 1024,
    })
    const resSh = await POST(reqSh)
    expect(resSh.status).toBe(400)
  })

  it('rejects MIME type / extension mismatch (e.g. .exe disguised as image/jpeg)', async () => {
    const reqDisguised = createUploadRequest({
      fileName: 'payload.exe',
      fileType: 'image/jpeg',
      fileSize: 1024,
    })
    const res = await POST(reqDisguised)
    expect(res.status).toBe(400)
  })

  it('rejects files exceeding max size limit', async () => {
    const reqTooLarge = createUploadRequest({
      fileName: 'large_video.mp4',
      fileType: 'video/mp4',
      fileSize: 60 * 1024 * 1024, // 60MB > 50MB limit
    })
    const res = await POST(reqTooLarge)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('supera el límite de tamaño permitido')
  })

  it('allows valid image uploads and returns upload URL & preset parameters', async () => {
    const reqValid = createUploadRequest({
      fileName: 'familia_foto.png',
      fileType: 'image/png',
      fileSize: 2 * 1024 * 1024,
      guestName: 'Familia Perez',
    })
    const res = await POST(reqValid)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.uploadUrl).toContain('https://api.cloudinary.com/v1_1/test-cloud/image/upload')
    expect(body.params.folder).toBe('boda_invitados/Familia_Perez')
    expect(body.params.upload_preset).toBe('test-preset')
  })

  it('sanitizes guestName and filename with path traversal characters', async () => {
    const reqTraversal = createUploadRequest({
      fileName: '../../../etc/passwd.jpg',
      fileType: 'image/jpeg',
      fileSize: 1024,
      guestName: '../../hackers/admin',
    })
    const res = await POST(reqTraversal)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.params.folder).not.toContain('..')
  })
})
