"use client"
import React, { useEffect, useRef, useState } from 'react'
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Mirror the bucket rules (migration 20): 5 MB, these image types only.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
// The stored extension comes from the VALIDATED type, never from the
// user-supplied file name (QA Round 3, adversarial F8 / profile L1).
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

function initialsOf(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "—"
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
}

// Extract the storage object path from a public avatars-bucket URL.
function pathFromAvatarUrl(url: string | null): string | null {
  if (!url) return null
  const marker = "/storage/v1/object/public/avatars/"
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

// Downscale large photos before upload (QA Round 3, perf P-7): avatars
// render at 36–96px, so a multi-MB phone photo is pure waste on every
// list that shows it. Best-effort — any failure falls back to the
// original file. GIFs are left untouched (canvas would flatten them).
async function downscaleAvatar(file: File): Promise<File> {
  if (file.type === "image/gif" || typeof createImageBitmap === "undefined") return file
  try {
    const bitmap = await createImageBitmap(file)
    const MAX_DIM = 512
    if (bitmap.width <= MAX_DIM && bitmap.height <= MAX_DIM) return file
    const scale = MAX_DIM / Math.max(bitmap.width, bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === "image/png" ? "image/png" : "image/jpeg", 0.9)
    )
    if (!blob) return file
    return new File([blob], file.name, { type: blob.type })
  } catch {
    return file
  }
}

export function AvatarUploader({
  uid,
  url,
  onUpload,
  name,
}: {
  uid: string
  url: string | null
  onUpload: (url: string) => void
  /** The user's name — the fallback tile shows their initials, never a placeholder letter. */
  name?: string | null
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(url)
  const [error, setError] = useState<string | null>(null)
  const currentPathRef = useRef<string | null>(pathFromAvatarUrl(url))

  // Keep the preview in sync if the parent value changes (profile L1).
  useEffect(() => {
    setAvatarUrl(url)
    currentPathRef.current = pathFromAvatarUrl(url)
  }, [url])

  const uploadAvatar: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    setError(null)
    const input = event.target
    try {
      setUploading(true)

      if (!input.files || input.files.length === 0) {
        throw new Error('You must select an image to upload.')
      }

      const original = input.files[0]
      // Client-side validation matching the bucket rules, so the failure
      // is explained before the upload is attempted.
      if (!ALLOWED_AVATAR_TYPES.includes(original.type)) {
        throw new Error('Please choose a PNG, JPG, WebP or GIF image.')
      }
      if (original.size > MAX_AVATAR_BYTES) {
        throw new Error('That image is larger than 5 MB. Please choose a smaller one.')
      }

      const file = await downscaleAvatar(original)
      const fileExt = EXT_BY_TYPE[file.type] || "png"
      // Owner-scoped storage policies match on the "<uid>-" filename prefix.
      const filePath = `${uid}-${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const previousPath = currentPathRef.current
      setAvatarUrl(data.publicUrl)
      currentPathRef.current = filePath
      onUpload(data.publicUrl)

      // Remove the superseded object (QA Round 3, profile H4): uploads
      // used to accumulate orphaned photos in a public bucket forever.
      // Best-effort — a failed cleanup never fails the upload.
      if (previousPath && previousPath !== filePath) {
        supabase.storage.from('avatars').remove([previousPath]).catch(() => {})
      }
    } catch (e: unknown) {
      // Inline error under the button — never a bare alert(), and raw
      // storage errors never reach the user.
      const isFriendly = e instanceof Error && (
        e.message.startsWith('You must') || e.message.startsWith('Please choose') || e.message.startsWith('That image')
      )
      if (isFriendly) {
        setError((e as Error).message)
      } else {
        console.error('Avatar upload failed:', e)
        setError('The photo could not be uploaded. Please try again.')
      }
    } finally {
      setUploading(false)
      // Reset the input so picking the SAME file again re-fires onChange
      // (profile L1) — without this, a retry after a failed upload
      // appears to do nothing.
      input.value = ""
    }
  }

  return (
    <div className="flex items-center gap-6">
      <Avatar className="h-24 w-24">
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback className="bg-brand-text font-bold text-white">{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <div>
        <label className="cursor-pointer" htmlFor="avatar-file">
          {/* The input is sr-only, NOT display:none (QA Round 3,
              accessibility A1): a display:none file input is removed
              from the tab order, so keyboard users could not upload a
              photo at all. It precedes the span so peer-focus-visible
              can style the visible button when the input has focus. */}
          <input
            className="peer sr-only"
            type="file"
            id="avatar-file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={uploadAvatar}
            disabled={uploading}
            aria-label="Upload a profile photo"
          />
          <span className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
            {uploading ? 'Uploading…' : 'Upload Avatar'}
          </span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to 5 MB.</p>
        {error && (
          <p role="alert" className="mt-1.5 max-w-[260px] text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
