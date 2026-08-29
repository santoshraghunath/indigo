import { createSummaryLog, getDailyLogPhotos, upsertWorkerDailyReport } from './projectService.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`)
  }
}

async function expectRejects(promise: Promise<unknown>, pattern: RegExp, message: string) {
  try {
    await promise
  } catch (error) {
    // Supabase's PostgrestError-shaped errors (as thrown by the real client,
    // and as mocked here) are plain { message } objects, not Error instances.
    const errorMessage = error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
    if (pattern.test(errorMessage)) return
    throw new Error(`${message}: received ${errorMessage}`)
  }
  throw new Error(`${message}: promise resolved unexpectedly`)
}

async function run(name: string, callback: () => Promise<void>) {
  await callback()
  console.log(`ok - ${name}`)
}

/**
 * Mocks the `daily_logs` table. `lookupQueue` is consumed in order, one
 * entry per `.select(...).maybeSingle()` lookup call — this lets a test
 * script a specific sequence (e.g. "not found", then "found" on a retry
 * after a simulated unique-violation).
 */
function createDailyLogsClient(options: {
  lookupQueue: Array<{ data: { id: string } | null; error: { message: string } | null }>
  insertError?: { message: string; code?: string } | null
  updateError?: { message: string } | null
}) {
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = []
  const insertCalls: Record<string, unknown>[] = []
  let lookupIndex = 0

  const selectBuilder = {
    eq() { return this },
    in() { return this },
    maybeSingle: async () => {
      const next = options.lookupQueue[lookupIndex] ?? { data: null, error: null }
      lookupIndex++
      return next
    },
  }

  const insertBuilder = {
    select() {
      return {
        single: async () => {
          if (options.insertError) return { data: null, error: options.insertError }
          return { data: { id: 'new-log-id' }, error: null }
        },
      }
    },
  }

  const updateEqBuilder = (payload: Record<string, unknown>) => ({
    eq: async (_col: string, id: string) => {
      updateCalls.push({ id, payload })
      return { error: options.updateError ?? null }
    },
  })

  const client = {
    from(table: string) {
      if (table !== 'daily_logs') throw new Error(`Unexpected table ${table}`)
      return {
        select() { return selectBuilder },
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload)
          return insertBuilder
        },
        update(payload: Record<string, unknown>) {
          return updateEqBuilder(payload)
        },
      }
    },
  }

  return { client, updateCalls, insertCalls }
}

await run('upsertWorkerDailyReport updates the existing report instead of inserting a duplicate', async () => {
  const { client, updateCalls, insertCalls } = createDailyLogsClient({
    lookupQueue: [{ data: { id: 'existing-log-id' }, error: null }],
  })

  const result = await upsertWorkerDailyReport(
    client as never, 'tenant-1', 'project-1', 'user-1', 'field_associate', '2026-01-01', 'Framed the west wall',
  )

  assertEqual(result.id, 'existing-log-id', 'should return the existing log id')
  assertEqual(insertCalls.length, 0, 'should not attempt an insert when a report already exists')
  assertEqual(updateCalls.length, 1, 'should update the existing report')
  assertEqual(updateCalls[0].id, 'existing-log-id', 'should update the correct row')
})

await run('upsertWorkerDailyReport inserts a new report when none exists', async () => {
  const { client, insertCalls } = createDailyLogsClient({
    lookupQueue: [{ data: null, error: null }],
  })

  const result = await upsertWorkerDailyReport(
    client as never, 'tenant-1', 'project-1', 'user-1', 'field_associate', '2026-01-01', 'Framed the west wall',
  )

  assertEqual(result.id, 'new-log-id', 'should return the newly inserted log id')
  assertEqual(insertCalls.length, 1, 'should insert exactly once')
})

await run('upsertWorkerDailyReport surfaces a failure in the existence check instead of silently inserting', async () => {
  const { client, insertCalls } = createDailyLogsClient({
    lookupQueue: [{ data: null, error: { message: 'permission denied for table daily_logs' } }],
  })

  await expectRejects(
    upsertWorkerDailyReport(client as never, 'tenant-1', 'project-1', 'user-1', 'field_associate', '2026-01-01', 'x'),
    /permission denied/,
    'a failed existence check should reject, not fall through to insert',
  )
  assertEqual(insertCalls.length, 0, 'must not attempt an insert when the existence check itself failed')
})

await run('upsertWorkerDailyReport recovers from a duplicate-key race by updating the row it initially missed', async () => {
  const { client, updateCalls, insertCalls } = createDailyLogsClient({
    // First lookup finds nothing; insert then collides (another attempt already
    // created the row); the fallback re-lookup finds it and updates instead.
    lookupQueue: [
      { data: null, error: null },
      { data: { id: 'raced-log-id' }, error: null },
    ],
    insertError: { message: 'duplicate key value violates unique constraint', code: '23505' },
  })

  const result = await upsertWorkerDailyReport(
    client as never, 'tenant-1', 'project-1', 'user-1', 'field_associate', '2026-01-01', 'Framed the west wall',
  )

  assertEqual(result.id, 'raced-log-id', 'should recover the pre-existing row instead of throwing')
  assertEqual(insertCalls.length, 1, 'should have attempted exactly one insert before falling back')
  assertEqual(updateCalls.length, 1, 'should update the row found on the fallback lookup')
})

