import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GNode { id: string; label: string; display: string; detail?: string; x: number; y: number; vx: number; vy: number }
interface GEdge { source: string; target: string; type: string }
interface Graph  { nodes: GNode[]; edges: GEdge[] }

// ─── Theme tokens ─────────────────────────────────────────────────────────────

interface Tokens {
  modalBg: string
  headerBorder: string
  bodyBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  editorBg: string
  editorText: string
  editorBorder: string
  filterBg: string
  filterBorder: string
  svgBg: string
  overlayBg: string
  btnOutlineBorder: string
  btnOutlineColor: string
  errorBg: string
  errorText: string
  errorBorder: string
  graphToolBg: string
  graphToolBorder: string
  graphToolColor: string
  statsBg: string
}

function getTokens(dark: boolean): Tokens {
  return dark ? {
    modalBg:        '#0f172a',
    headerBorder:   'rgba(255,255,255,0.06)',
    bodyBorder:     'rgba(255,255,255,0.05)',
    textPrimary:    '#f1f5f9',
    textSecondary:  '#64748b',
    textMuted:      '#475569',
    editorBg:       '#0a1120',
    editorText:     '#a5f3fc',
    editorBorder:   'rgba(99,102,241,0.25)',
    filterBg:       'rgba(15,23,42,0.6)',
    filterBorder:   'rgba(255,255,255,0.05)',
    svgBg:          'rgba(15,23,42,0.9)',
    overlayBg:      'rgba(0,0,0,0.72)',
    btnOutlineBorder:'rgba(255,255,255,0.12)',
    btnOutlineColor: '#94a3b8',
    errorBg:        'rgba(239,68,68,0.1)',
    errorText:      '#f87171',
    errorBorder:    'rgba(239,68,68,0.2)',
    graphToolBg:    'rgba(15,23,42,0.85)',
    graphToolBorder:'rgba(148,163,184,0.3)',
    graphToolColor: '#94a3b8',
    statsBg:        'rgba(15,23,42,0.75)',
  } : {
    modalBg:        '#ffffff',
    headerBorder:   'rgba(0,0,0,0.07)',
    bodyBorder:     'rgba(0,0,0,0.06)',
    textPrimary:    '#0f172a',
    textSecondary:  '#64748b',
    textMuted:      '#94a3b8',
    editorBg:       '#f8fafc',
    editorText:     '#0e4774',
    editorBorder:   'rgba(99,102,241,0.3)',
    filterBg:       'rgba(241,245,249,0.9)',
    filterBorder:   'rgba(0,0,0,0.07)',
    svgBg:          'rgba(241,245,249,0.97)',
    overlayBg:      'rgba(0,0,0,0.5)',
    btnOutlineBorder:'rgba(0,0,0,0.12)',
    btnOutlineColor: '#475569',
    errorBg:        'rgba(239,68,68,0.06)',
    errorText:      '#dc2626',
    errorBorder:    'rgba(239,68,68,0.15)',
    graphToolBg:    'rgba(255,255,255,0.9)',
    graphToolBorder:'rgba(0,0,0,0.12)',
    graphToolColor: '#475569',
    statsBg:        'rgba(255,255,255,0.85)',
  }
}

// ─── Graph colors (consistent across themes) ─────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  Document: '#6366f1',
  Article:  '#10b981',
  Clause:   '#f59e0b',
}
const EDGE_COLORS: Record<string, string> = {
  HAS_ARTICLE:  '#6366f1',
  HAS_CLAUSE:   '#10b981',
  NEXT_CLAUSE:  '#94a3b8',
  REFERENCES:   '#ef4444',
}
const NODE_COLOR_DEFAULT = '#6366f1'
const EDGE_COLOR_DEFAULT = '#64748b'

// ─── Cypher parser ────────────────────────────────────────────────────────────

