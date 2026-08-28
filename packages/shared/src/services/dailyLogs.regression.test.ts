import { createSummaryLog, upsertWorkerDailyReport } from './projectService.ts'

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
