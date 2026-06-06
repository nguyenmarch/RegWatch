import type { Document } from './api'
import type { AnalysisSeverity, AnalysisSummary } from './analyses'
import { parseBackendDate } from './datetime'

export interface AnalysisRun {
  key: string
  documentId: number | null
  documentTitle: string
  documentCreatedAt: string | null
  latestAnalysisAt: string
  analyses: AnalysisSummary[]
  counts: Record<AnalysisSeverity, number>
  highestSeverity: AnalysisSeverity
  topRisk: number
  riskLabel: string
  status: 'pending' | 'processed'
  summary: string
}

const SEVERITY_RANK: Record<AnalysisSeverity, number> = {
  urgent: 0,
  review: 1,
  monitor: 2,
}

function sortAnalyses(items: AnalysisSummary[]) {
  return [...items].sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (severity !== 0) return severity
    const risk = b.overall_risk.value - a.overall_risk.value
    if (risk !== 0) return risk
    return parseBackendDate(b.created_at).getTime() - parseBackendDate(a.created_at).getTime()
  })
}

export function buildAnalysisRuns(
  analyses: AnalysisSummary[],
  documents: Document[],
): AnalysisRun[] {
  const docsById = new Map(documents.map(doc => [doc.id, doc]))
  const groups = new Map<string, AnalysisSummary[]>()

  for (const analysis of analyses) {
    const key = analysis.document_id ? `doc-${analysis.document_id}` : `analysis-${analysis.id}`
    const current = groups.get(key) ?? []
    current.push(analysis)
    groups.set(key, current)
  }

  return [...groups.entries()]
    .map(([key, rawItems]) => {
      const items = sortAnalyses(rawItems)
      const first = items[0]
      const document = first.document_id ? docsById.get(first.document_id) : undefined
      const latest = [...items].sort(
        (a, b) => parseBackendDate(b.created_at).getTime() - parseBackendDate(a.created_at).getTime(),
      )[0]
      const riskiest = [...items].sort((a, b) => b.overall_risk.value - a.overall_risk.value)[0]
      const counts: Record<AnalysisSeverity, number> = { urgent: 0, review: 0, monitor: 0 }
      for (const item of items) counts[item.severity] += 1
      const highestSeverity = items.reduce<AnalysisSeverity>(
        (current, item) => (SEVERITY_RANK[item.severity] < SEVERITY_RANK[current] ? item.severity : current),
        first.severity,
      )

      return {
        key,
        documentId: first.document_id,
        documentTitle: document?.title ?? first.title,
        documentCreatedAt: document?.created_at ?? null,
        latestAnalysisAt: latest.created_at,
        analyses: items,
        counts,
        highestSeverity,
        topRisk: riskiest.overall_risk.value,
        riskLabel: riskiest.overall_risk.label,
        status: items.every(item => item.status === 'processed') ? 'processed' : 'pending',
        summary: first.summary,
      }
    })
    .sort((a, b) => {
      const aTime = parseBackendDate(a.documentCreatedAt ?? a.latestAnalysisAt).getTime()
      const bTime = parseBackendDate(b.documentCreatedAt ?? b.latestAnalysisAt).getTime()
      return bTime - aTime
    })
}

export function findAnalysisRun(runs: AnalysisRun[], runKey: string | undefined) {
  if (!runKey) return undefined
  return runs.find(run => run.key === runKey)
}

export function countRunFindings(runs: AnalysisRun[]) {
  return runs.reduce((sum, run) => sum + run.analyses.length, 0)
}
