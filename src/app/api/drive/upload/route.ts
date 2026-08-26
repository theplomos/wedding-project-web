import { NextResponse } from 'next/server'
import { checkGuestSession } from '@/lib/auth'
import crypto from 'crypto'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

const ALLOWED_MIME_PREFIXES = ['image/', 'video/']
const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
  'mp4', 'mov', 'webm', 'avi', 'm4v', 'mpeg', 'mpg'
]


function cleanEnv(val?: string): string {
  if (!val) return ''
  return val.trim().replace(/^["']|["']$/g, '')
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, 'drive-upload', RATE_LIMITS.driveUpload.limit, RATE_LIMITS.driveUpload.windowMs)
    if (limited) return limited

    const denied = checkGuestSession(request)
    if (denied) return denied

    const cloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME)
    const apiKey = cleanEnv(process.env.CLOUDINARY_API_KEY)
    const apiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET)
    const uploadPreset = cleanEnv(process.env.CLOUDINARY_UPLOAD_PRESET)

    const canUnsigned = Boolean(cloudName && uploadPreset)
    const canSigned = Boolean(cloudName && apiKey && apiSecret)

    if (!canUnsigned && !canSigned) {
      console.error('Missing Cloudinary configuration.')
      return NextResponse.json(
        { success: false, error: 'La subida a Cloudinary no está configurada.' },
        { status: 500 }
      )
    }

    let body: { fileName?: string; fileType?: string; fileSize?: number; guestName?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Petición inválida. Se esperaba JSON.' },
        { status: 400 }
      )
    }

    const { fileName = 'archivo_sin_nombre.jpg', fileType = '', fileSize = 0, guestName } = body

    if (fileSize > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `El archivo supera el límite de tamaño permitido (${MAX_SIZE_MB}MB).` },
        { status: 400 }
      )
    }

    // Sanitizar nombre de archivo
    const sanitizedFileName = fileName
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\.{2,}/g, '.')
      .trim()
      .slice(0, 120)

    const mimeType = fileType.toLowerCase().trim()
    const extension = sanitizedFileName.split('.').pop()?.toLowerCase() || ''

    const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
    const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'm4v', 'mpeg', 'mpg']

    const isImageExt = IMAGE_EXTENSIONS.includes(extension)
    const isVideoExt = VIDEO_EXTENSIONS.includes(extension)

    if (!isImageExt && !isVideoExt) {
      return NextResponse.json(
        { success: false, error: 'Extensión de archivo no permitida. Solo se aceptan imágenes y videos.' },
        { status: 400 }
      )
    }

    if (mimeType.startsWith('image/') && !isImageExt) {
      return NextResponse.json(
        { success: false, error: 'El tipo de contenido no coincide con la extensión del archivo.' },
        { status: 400 }
      )
    }

    if (mimeType.startsWith('video/') && !isVideoExt) {
      return NextResponse.json(
        { success: false, error: 'El tipo de contenido no coincide con la extensión del archivo.' },
        { status: 400 }
      )
    }

    const isVideo = isVideoExt || mimeType.startsWith('video/')
    const resourceType = isVideo ? 'video' : 'image'

    const sanitizedGuestName = (guestName ?? 'Anonimo')
      .replace(/[^a-zA-Z0-9\-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'Anonimo'
    const uploadFolder = `boda_invitados/${sanitizedGuestName}`
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`

    if (canUnsigned && uploadPreset) {
      return NextResponse.json({
        success: true,
        uploadUrl,
        params: {
          folder: uploadFolder,
          upload_preset: uploadPreset,
        }
      })
    } else {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const paramsToSign = `folder=${uploadFolder}&timestamp=${timestamp}`
      const signature = crypto
        .createHash('sha1')
        .update(paramsToSign + apiSecret)
        .digest('hex')

      return NextResponse.json({
        success: true,
        uploadUrl,
        params: {
          api_key: apiKey,
          timestamp,
          signature,
          folder: uploadFolder,
        }
      })
    }

  } catch (error: any) {
    console.error('Error al solicitar firma de subida:', error)
    return NextResponse.json(
      { success: false, error: 'Ocurrió un error al preparar la subida.' },
      { status: 500 }
    )
  }
}
