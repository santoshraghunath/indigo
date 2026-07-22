import {
  getProjectDocumentDownload,
  uploadProjectDocument,
} from './projectService.ts'
import { getPortalDocumentDownload } from './portalService.ts'

const MEBIBYTE = 1024 * 1024

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`)
  }
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  if (!pattern.test(value)) {
    throw new Error(`${message}: ${value}`)
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, received ${actualJson}`)
  }
}

async function expectRejects(promise: Promise<unknown>, pattern: RegExp, message: string) {
  try {
    await promise
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (pattern.test(errorMessage)) {
      return
    }
    throw new Error(`${message}: received ${errorMessage}`)
  }

  throw new Error(`${message}: promise resolved unexpectedly`)
}

async function run(name: string, callback: () => Promise<void>) {
  await callback()
  console.log(`ok - ${name}`)
}

function createProjectClient(options: {
  uploadError?: Error | null
  insertError?: Error | null
  signedUrl?: string
  signedUrlError?: Error | null
  selectedDocument?: Record<string, unknown>
}) {
  const uploadCalls: Array<{ path: string; file: File; options: unknown }> = []
  const removeCalls: string[][] = []
  const signedUrlCalls: Array<{ bucket: string; path: string; expiresIn: number; options: unknown }> = []
  const insertPayloads: Array<Record<string, unknown>> = []

  const storageApi = {
    from(bucket: string) {
      return {
        upload: async (path: string, file: File, uploadOptions: unknown) => {
          uploadCalls.push({ path, file, options: uploadOptions })
          return { data: null, error: options.uploadError ?? null }
        },
        remove: async (paths: string[]) => {
          removeCalls.push(paths)
          return { data: null, error: null }
        },
        createSignedUrl: async (path: string, expiresIn: number, signOptions: unknown) => {
          signedUrlCalls.push({ bucket, path, expiresIn, options: signOptions })
          return {
            data: options.signedUrlError ? null : { signedUrl: options.signedUrl ?? 'https://signed.example/download' },
            error: options.signedUrlError ?? null,
          }
        },
      }
    },
  }

  const documentInsertBuilder = {
    select() {
      return {
        single: async () => {
          if (options.insertError) {
            return { data: null, error: options.insertError }
          }

          const inserted = insertPayloads.at(-1) ?? {}
          return {
            data: {
              id: 'doc-1',
              folder_id: inserted.folder_id ?? null,
              type: inserted.type ?? 'Plans',
              name: inserted.name ?? 'proposal.pdf',
              description: inserted.description ?? null,
              mime_type: inserted.mime_type ?? 'application/pdf',
              file_size_bytes: inserted.file_size_bytes ?? 1,
              version: 1,
              is_client_visible: inserted.is_client_visible ?? false,
              tags: inserted.tags ?? [],
              uploaded_by: inserted.uploaded_by ?? 'user-1',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
            error: null,
          }
        },
      }
    },
  }

  const documentSelectBuilder = {
    eq() {
      return this
    },
    single: async () => ({
      data: options.selectedDocument ?? {
        id: 'doc-1',
        name: 'proposal.pdf',
        storage_bucket: 'project-documents',
        storage_path: 'tenant-1/projects/project-1/documents/path.pdf',
      },
      error: null,
    }),
  }

  const client = {
    storage: storageApi,
    from(table: string) {
      if (table !== 'documents') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        insert(payload: Record<string, unknown>) {
          insertPayloads.push(payload)
          return documentInsertBuilder
        },
        select() {
          return documentSelectBuilder
        },
      }
    },
  }

  return { client, uploadCalls, removeCalls, signedUrlCalls, insertPayloads }
}

function createPortalClient(options: {
  documentError?: Error | null
  signedUrlError?: Error | null
  signedUrl?: string
}) {
  const eqCalls: Array<{ column: string; value: string | boolean }> = []
  const signedUrlCalls: Array<{ bucket: string; path: string; expiresIn: number; options: unknown }> = []

  const client = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string, expiresIn: number, signOptions: unknown) => {
            signedUrlCalls.push({ bucket, path, expiresIn, options: signOptions })
            return {
              data: options.signedUrlError ? null : { signedUrl: options.signedUrl ?? 'https://signed.example/portal' },
              error: options.signedUrlError ?? null,
            }
          },
        }
      },
    },
    from(table: string) {
      if (table !== 'documents') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select() {
          return this
        },
        eq(column: string, value: string | boolean) {
          eqCalls.push({ column, value })
          return this
        },
        single: async () => ({
          data: options.documentError
            ? null
            : {
                id: 'doc-portal-1',
                name: 'client-visible.pdf',
                storage_bucket: 'project-documents',
                storage_path: 'tenant-1/projects/project-1/documents/client-visible.pdf',
              },
          error: options.documentError ?? null,
        }),
      }
    },
  }

  return { client, eqCalls, signedUrlCalls }
}

await run('uploadProjectDocument rejects empty files before storage mutation', async () => {
  const { client, uploadCalls } = createProjectClient({})

  await expectRejects(
    uploadProjectDocument(
      client as never,
      'tenant-1',
      'project-1',
      'user-1',
      new File([''], 'empty.pdf', { type: 'application/pdf' }),
      { type: 'Plans' },
    ),
    /Document file is required\./,
    'empty files should be rejected',
  )

  assertEqual(uploadCalls.length, 0, 'empty files should not upload')
})

