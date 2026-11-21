-- Temporary storage for sales visit audio files.
-- Files are uploaded by the client, fetched by the transcribe-audio
-- Netlify function (using service role), and deleted immediately after
-- transcription completes. No long-term retention.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sales-audio',
  'sales-audio',
  false,
  26214400, -- 25 MB, matching OpenAI Whisper's limit
  ARRAY[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
    'audio/wav', 'audio/flac', 'audio/x-m4a', 'audio/m4a'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- PM+ can upload into their tenant's folder
CREATE POLICY "pm_upload_sales_audio"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sales-audio'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM   tenant_members
    WHERE  user_id    = auth.uid()
    AND    is_active  = true
    AND    role IN ('project_manager', 'admin', 'owner')
  )
);

-- Only the service role reads/deletes (the Netlify function uses the service key).
-- No authenticated SELECT/DELETE policy is needed; RLS is bypassed for service role.
