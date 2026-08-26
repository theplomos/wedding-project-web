import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

function cleanEnv(val?: string): string {
  if (!val) return ''
  return val.trim().replace(/^["']|["']$/g, '')
}

type CloudinaryResource = {
  public_id: string
  secure_url: string
  resource_type: 'image' | 'video'
  format: string
  bytes: number
  created_at: string
  folder: string
  guestName: string
  display_name?: string
}

function guestFromPublicId(publicId: string): string {
  const rest = publicId.replace(/^boda_invitados\//, '')
  const lastSlash = rest.lastIndexOf('/')
  return lastSlash > 0 ? rest.slice(0, lastSlash) : ''
}

// Raw shape returned by Cloudinary API (superset of what we expose)
interface CloudinaryRaw {
  public_id: string
  secure_url: string
  resource_type?: string
  format: string
  bytes: number
  created_at: string
  folder?: string
  asset_folder?: string
  display_name?: string
}

// Single call to by_asset_folder — does not filter by resource_type (unsupported param).
// Returns all asset types; caller filters client-side.
async function fetchAllCloudinaryResources(
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  maxResults: number
): Promise<CloudinaryResource[]> {
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  // by_asset_folder works with Dynamic Folders mode (asset_folder field, not public_id prefix)
  const url = new URL(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/by_asset_folder`
  )
  url.searchParams.set('asset_folder', 'boda_invitados')
  url.searchParams.set('max_results', String(maxResults))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message ?? `Cloudinary Admin API error ${res.status}`)
  }
  const data = await res.json() as { resources?: CloudinaryRaw[] }
  return (data.resources ?? []).map((r): CloudinaryResource => ({
    public_id: r.public_id,
    secure_url: r.secure_url,
    resource_type: (r.resource_type === 'video' ? 'video' : 'image'),
    format: r.format,
    bytes: r.bytes,
    created_at: r.created_at,
    folder: r.asset_folder ?? r.folder ?? '',
    guestName: guestFromPublicId(r.public_id),
    display_name: r.display_name,
  }))
}

export async function GET(request: Request) {
  const denied = checkAdmin(request)
  if (denied) return denied

  const cloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME)
  // Use Root key for admin listing — the upload key (CLOUDINARY_API_KEY) has restricted permissions
  const apiKey = cleanEnv(process.env.CLOUDINARY_ADMIN_API_KEY || process.env.CLOUDINARY_API_KEY)
  const apiSecret = cleanEnv(process.env.CLOUDINARY_ADMIN_API_SECRET || process.env.CLOUDINARY_API_SECRET)

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { success: false, error: 'Cloudinary no configurado en el servidor.' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get('type') ?? 'all'
  const maxResults = Math.min(Number(searchParams.get('max_results') ?? '200'), 500)

  try {
    const all = await fetchAllCloudinaryResources(cloudName, apiKey, apiSecret, maxResults)

    const resources = typeParam === 'all'
      ? all
      : all.filter(r => r.resource_type === typeParam)

    // Sort newest first
    resources.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return NextResponse.json({ success: true, resources })
  } catch (error: unknown) {
    console.error('Error fetching Cloudinary resources:', error)
    return NextResponse.json({ success: false, error: 'Error al obtener medios.' }, { status: 500 })
  }
}