await run('uploadProjectDocument accepts exactly 25 MiB and generates a safe tenant/project scoped path', async () => {
  const { client, uploadCalls, insertPayloads } = createProjectClient({})
  const exactLimitFile = new File([new Uint8Array(25 * MEBIBYTE)], '../../unsafe.PDF?download=1', {
    type: 'application/pdf',
  })

  const document = await uploadProjectDocument(
    client as never,
    'tenant-1',
    'project-1',
    'user-1',
    exactLimitFile,
    {
      type: ' Plans ',
      description: ' Spec set ',
      isClientVisible: true,
      tags: [' issued ', ' permit '],
    },
  )

  assertEqual(document.type, 'Plans', 'type should be trimmed')
  assertEqual(document.description, 'Spec set', 'description should be trimmed')
  assertDeepEqual(document.tags, ['issued', 'permit'], 'tags should be trimmed and preserved')
  assertEqual(uploadCalls.length, 1, 'exact-limit file should upload once')
  assertMatch(uploadCalls[0].path, /^tenant-1\/projects\/project-1\/documents\/[0-9a-f-]+$/, 'path should be tenant/project scoped when no safe extension is present')
  assertEqual(uploadCalls[0].path.includes('..'), false, 'path should not contain parent traversal')
  assertEqual(uploadCalls[0].path.includes('../../unsafe'), false, 'path should not include original file segments')
  assertEqual(insertPayloads[0].storage_bucket as string, 'project-documents', 'storage bucket should stay private')
  assertEqual(insertPayloads[0].storage_path as string, uploadCalls[0].path, 'metadata should store uploaded path')
})

await run('uploadProjectDocument preserves only a safe terminal extension from the basename', async () => {
  const { client, uploadCalls } = createProjectClient({})

  await uploadProjectDocument(
    client as never,
    'tenant-1',
    'project-1',
    'user-1',
    new File(['spec'], '..\\nested/path.final.PDF', { type: 'application/pdf' }),
    { type: 'Plans' },
  )

  assertMatch(uploadCalls[0].path, /^tenant-1\/projects\/project-1\/documents\/[0-9a-f-]+\.pdf$/, 'path should keep only the safe terminal extension')
  assertEqual(uploadCalls[0].path.includes('path.final'), false, 'path should not reuse basename segments beyond the extension')
})

await run('uploadProjectDocument rejects oversized files before storage mutation', async () => {
  const { client, uploadCalls } = createProjectClient({})
  const oversizedFile = new File([new Uint8Array((25 * MEBIBYTE) + 1)], 'large.pdf', {
    type: 'application/pdf',
  })

  await expectRejects(
    uploadProjectDocument(client as never, 'tenant-1', 'project-1', 'user-1', oversizedFile, { type: 'Plans' }),
    /25 MiB or smaller/,
    'oversized files should be rejected',
  )

  assertEqual(uploadCalls.length, 0, 'oversized files should not upload')
})

await run('uploadProjectDocument removes the uploaded object when metadata persistence fails', async () => {
  const { client, uploadCalls, removeCalls } = createProjectClient({
    insertError: new Error('insert failed'),
  })

  await expectRejects(
    uploadProjectDocument(
      client as never,
      'tenant-1',
      'project-1',
      'user-1',
      new File(['contract'], 'contract.pdf', { type: 'application/pdf' }),
      { type: 'Contracts' },
    ),
    /insert failed/,
    'metadata failures should surface',
  )

  assertEqual(uploadCalls.length, 1, 'rollback case should upload once')
  assertDeepEqual(removeCalls, [[uploadCalls[0].path]], 'rollback should remove the uploaded object through the storage API')
})

await run('getProjectDocumentDownload returns an opaque signed download payload for staff', async () => {
  const { client, signedUrlCalls } = createProjectClient({
    signedUrl: 'https://signed.example/staff-download',
  })

  const download = await getProjectDocumentDownload(
    client as never,
    'tenant-1',
    'project-1',
    'doc-1',
  )

  assertDeepEqual(download, {
    documentId: 'doc-1',
    fileName: 'proposal.pdf',
    signedUrl: 'https://signed.example/staff-download',
  }, 'staff download should return an opaque payload')
  assertDeepEqual(signedUrlCalls, [
    {
      bucket: 'project-documents',
      path: 'tenant-1/projects/project-1/documents/path.pdf',
      expiresIn: 3600,
      options: { download: 'proposal.pdf' },
    },
  ], 'staff download should sign the stored object path')
})

await run('getPortalDocumentDownload signs only client-visible project documents and returns no storage path', async () => {
  const { client, eqCalls, signedUrlCalls } = createPortalClient({})

  const download = await getPortalDocumentDownload(client as never, 'project-1', 'doc-portal-1')

  assertDeepEqual(download, {
    documentId: 'doc-portal-1',
    fileName: 'client-visible.pdf',
    signedUrl: 'https://signed.example/portal',
  }, 'portal download should stay opaque')
  assert(eqCalls.some((call) => call.column === 'project_id' && call.value === 'project-1'), 'portal query should scope project id')
  assert(eqCalls.some((call) => call.column === 'id' && call.value === 'doc-portal-1'), 'portal query should scope document id')
  assert(eqCalls.some((call) => call.column === 'is_client_visible' && call.value === true), 'portal query should require client visibility')
  assertEqual('storagePath' in download, false, 'portal response should not expose camelCase storage path')
  assertEqual('storage_path' in download, false, 'portal response should not expose snake_case storage path')
  assertEqual(signedUrlCalls.length, 1, 'portal download should sign exactly once')
})

await run('getPortalDocumentDownload surfaces unauthorized access failures', async () => {
  const { client, signedUrlCalls } = createPortalClient({
    documentError: new Error('permission denied'),
  })

  await expectRejects(
    getPortalDocumentDownload(client as never, 'project-1', 'doc-portal-1'),
    /permission denied/,
    'unauthorized portal downloads should fail',
  )

  assertEqual(signedUrlCalls.length, 0, 'unauthorized portal downloads should not sign')
})