function parseProps(raw?: string): Record<string, string> {
  const props: Record<string, string> = {}
  if (!raw) return props
  const re = /([a-zA-Z_]\w*)\s*:\s*(?:'((?:\\'|[^'])*)'|(-?\d+(?:\.\d+)?))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null)
    props[m[1]] = (m[2] ?? m[3] ?? '').replace(/\\'/g, "'")
  return props
}

function canonicalNode(label: string, rawProps: string | undefined, fallbackVar: string) {
  const p = parseProps(rawProps)
  if (label === 'Document' && p.document_id)
    return { id: `Document:${p.document_id}`, display: `doc:${p.document_id}`, detail: p.title || `Document ${p.document_id}` }
  if (label === 'Article') {
    const id = p.article_id || (p.document_id && p.article_number ? `doc:${p.document_id}:art:${p.article_number}` : fallbackVar)
    return { id: `Article:${id}`, display: p.article_number ? `Điều ${p.article_number}` : id, detail: p.header || id }
  }
  if (label === 'Clause') {
    const id = p.chunk_id ? `${p.document_id || 'doc'}:${p.chunk_id}` : fallbackVar
    return { id: `Clause:${id}`, display: p.chunk_id || fallbackVar, detail: p.text_content || p.chunk_id || fallbackVar }
  }
  return { id: `${label}:${fallbackVar}`, display: fallbackVar, detail: fallbackVar }
}

function parseCypherGraph(cypher: string): Graph {
  const lines = cypher.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'))
  const nodeMap = new Map<string, GNode>()
  const edgeSet = new Set<string>()
  const edges: GEdge[] = []
  for (const line of lines) {
    const localVars = new Map<string, string>()
    const nodeRe = /\(\s*([a-zA-Z_]\w*)\s*:\s*([A-Z][a-zA-Z]*)\s*(?:\{([^}]*)\})?\s*\)/g
    let nm: RegExpExecArray | null
    while ((nm = nodeRe.exec(line)) !== null) {
      const [, varName, label, rawProps] = nm
      const parsed = canonicalNode(label, rawProps, varName)
      localVars.set(varName, parsed.id)
      if (!nodeMap.has(parsed.id))
        nodeMap.set(parsed.id, { id: parsed.id, label, display: parsed.display, detail: parsed.detail, x: 0, y: 0, vx: 0, vy: 0 })
    }
    const edgeRe = /\(\s*([a-zA-Z_]\w*)[^)]*\)\s*-\[:\s*([A-Z_]+)[^\]]*\]->\s*\(\s*([a-zA-Z_]\w*)/g
    let em: RegExpExecArray | null
    while ((em = edgeRe.exec(line)) !== null) {
      const [, sv, type, tv] = em
      const src = localVars.get(sv), tgt = localVars.get(tv)
      if (!src || !tgt) continue
      const key = `${src}->${type}->${tgt}`
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: src, target: tgt, type }) }
    }
  }
  return { nodes: Array.from(nodeMap.values()), edges }
}

// ─── Force simulation ─────────────────────────────────────────────────────────

