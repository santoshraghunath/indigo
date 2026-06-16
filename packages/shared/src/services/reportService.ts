import type { SupabaseClient } from '@supabase/supabase-js'

// ── Clock Entries report ────────────────────────────────────────────────────

export interface ClockEntryReportRow {
  id: string
  userId: string
  workerName: string
  projectId: string
  date: string
  clockedInAt: string
  clockedOutAt: string | null
  totalBreakMinutes: number
  autoBreakDeducted: boolean
  netHours: number | null
  regularHours: number | null
  ot15Hours: number | null
  ot20Hours: number | null
  mileageMiles: number | null
  notes: string | null
  laborCostCents: number | null
  status: string
}

export async function getClockEntriesReport(
  client: SupabaseClient,
  tenantId: string,
  opts: { from: string; to: string; projectId?: string },
): Promise<ClockEntryReportRow[]> {
  let q = client
    .from('work_sessions')
    .select(`
      id, user_id, project_id,
      clocked_in_at, clocked_out_at,
      total_break_minutes, auto_break_deducted,
      net_hours, regular_hours, ot_1_5_hours, ot_2_0_hours,
      mileage_miles, notes, labor_cost_cents, status,
      user:user_profiles ( first_name, last_name )
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'auto_closed'])
    .gte('clocked_in_at', opts.from)
    .lte('clocked_in_at', opts.to + 'T23:59:59.999Z')
    .order('clocked_in_at', { ascending: false })

  if (opts.projectId) q = q.eq('project_id', opts.projectId)

  const { data, error } = await q
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((s: any) => ({
    id:                  s.id,
    userId:              s.user_id,
    workerName:          s.user ? `${s.user.first_name} ${s.user.last_name}` : 'Unknown',
    projectId:           s.project_id,
    date:                s.clocked_in_at,
    clockedInAt:         s.clocked_in_at,
    clockedOutAt:        s.clocked_out_at,
    totalBreakMinutes:   s.total_break_minutes ?? 0,
    autoBreakDeducted:   s.auto_break_deducted ?? false,
    netHours:            s.net_hours,
    regularHours:        s.regular_hours,
    ot15Hours:           s.ot_1_5_hours,
    ot20Hours:           s.ot_2_0_hours,
    mileageMiles:        s.mileage_miles,
    notes:               s.notes,
    laborCostCents:      s.labor_cost_cents,
    status:              s.status,
  }))
}

// ── Labor Cost Summary report ───────────────────────────────────────────────

export interface LaborSummaryReportRow {
  userId: string
  workerName: string
  sessionCount: number
  totalNetHours: number
  regularHours: number
  ot15Hours: number
  ot20Hours: number
  totalLaborCostCents: number | null
  totalMileageMiles: number
}

export async function getLaborCostSummaryReport(
  client: SupabaseClient,
  tenantId: string,
  opts: { from: string; to: string; projectId?: string },
): Promise<LaborSummaryReportRow[]> {
  const rows = await getClockEntriesReport(client, tenantId, opts)

  const byUser = new Map<string, LaborSummaryReportRow>()

  for (const row of rows) {
    const existing = byUser.get(row.userId)
    if (existing) {
      existing.sessionCount       += 1
      existing.totalNetHours      += row.netHours ?? 0
      existing.regularHours       += row.regularHours ?? 0
      existing.ot15Hours          += row.ot15Hours ?? 0
      existing.ot20Hours          += row.ot20Hours ?? 0
      existing.totalMileageMiles  += row.mileageMiles ?? 0
      if (row.laborCostCents != null) {
        existing.totalLaborCostCents = (existing.totalLaborCostCents ?? 0) + row.laborCostCents
      }
    } else {
      byUser.set(row.userId, {
        userId:              row.userId,
        workerName:          row.workerName,
        sessionCount:        1,
        totalNetHours:       row.netHours ?? 0,
        regularHours:        row.regularHours ?? 0,
        ot15Hours:           row.ot15Hours ?? 0,
        ot20Hours:           row.ot20Hours ?? 0,
        totalLaborCostCents: row.laborCostCents,
        totalMileageMiles:   row.mileageMiles ?? 0,
      })
    }
  }

  return Array.from(byUser.values()).sort((a, b) => b.totalNetHours - a.totalNetHours)
}
