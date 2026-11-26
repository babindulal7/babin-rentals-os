import { supabase, IS_MOCK } from '../supabase'

export type ProblemReportStatus = 'open' | 'seen' | 'fixed' | 'wont_fix'

export const PROBLEM_REPORT_STATUSES: readonly ProblemReportStatus[] = ['open', 'seen', 'fixed', 'wont_fix']

export const PROBLEM_REPORT_STATUS_LABELS: Record<ProblemReportStatus, string> = {
  open: 'Open',
  seen: 'Seen',
  fixed: 'Fixed',
  wont_fix: "Won't fix",
}

export interface ProblemReportListRow {
  id: string
  client_uuid: string | null
  description: string
  photo_path: string | null
  author_id: string
  author_name: string
  author_role: string
  created_at: string
  updated_at: string
  status: ProblemReportStatus
  status_changed_at: string | null
  status_changed_by: string | null
  status_change_reason: string | null
  route_path: string | null
  app_version: string | null
  user_role: string | null
  device_category: 'phone' | 'tablet' | 'desktop' | null
  viewport_width: number | null
  viewport_height: number | null
  error_reference: string | null
}

interface ProblemReportDbRow {
  id: string
  client_uuid: string | null
  description: string
  photo_path: string | null
  author_id: string
  author_name: string
  author_role: string
  created_at: string
  updated_at: string
  status: ProblemReportStatus
  status_changed_at: string | null
  status_changed_by: string | null
  status_change_reason: string | null
  route_path: string | null
  app_version: string | null
  user_role: string | null
  device_category: 'phone' | 'tablet' | 'desktop' | null
  viewport_width: number | null
  viewport_height: number | null
  error_reference: string | null
}

function mapDbRow(row: ProblemReportDbRow): ProblemReportListRow {
  return {
    id: row.id,
    client_uuid: row.client_uuid,
    description: row.description,
    photo_path: row.photo_path,
    author_id: row.author_id,
    author_name: row.author_name,
    author_role: row.author_role,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    status_changed_at: row.status_changed_at,
    status_changed_by: row.status_changed_by,
    status_change_reason: row.status_change_reason,
    route_path: row.route_path,
    app_version: row.app_version,
    user_role: row.user_role,
    device_category: row.device_category,
    viewport_width: row.viewport_width,
    viewport_height: row.viewport_height,
    error_reference: row.error_reference,
  }
}

/**
 * Fetch problem reports with server-side filtering and pagination.
 * Staff see only their own reports; Owner/Admin see all.
 */
export async function listProblemReports(options?: {
  limit?: number
  offset?: number
  status?: ProblemReportStatus | null
  authorId?: string | null
  search?: string | undefined
  withCount?: boolean
}): Promise<{ rows: ProblemReportListRow[]; total: number | null; loading: boolean; error: string | null; isEmpty: boolean; isFiltered: boolean; refetch: () => void }> {
  if (IS_MOCK) {
    // Mock data for testing
    const mockReports: ProblemReportListRow[] = [
      {
        id: 'pr-001',
        client_uuid: '10000000-0000-4000-8000-000000000001',
        description: 'Scanner not reading barcodes on Camera A',
        photo_path: null,
        author_id: '00000000-0000-4000-8000-00000000e005',
        author_name: 'Warehouse Staff',
        author_role: 'Warehouse',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'open',
        status_changed_at: null,
        status_changed_by: null,
        status_change_reason: null,
        route_path: '/operations',
        app_version: 'Babin Rentals OS v3.0.0',
        user_role: 'Warehouse',
        device_category: 'tablet',
        viewport_width: 820,
        viewport_height: 1180,
        error_reference: 'ERR-20261103-001',
      },
      {
        id: 'pr-002',
        client_uuid: '10000000-0000-4000-8000-000000000002',
        description: 'Invoice generation fails for booking BK-0045',
        photo_path: 'user-123/1234567890.jpg',
        author_id: '00000000-0000-4000-8000-00000000e006',
        author_name: 'Finance Coordinator',
        author_role: 'Coordinator',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date(Date.now() - 1800000).toISOString(),
        status: 'seen',
        status_changed_at: new Date(Date.now() - 1800000).toISOString(),
        status_changed_by: '00000000-0000-4000-8000-00000000e001',
        status_change_reason: 'Investigating the issue with tax calculation',
        route_path: '/finance/invoices',
        app_version: 'Babin Rentals OS v3.0.0',
        user_role: 'Coordinator',
        device_category: 'desktop',
        viewport_width: 1440,
        viewport_height: 900,
        error_reference: 'ERR-20261103-002',
      },
    ]
    return {
      rows: mockReports,
      total: mockReports.length,
      loading: false,
      error: null,
      isEmpty: mockReports.length === 0,
      isFiltered: false,
      refetch: () => {},
    }
  }

  let query = supabase
    .from('problem_reports_v')
    .select('*', options?.withCount ? { count: 'exact' as const, head: false } : { head: false })
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.authorId) {
    query = query.eq('author_id', options.authorId)
  }
  if (options?.search) {
    query = query.ilike('description', `%${options.search}%`)
  }
  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit)
  }
  if (options?.offset && options.offset > 0) {
    query = query.range(options.offset, options.offset + (options.limit ?? PAGE_SIZE) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    console.warn('Failed to fetch problem_reports_v:', error.message)
    return {
      rows: [],
      total: null,
      loading: false,
      error: error.message,
      isEmpty: true,
      isFiltered: false,
      refetch: () => {},
    }
  }

  return {
    rows: ((data ?? []) as unknown as ProblemReportDbRow[]).map(mapDbRow),
    total: count ?? null,
    loading: false,
    error: null,
    isEmpty: (data ?? []).length === 0,
    isFiltered: !!(options?.status || options?.authorId || options?.search),
    refetch: () => {},
  }
}

const PAGE_SIZE = 25

/**
 * Get a signed URL for a problem report photo (private bucket).
 */
export async function getProblemReportPhotoUrl(photoPath: string): Promise<string | null> {
  if (IS_MOCK) {
    return `https://example.com/mock-photo/${photoPath}`
  }

  const { data, error } = await supabase.storage
    .from('problem-reports')
    .createSignedUrl(photoPath, 60 * 60) // 1 hour expiry

  if (error) {
    console.warn('Failed to create signed URL for problem report photo:', error.message)
    return null
  }

  return data?.signedUrl ?? null
}