function layoutGraph(rawNodes: GNode[], edges: GEdge[], w: number, h: number): GNode[] {
  if (!rawNodes.length) return []
  const nodes: GNode[] = rawNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / rawNodes.length
    const r = Math.min(w, h) * 0.35
    return { ...n, x: w / 2 + r * Math.cos(angle), y: h / 2 + r * Math.sin(angle), vx: 0, vy: 0 }
  })
  const map = new Map(nodes.map(n => [n.id, n]))
  const REPULSION = 6000, ATTRACTION = 0.04, REST = Math.min(w, h) * 0.22
  const DAMPING = 0.82, GRAVITY = 0.02, STEPS = Math.min(300, 80 + nodes.length * 4)
  for (let s = 0; s < STEPS; s++) {
    for (const n of nodes) { n.vx *= DAMPING; n.vy *= DAMPING }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = REPULSION / (dist * dist), fx = (dx / dist) * f, fy = (dy / dist) * f
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
      }
    }
    for (const e of edges) {
      const src = map.get(e.source), tgt = map.get(e.target)
      if (!src || !tgt) continue
      const dx = tgt.x - src.x, dy = tgt.y - src.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const f = ATTRACTION * (dist - REST), fx = (dx / dist) * f, fy = (dy / dist) * f
      src.vx += fx; src.vy += fy; tgt.vx -= fx; tgt.vy -= fy
    }
    for (const n of nodes) { n.vx += (w / 2 - n.x) * GRAVITY; n.vy += (h / 2 - n.y) * GRAVITY }
    for (const n of nodes) { n.x = Math.max(36, Math.min(w - 36, n.x + n.vx)); n.y = Math.max(36, Math.min(h - 36, n.y + n.vy)) }
  }
  return nodes
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterChipProps {
  label: string; color: string; active: boolean; isEdge?: boolean; count: number; onToggle: () => void; tk: Tokens
}
function FilterChip({ label, color, active, isEdge, count, onToggle, tk }: FilterChipProps) {
  return (
    <button
      onClick={onToggle}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px 3px 6px', borderRadius: 20,
        border: `1px solid ${active ? color + '55' : tk.filterBorder}`,
        background: active ? color + '15' : 'transparent',
        color: active ? color : tk.textMuted,
        fontSize: 11, fontWeight: 500, cursor: 'pointer',
        transition: 'all 0.15s', opacity: active ? 1 : 0.5,
      }}
    >
      {isEdge
        ? <span style={{ width: 14, height: 2, background: active ? color : tk.textMuted, borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : tk.textMuted, display: 'inline-block', flexShrink: 0 }} />
      }
      {label.replace(/_/g, ' ')}
      <span style={{ opacity: 0.55, fontSize: 10 }}>{count}</span>
    </button>
  )
}

interface FilterBarProps {
  graph: Graph
  hiddenNodeLabels: Set<string>
  hiddenEdgeTypes: Set<string>
  onToggleNode: (l: string) => void
  onToggleEdge: (t: string) => void
  onResetFilters: () => void
  tk: Tokens
}
function FilterBar({ graph, hiddenNodeLabels, hiddenEdgeTypes, onToggleNode, onToggleEdge, onResetFilters, tk }: FilterBarProps) {
  const { t } = useTranslation()

  const nodeLabels = useMemo(() => {
    const c: Record<string, number> = {}
    for (const n of graph.nodes) c[n.label] = (c[n.label] ?? 0) + 1
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]))
  }, [graph.nodes])

  const edgeTypes = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of graph.edges) c[e.type] = (c[e.type] ?? 0) + 1
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]))
  }, [graph.edges])

  if (!nodeLabels.length && !edgeTypes.length) return null
  const hasFilters = hiddenNodeLabels.size > 0 || hiddenEdgeTypes.size > 0

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
      padding: '7px 10px', marginBottom: 8,
      background: tk.filterBg, border: `1px solid ${tk.filterBorder}`,
      borderRadius: 8, flexShrink: 0,
    }}>
      {nodeLabels.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: tk.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            {t('documents.graph.filterNodes')}
          </span>
          {nodeLabels.map(([label, count]) => (
            <FilterChip key={label} label={label} color={NODE_COLORS[label] ?? NODE_COLOR_DEFAULT}
              active={!hiddenNodeLabels.has(label)} count={count} onToggle={() => onToggleNode(label)} tk={tk} />
          ))}
        </div>
      )}

      {nodeLabels.length > 0 && edgeTypes.length > 0 && (
        <div style={{ width: 1, alignSelf: 'stretch', background: tk.filterBorder, flexShrink: 0 }} />
      )}

      {edgeTypes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: tk.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            {t('documents.graph.filterRelations')}
          </span>
          {edgeTypes.map(([type, count]) => (
            <FilterChip key={type} label={type} color={EDGE_COLORS[type] ?? EDGE_COLOR_DEFAULT}
              active={!hiddenEdgeTypes.has(type)} isEdge count={count} onToggle={() => onToggleEdge(type)} tk={tk} />
          ))}
        </div>
      )}

      {hasFilters && (
        <button onClick={onResetFilters} style={{
          marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
          border: `1px solid ${tk.filterBorder}`, background: 'transparent',
          color: tk.textSecondary, fontSize: 11, cursor: 'pointer',
        }}>
          {t('documents.graph.filterReset')}
        </button>
      )}
    </div>
  )
}

