import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Uploads an audio blob to the `sales-audio` temporary storage bucket.
 * Returns the storage path, which is passed to the transcribe-audio
 * Netlify function. The function deletes the file after transcription.
 */
export async function uploadAudioForTranscription(
  supabase: SupabaseClient,
  blob: Blob,
  filename: string,
  tenantId: string,
): Promise<string> {
  const ext  = filename.split('.').pop()?.toLowerCase() ?? 'webm'
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('sales-audio')
    .upload(path, blob, { contentType: blob.type, upsert: false })

  if (error) throw new Error(`Audio upload failed: ${error.message}`)

  return path
}
