/**
 * Logs AI interactions to the ai_conversations table.
 * The table stores the full message array in the `messages` JSONB column
 * and tracks token usage. Called after successful route() calls.
 * Server-side only — requires service_role key.
 */
import type { AIRouteRequest, AIRouteResponse } from './types.js'

export type SupabaseAdminClient = {
  from: (table: string) => {
    insert: (data: unknown) => Promise<{ error: unknown }>
  }
}

export async function logAICall(
  req: AIRouteRequest,
  res: AIRouteResponse,
  supabase: SupabaseAdminClient
): Promise<void> {
  if (!req.meta?.tenantId) return

  const entry = {
    tenant_id: req.meta.tenantId,
    job_id: req.meta.jobId ?? null,
    project_id: req.meta.projectId ?? null,
    user_id: req.meta.userId ?? null,
    context_type: req.task,
    messages: req.messages,
    model: res.model,
    input_tokens: res.inputTokens,
    output_tokens: res.outputTokens,
  }

  const { error } = await supabase.from('ai_conversations').insert(entry)
  if (error) {
    console.error('[ai-logger] Failed to log AI call:', error)
  }
}