// ─── Graph canvas ─────────────────────────────────────────────────────────────

const W = 820, H = 500

function GraphCanvas({ graph, hiddenNodeLabels, hiddenEdgeTypes, tk }: {
  graph: Graph; hiddenNodeLabels: Set<string>; hiddenEdgeTypes: Set<string>; tk: Tokens
}) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: W, h: H })
  const [drag, setDrag] = useState<
    | { mode: 'pan'; startX: number; startY: number; ox: number; oy: number }
    | { mode: 'node'; id: string }
    | null
  >(null)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})

  const visNodes = useMemo(() => graph.nodes.filter(n => !hiddenNodeLabels.has(n.label)), [graph.nodes, hiddenNodeLabels])
  const visIds = useMemo(() => new Set(visNodes.map(n => n.id)), [visNodes])
  const visEdges = useMemo(
    () => graph.edges.filter(e => !hiddenEdgeTypes.has(e.type) && visIds.has(e.source) && visIds.has(e.target)),
    [graph.edges, hiddenEdgeTypes, visIds]
  )

  const laidOut = useMemo(
    () => layoutGraph(visNodes, visEdges, W, H),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visNodes.map(n => n.id).join(','), visEdges.map(e => `${e.source}|${e.type}|${e.target}`).join(',')]
  )

  useEffect(() => {
    const validIds = new Set(laidOut.map(n => n.id))
    setNodePositions(prev => {
      const next: Record<string, { x: number; y: number }> = {}
      for (const id of Object.keys(prev)) if (validIds.has(id)) next[id] = prev[id]
      return next
    })
  }, [laidOut])

  const renderedNodes = laidOut.map(n => ({ ...n, ...(nodePositions[n.id] ?? {}) }))
  const nodeMap = new Map(renderedNodes.map(n => [n.id, n]))

  const graphPoint = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h,
    }
  }, [viewBox])

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height
    setViewBox(prev => {
      const factor = e.deltaY > 0 ? 1.14 : 0.88
      const nw = Math.min(W * 4, Math.max(W * 0.2, prev.w * factor))
      const nh = Math.min(H * 4, Math.max(H * 0.2, prev.h * factor))
      return { x: prev.x + px * prev.w - px * nw, y: prev.y + py * prev.h - py * nh, w: nw, h: nh }
    })
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!drag) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    if (drag.mode === 'pan') {
      const dx = ((e.clientX - drag.startX) / rect.width) * viewBox.w
      const dy = ((e.clientY - drag.startY) / rect.height) * viewBox.h
      setViewBox(prev => ({ ...prev, x: drag.ox - dx, y: drag.oy - dy }))
    } else {
      const pt = graphPoint(e)
      setNodePositions(prev => ({ ...prev, [drag.id]: pt }))
    }
  }

  function resetView() { setViewBox({ x: 0, y: 0, w: W, h: H }); setNodePositions({}) }

  const toolBtnStyle: React.CSSProperties = {
    height: 24, minWidth: 24, padding: '0 7px', borderRadius: 5,
    border: `1px solid ${tk.graphToolBorder}`, background: tk.graphToolBg,
    color: tk.graphToolColor, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  }

  const hiddenCount = (graph.nodes.length - visNodes.length) + (graph.edges.length - visEdges.length)

  if (!laidOut.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: H, color: tk.textSecondary, fontSize: 13 }}>
        {graph.nodes.length === 0 ? t('documents.graph.noNodes') : t('documents.graph.allHidden')}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 3 }}>
        <button style={toolBtnStyle} onClick={() => setViewBox(v => ({ ...v, w: Math.max(W * 0.2, v.w * 0.86), h: Math.max(H * 0.2, v.h * 0.86) }))}>+</button>
        <button style={toolBtnStyle} onClick={() => setViewBox(v => ({ ...v, w: Math.min(W * 4, v.w * 1.16), h: Math.min(H * 4, v.h * 1.16) }))}>−</button>
        <button style={toolBtnStyle} onClick={resetView}>⊙</button>
      </div>

      {/* Stats */}
      <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, color: tk.textSecondary, background: tk.statsBg, padding: '2px 7px', borderRadius: 4, zIndex: 3 }}>
        {visNodes.length} nodes · {visEdges.length} edges
        {hiddenCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>{t('documents.graph.hidden', { count: hiddenCount })}</span>}
      </div>

      <svg
        ref={svgRef}
        width="100%" height={H}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onWheel={handleWheel}
        onMouseDown={e => setDrag({ mode: 'pan', startX: e.clientX, startY: e.clientY, ox: viewBox.x, oy: viewBox.y })}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => { setDrag(null); setHovered(null) }}
        style={{ display: 'block', borderRadius: 10, background: tk.svgBg, cursor: drag?.mode === 'pan' ? 'grabbing' : 'grab', userSelect: 'none' }}
      >
        <defs>
          {[...Object.entries(EDGE_COLORS), ['default', EDGE_COLOR_DEFAULT]].map(([type, color]) => (
            <marker key={type} id={`arr-${type}`} markerWidth="8" markerHeight="8" refX="22" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={color} opacity="0.8" />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {visEdges.map((edge, i) => {
          const src = nodeMap.get(edge.source), tgt = nodeMap.get(edge.target)
          if (!src || !tgt) return null
          const color = EDGE_COLORS[edge.type] ?? EDGE_COLOR_DEFAULT
          const isHov = hovered === edge.source || hovered === edge.target
          return (
            <g key={i}>
              <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={color} strokeWidth={isHov ? 2 : 1.2} strokeOpacity={isHov ? 0.9 : 0.4}
                markerEnd={`url(#arr-${edge.type in EDGE_COLORS ? edge.type : 'default'})`}
              />
              {isHov && (
                <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2 - 4} textAnchor="middle" fontSize={9} fill={color} opacity={0.9}>
                  {edge.type.replace(/_/g, ' ')}
                </text>
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {renderedNodes.map(node => {
          const color = NODE_COLORS[node.label] ?? NODE_COLOR_DEFAULT
          const isHov = hovered === node.id
          return (
            <g key={node.id} style={{ cursor: 'grab' }}
              onMouseDown={e => { e.stopPropagation(); setDrag({ mode: 'node', id: node.id }) }}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{node.detail || node.display}</title>
              <circle cx={node.x} cy={node.y} r={isHov ? 14 : 11} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={isHov ? 2.5 : 1.8} />
              <text x={node.x} y={node.y - 16} textAnchor="middle" fontSize={9} fill={color} opacity={isHov ? 1 : 0.65} fontWeight={isHov ? '700' : '400'}>{node.label}</text>
              <text x={node.x} y={node.y + 22} textAnchor="middle" fontSize={8} fill={isHov ? tk.textSecondary : '#94a3b8'} opacity={isHov ? 0.9 : 0.5}>
                {node.display.length > 20 ? `…${node.display.slice(-18)}` : node.display}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

interface Props {
  docId: number
  title: string
  initialCypher: string
  onCommit: () => void
  onCancel: () => void
}

export default function CypherPreviewDialog({ docId, title, initialCypher, onCommit, onCancel }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const tk = getTokens(dark)

  const [cypher, setCypher] = useState(initialCypher)
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedCypher, setDebouncedCypher] = useState(initialCypher)

  const [hiddenNodeLabels, setHiddenNodeLabels] = useState<Set<string>>(new Set())
  const [hiddenEdgeTypes,  setHiddenEdgeTypes]  = useState<Set<string>>(new Set())

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedCypher(cypher), 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [cypher])

  const graph = useMemo(() => parseCypherGraph(debouncedCypher), [debouncedCypher])

  function toggleNodeLabel(label: string) {
    setHiddenNodeLabels(prev => { const s = new Set(prev); s.has(label) ? s.delete(label) : s.add(label); return s })
  }
  function toggleEdgeType(type: string) {
    setHiddenEdgeTypes(prev => { const s = new Set(prev); s.has(type) ? s.delete(type) : s.add(type); return s })
  }
  function resetFilters() { setHiddenNodeLabels(new Set()); setHiddenEdgeTypes(new Set()) }

  const handleCommit = useCallback(async () => {
    setError(null); setSubmitting(true)
    try {
      await api.documents.commitCypher(docId, cypher)
      setSubmitting(false); onCommit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit failed'); setSubmitting(false)
    }
  }, [docId, cypher, onCommit])

  const handleCancel = useCallback(async () => {
    setCancelling(true)
    try { await api.documents.delete(docId) } catch { /* ignore */ }
    onCancel()
  }, [docId, onCancel])

  const lineCount = cypher.split('\n').length

  return (
    <div style={{ position: 'fixed', inset: 0, background: tk.overlayBg, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: tk.modalBg, border: `1px solid ${tk.headerBorder}`, borderRadius: 14, width: 'min(1220px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.7)' : '0 20px 50px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${tk.headerBorder}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: tk.textPrimary }}>
              {t('documents.graph.title', { docTitle: title })}
            </div>
            <div style={{ fontSize: 12, color: tk.textSecondary, marginTop: 2 }}>
              {t('documents.graph.subtitle')}
              <span style={{ marginLeft: 10, color: '#6366f1' }}>
                {t('documents.graph.stats', { nodes: graph.nodes.length, edges: graph.edges.length, lines: lineCount })}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: `1px solid ${tk.btnOutlineBorder}`, background: 'transparent', color: tk.btnOutlineColor, cursor: 'pointer', opacity: cancelling ? 0.6 : 1 }}
              onClick={handleCancel} disabled={submitting || cancelling}
            >
              {cancelling ? t('documents.graph.cancellingBtn') : t('documents.graph.cancelBtn')}
            </button>
            <button
              style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 12px rgba(99,102,241,0.35)', opacity: submitting ? 0.7 : 1 }}
              onClick={handleCommit} disabled={submitting || cancelling}
            >
              {submitting ? t('documents.graph.committingBtn') : t('documents.graph.commitBtn')}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 20px', background: tk.errorBg, color: tk.errorText, fontSize: 12, borderBottom: `1px solid ${tk.errorBorder}` }}>
            {error}
          </div>
        )}

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: Cypher editor */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '40%', minWidth: 300, borderRight: `1px solid ${tk.bodyBorder}`, padding: '12px 16px', overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: tk.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
              {t('documents.graph.editorTitle')}
              <span style={{ marginLeft: 8, color: tk.textMuted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t('documents.graph.editorHint')}</span>
            </div>
            <textarea
              value={cypher}
              onChange={e => setCypher(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, width: '100%', background: tk.editorBg,
                border: `1px solid ${tk.editorBorder}`, borderRadius: 8,
                color: tk.editorText,
                fontFamily: '"Fira Code","Cascadia Code","JetBrains Mono",monospace',
                fontSize: 12, lineHeight: 1.6, padding: '10px 12px',
                resize: 'none', outline: 'none', caretColor: '#6366f1',
              }}
            />
          </div>

          {/* Right: Filters + Graph */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 16px', overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: tk.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
              {t('documents.graph.graphTitle')}
              <span style={{ marginLeft: 8, color: tk.textMuted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t('documents.graph.graphHint')}</span>
            </div>
            <FilterBar
              graph={graph}
              hiddenNodeLabels={hiddenNodeLabels}
              hiddenEdgeTypes={hiddenEdgeTypes}
              onToggleNode={toggleNodeLabel}
              onToggleEdge={toggleEdgeType}
              onResetFilters={resetFilters}
              tk={tk}
            />
            <GraphCanvas
              graph={graph}
              hiddenNodeLabels={hiddenNodeLabels}
              hiddenEdgeTypes={hiddenEdgeTypes}
              tk={tk}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
