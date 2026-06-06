import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
} from 'docx'
import type { AnalysisDetail } from './analyses'
import type { AnalysisRun } from './analysisRuns'

const SEVERITY_VI: Record<string, string> = {
  urgent: 'KHẨN CẤP',
  review: 'CẦN CHỈNH',
  monitor: 'THEO DÕI',
}

const STATUS_VI: Record<string, string> = {
  violation: 'VI PHẠM',
  compliant: 'TUÂN THỦ',
  risk: 'Rủi ro',
  missing: 'Chưa có',
  neutral: '',
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } })
}

function body(text: string, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 22 })],
    spacing: { after: 80 },
  })
}

function labelValue(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: value, size: 22 }),
    ],
    spacing: { after: 80 },
  })
}

function separator() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
    spacing: { before: 160, after: 160 },
    children: [],
  })
}

function makeTable(headers: string[], rows: string[][], shadeHeader = true) {
  const colCount = headers.length
  const colWidth = Math.floor(9000 / colCount)

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h =>
      new TableCell({
        shading: shadeHeader ? { type: ShadingType.SOLID, color: 'E8EEF4' } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        width: { size: colWidth, type: WidthType.DXA },
      })
    ),
  })

  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: cell ?? '', size: 20 })] })],
          width: { size: colWidth, type: WidthType.DXA },
        })
      ),
    })
  )

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  })
}

function safeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'analysis-run'
}

export async function exportAnalysisRunDocx(run: AnalysisRun): Promise<void> {
  const createdDate = new Date(run.documentCreatedAt ?? run.latestAnalysisAt).toLocaleString('vi-VN')
  const severityLabel = SEVERITY_VI[run.highestSeverity] ?? run.highestSeverity

  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'BÁO CÁO TỔNG HỢP ANALYSIS', bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: run.documentTitle, bold: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Thời gian: ${createdDate}`, size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
    }),

    separator(),

    heading('I. THÔNG TIN CHUNG', HeadingLevel.HEADING_1),
    labelValue('Tài liệu', run.documentTitle),
    labelValue('Mã analysis', run.key),
    labelValue('Số alert', String(run.analyses.length)),
    labelValue('Mức nghiêm trọng cao nhất', severityLabel),
    labelValue('Rủi ro cao nhất', `${run.riskLabel} (${run.topRisk}/100)`),
    labelValue('Trạng thái', run.status === 'processed' ? 'Đã xử lý' : 'Đang mở'),
    body(run.summary),

    separator(),

    heading('II. THỐNG KÊ ALERT', HeadingLevel.HEADING_1),
    makeTable(
      ['Khẩn cấp', 'Cần rà soát', 'Theo dõi', 'Tổng cộng'],
      [[
        String(run.counts.urgent),
        String(run.counts.review),
        String(run.counts.monitor),
        String(run.analyses.length),
      ]],
    ),

    separator(),

    heading('III. DANH SÁCH ALERT CON', HeadingLevel.HEADING_1),
    makeTable(
      ['Mã', 'Tiêu đề', 'Mức độ', 'Rủi ro', 'Trạng thái', 'Hạn xử lý'],
      run.analyses.map(analysis => [
        analysis.code,
        analysis.title,
        SEVERITY_VI[analysis.severity] ?? analysis.severity,
        `${analysis.overall_risk.label} (${analysis.overall_risk.value}/100)`,
        analysis.status === 'processed' ? 'Đã xử lý' : 'Đang mở',
        analysis.deadline ?? '',
      ]),
    ),
    body(''),

    ...run.analyses.flatMap((analysis, index) => [
      heading(`${index + 1}. ${analysis.code} - ${analysis.title}`, HeadingLevel.HEADING_2),
      labelValue('Mức độ', SEVERITY_VI[analysis.severity] ?? analysis.severity),
      labelValue('Rủi ro', `${analysis.overall_risk.label} (${analysis.overall_risk.value}/100)`),
      body(analysis.summary),
    ]),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 22 },
        },
      },
    },
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(run.documentTitle)}-analysis-run.docx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportAnalysisDocx(analysis: AnalysisDetail): Promise<void> {
  const severityLabel = SEVERITY_VI[analysis.severity] ?? analysis.severity
  const date = new Date(analysis.created_at).toLocaleDateString('vi-VN')

  const children = [
    // ── Cover info ──
    new Paragraph({
      children: [new TextRun({ text: 'BÁO CÁO PHÂN TÍCH TUÂN THỦ QUY ĐỊNH', bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Mã: ${analysis.code}`, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Ngày tạo: ${date}`, size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
    }),

    separator(),

    // ── Thông tin chung ──
    heading('I. THÔNG TIN CHUNG', HeadingLevel.HEADING_1),
    labelValue('Tiêu đề', analysis.title),
    labelValue('Mức độ', severityLabel),
    labelValue('Mức rủi ro tổng', `${analysis.overall_risk.label} (${analysis.overall_risk.value}/100)`),
    ...(analysis.deadline ? [labelValue('Hạn xử lý', analysis.deadline)] : []),
    body(''),
    body(analysis.summary),

    separator(),

    // ── Phân tích xung đột ──
    heading('II. PHÂN TÍCH XUNG ĐỘT', HeadingLevel.HEADING_1),
    body(analysis.conflict_headline, true),
    body(''),
    heading('Quy định hiện hành', HeadingLevel.HEADING_2),
    labelValue('Nguồn', analysis.compare_left.source),
    labelValue('Kết luận', analysis.compare_left.verdict),
    body(`"${analysis.compare_left.quote}"`),
    body(''),
    heading('Quy định mới / đối chiếu', HeadingLevel.HEADING_2),
    labelValue('Nguồn', analysis.compare_right.source),
    labelValue('Kết luận', analysis.compare_right.verdict),
    body(`"${analysis.compare_right.quote}"`),
    body(''),
    heading('Điểm xung đột', HeadingLevel.HEADING_2),
    body(analysis.conflict_note),

    separator(),

    // ── Tác động nghiệp vụ ──
    heading('III. TÁC ĐỘNG NGHIỆP VỤ', HeadingLevel.HEADING_1),
    makeTable(
      ['Lĩnh vực', 'Chi tiết tác động', 'Mức rủi ro'],
      analysis.business_impacts.map(imp => [
        imp.area,
        imp.detail,
        SEVERITY_VI[imp.risk] ?? imp.risk,
      ])
    ),
    body(''),

    separator(),

    // ── Chỉ số rủi ro ──
    heading('IV. CHỈ SỐ RỦI RO', HeadingLevel.HEADING_1),
    makeTable(
      ['Chỉ số', 'Điểm (0–100)', 'Mức độ'],
      analysis.risk_scores.map(s => [s.label, String(s.value), s.level])
    ),
    body(''),
    body(`TỔNG RỦI RO: ${analysis.overall_risk.label} — ${analysis.overall_risk.value}/100`, true),
    body(analysis.risk_conclusion),

    separator(),

    // ── Phân tích chi tiết ──
    heading('V. PHÂN TÍCH CHI TIẾT', HeadingLevel.HEADING_1),
    ...analysis.detail_tables.flatMap(tbl => [
      heading(tbl.title, HeadingLevel.HEADING_2),
      makeTable(
        tbl.headers,
        tbl.rows.map(row => [row.col1, row.col2, row.col3, STATUS_VI[row.status] ?? ''])
      ),
      body(''),
    ]),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 22 },
        },
      },
    },
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${analysis.code}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
