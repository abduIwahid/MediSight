"use client"
import React, { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Mirror the bucket rules (migration 20): 5 MB, these image types only.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

function initialsOf(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "—"
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
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
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(url)
  const [error, setError] = useState<string | null>(null)

  const uploadAvatar: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    setError(null)
    try {
      setUploading(true)

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.')
      }

      const file = event.target.files[0]
      // Client-side validation matching the bucket rules, so the failure
      // is explained before the upload is attempted.
      if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
        throw new Error('Please choose a PNG, JPG, WebP or GIF image.')
      }
      if (file.size > MAX_AVATAR_BYTES) {
        throw new Error('That image is larger than 5 MB. Please choose a smaller one.')
      }

      const fileExt = file.name.split('.').pop()
      // Owner-scoped storage policies match on the "<uid>-" filename prefix.
      const filePath = `${uid}-${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      setAvatarUrl(data.publicUrl)
      onUpload(data.publicUrl)
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
    }
  }

  return (
    <div className="flex items-center gap-6">
      <Avatar className="h-24 w-24">
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback className="bg-brand font-bold text-white">{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <div>
        <label className="cursor-pointer" htmlFor="single">
          <span className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">
            {uploading ? 'Uploading ...' : 'Upload Avatar'}
          </span>
          <input
            className="hidden"
            type="file"
            id="single"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={uploadAvatar}
            disabled={uploading}
            aria-label="Upload a profile photo"
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to 5 MB.</p>
        {error && (
          <p role="alert" className="mt-1.5 max-w-[260px] text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