await run('upsertWorkerDailyReport surfaces a non-conflict insert error normally', async () => {
  const { client } = createDailyLogsClient({
    lookupQueue: [{ data: null, error: null }],
    insertError: { message: 'work_performed violates not-null constraint' },
  })

  await expectRejects(
    upsertWorkerDailyReport(client as never, 'tenant-1', 'project-1', 'user-1', 'field_associate', '2026-01-01', ''),
    /not-null constraint/,
    'a non-conflict insert error should reject normally',
  )
})

function createSummaryLogClient(options: {
  photoLinkError?: { message: string } | null
}) {
  const photoInsertCalls: unknown[] = []

  const client = {
    from(table: string) {
      if (table === 'daily_logs') {
        return {
          insert() {
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'summary-log-id' }, error: null }),
                }
              },
            }
          },
        }
      }
      if (table === 'daily_log_photos') {
        return {
          insert(rows: unknown) {
            photoInsertCalls.push(rows)
            return Promise.resolve({ error: options.photoLinkError ?? null })
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }

  return { client, photoInsertCalls }
}

await run('createSummaryLog reports a photo-link failure without discarding the already-saved log', async () => {
  const { client } = createSummaryLogClient({
    photoLinkError: { message: 'permission denied for table daily_log_photos' },
  })

  const result = await createSummaryLog(client as never, 'tenant-1', 'project-1', 'user-1', {
    date: '2026-01-01',
    work_performed: 'Crew completed framing',
    selectedDocumentIds: ['doc-1', 'doc-2'],
  })

  assertEqual(result.id, 'summary-log-id', 'the log id should still be returned')
  assert(result.photoLinkError?.includes('permission denied') ?? false, 'photoLinkError should carry the underlying message')
})

await run('createSummaryLog returns no photoLinkError on success', async () => {
  const { client } = createSummaryLogClient({})

  const result = await createSummaryLog(client as never, 'tenant-1', 'project-1', 'user-1', {
    date: '2026-01-01',
    work_performed: 'Crew completed framing',
    selectedDocumentIds: ['doc-1'],
  })

  assertEqual(result.photoLinkError, null, 'photoLinkError should be null when linking succeeds')
})

/**
 * Mocks getDailyLogPhotos: a daily_log_photos↔documents join plus a
 * batch createSignedUrls call. `signResults` lets a test give each path
 * its own { signedUrl, error } outcome, exactly like the real per-item
 * response shape from Supabase's batch sign endpoint.
 */
function createDailyLogPhotosClient(options: {
  rows: Array<{ id: string; document_id: string; storage_path: string }>
  signResults: Record<string, { signedUrl: string | null; error: string | null }>
}) {
  const client = {
    from(table: string) {
      if (table !== 'daily_log_photos') throw new Error(`Unexpected table ${table}`)
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        then(resolve: (v: unknown) => void) {
          resolve({
            data: options.rows.map((r) => ({
              id: r.id,
              daily_log_id: 'log-1',
              document_id: r.document_id,
              caption: null,
              sequence: 0,
              is_client_visible: true,
              created_at: '2026-01-01T00:00:00.000Z',
              document: { storage_path: r.storage_path, storage_bucket: 'project-photos', mime_type: 'image/jpeg', file_size_bytes: 100 },
            })),
            error: null,
          })
        },
      }
    },
    storage: {
      from() {
        return {
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((path) => ({
              path,
              signedUrl: options.signResults[path]?.signedUrl ?? null,
              error: options.signResults[path]?.error ?? null,
            })),
            error: null,
          }),
        }
      },
    },
  }

  return { client }
}

await run('getDailyLogPhotos drops photos whose batch sign call failed instead of returning a blank URL', async () => {
  const { client } = createDailyLogPhotosClient({
    rows: [
      { id: 'photo-1', document_id: 'doc-1', storage_path: 'tenant-1/daily-logs/log-1/a.jpg' },
      { id: 'photo-2', document_id: 'doc-2', storage_path: 'tenant-1/daily-logs/log-1/b.jpg' },
    ],
    signResults: {
      'tenant-1/daily-logs/log-1/a.jpg': { signedUrl: 'https://signed.example/a.jpg', error: null },
      'tenant-1/daily-logs/log-1/b.jpg': { signedUrl: null, error: 'Object not found' },
    },
  })

  const photos = await getDailyLogPhotos(client as never, 'log-1')

  assertEqual(photos.length, 1, 'a photo whose sign call failed should be dropped, not returned with a blank URL')
  assertEqual(photos[0].id, 'photo-1', 'the successfully signed photo should still be returned')
  assertEqual(photos[0].signedUrl, 'https://signed.example/a.jpg', 'the returned photo should carry its real signed URL')
})

await run('getDailyLogPhotos returns all photos when every sign call succeeds', async () => {
  const { client } = createDailyLogPhotosClient({
    rows: [{ id: 'photo-1', document_id: 'doc-1', storage_path: 'tenant-1/daily-logs/log-1/a.jpg' }],
    signResults: {
      'tenant-1/daily-logs/log-1/a.jpg': { signedUrl: 'https://signed.example/a.jpg', error: null },
    },
  })

  const photos = await getDailyLogPhotos(client as never, 'log-1')

  assertEqual(photos.length, 1, 'all photos should be returned when signing succeeds')
})
