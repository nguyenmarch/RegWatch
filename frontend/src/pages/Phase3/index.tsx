import React, { useState, useEffect, useRef } from 'react';
import styles from './Phase3.module.css';
import { api } from '../../lib/api';

type UploadState = 'idle' | 'uploading' | 'ok' | 'error';

interface DocEntry {
  task: any;
  doc: any;
  parsed: any;
  refinementOpen?: boolean;
  refinementPrompt?: string;
}

interface GroupedDocEntry {
  docName: string;
  tasks: any[];
  taskIds: number[];
  doc: any | null;
  parsed: any | null;
  refinementOpen?: boolean;
  refinementPrompt?: string;
  isGenerating: boolean;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Phase3() {
  const [actionPlans, setActionPlans]   = useState<any[]>([]);
  const [selectedApId, setSelectedApId] = useState(() => sessionStorage.getItem('phase3_selectedApId') || '');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(() => {
    const saved = sessionStorage.getItem('phase3_selectedTaskIds');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [docMap, setDocMap]             = useState<Map<number, DocEntry>>(new Map());
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading]       = useState(true);
  const [uploadState, setUploadState]   = useState<UploadState>('idle');
  const [uploadMsg, setUploadMsg]       = useState('');
  const uploadInputRef                  = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchActionPlans(); }, []);

  const fetchActionPlans = async () => {
    setIsLoading(true);
    try {
      const data = await api.phase3.getActionPlans();
      setActionPlans(Array.isArray(data) ? data : []);
    } catch { setActionPlans([]); }
    setIsLoading(false);
  };

  useEffect(() => {
    sessionStorage.setItem('phase3_selectedApId', selectedApId);
  }, [selectedApId]);

  useEffect(() => {
    sessionStorage.setItem('phase3_selectedTaskIds', JSON.stringify(Array.from(selectedTaskIds)));
  }, [selectedTaskIds]);

  useEffect(() => {
    if (actionPlans.length > 0 && selectedApId) {
      const ap = actionPlans.find(a => a.id.toString() === selectedApId);
      if (ap) {
        const map = new Map<number, DocEntry>();
        ap.tasks?.forEach((task: any) => {
          if (task.document) {
            let parsed = null;
            try { parsed = JSON.parse(task.document.content); } catch {}
            map.set(task.id, { task, doc: task.document, parsed });
          }
        });
        setDocMap(map);
      }
    }
  }, [actionPlans, selectedApId]);

  // ── Action Plan change ───────────────────────────────────────────────────
  const handleApChange = (apId: string) => {
    setSelectedApId(apId);
    setSelectedTaskIds(new Set());
  };

  const handleDeleteAp = async (apId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa Action Plan này và tất cả văn bản sinh ra?')) return;
    try {
      await api.phase3.deleteActionPlan(Number(apId));
      if (selectedApId === apId) {
        setSelectedApId('');
        setSelectedTaskIds(new Set());
        setDocMap(new Map());
      }
      fetchActionPlans();
    } catch (e) {
      alert('Lỗi khi xóa Action Plan');
      console.error(e);
    }
  };

  // ── Task selection ───────────────────────────────────────────────────────
  const toggleTask = (taskId: number) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const selectedAp   = actionPlans.find(ap => ap.id.toString() === selectedApId);
  const allTasks: any[] = selectedAp?.tasks ?? [];
  const allSelected  = allTasks.length > 0 && selectedTaskIds.size === allTasks.length;
  const someSelected = selectedTaskIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedTaskIds(new Set());
    else setSelectedTaskIds(new Set(allTasks.map((t: any) => t.id)));
  };

  // ── Batch generate (grouped by document) ──────────────────────────────────
  const handleGenerateSelected = async (type: 'document' | 'announcement') => {
    if (!selectedTaskIds.size || !selectedAp) return;

    // Group selected tasks by impacted_internal_doc name
    const groups: { [key: string]: number[] } = {};
    selectedTaskIds.forEach(tid => {
      const task = allTasks.find((t: any) => t.id === tid);
      if (!task) return;
      const docName = task.impacted_internal_doc || "Văn bản đào tạo / chưa phân loại";
      if (!groups[docName]) groups[docName] = [];
      groups[docName].push(tid);
    });

    setGeneratingIds(new Set(selectedTaskIds));

    // Call group generation in parallel for each unique document group
    const results = await Promise.allSettled(
      Object.keys(groups).map(async (docName) => {
        const tids = groups[docName];
        const docs = await api.phase3.generateGroupDocument(tids, undefined, type);
        return docs;
      })
    );

    setDocMap(prev => {
      const next = new Map(prev);
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          const docs = result.value;
          docs.forEach(doc => {
            const task = allTasks.find((t: any) => t.id === doc.task_id);
            let parsed = null;
            try { parsed = JSON.parse(doc.content); } catch {}
            next.set(doc.task_id, { task, doc, parsed });
          });
        }
      });
      return next;
    });

    setGeneratingIds(new Set());
  };

  // ── Per-document group actions ───────────────────────────────────────────
  const handleSaveDoc = async (taskIds: number[], content: any) => {
    try {
      const results = await Promise.all(
        taskIds.map(async (tid) => {
          const entry = docMap.get(tid);
          if (entry?.doc) {
            const updated = await api.phase3.updateDocument(entry.doc.id, JSON.stringify(content));
            return { tid, doc: updated };
          }
          return null;
        })
      );
      setDocMap(prev => {
        const next = new Map(prev);
        results.forEach(res => {
          if (res) {
            const e = next.get(res.tid)!;
            next.set(res.tid, { ...e, doc: res.doc, parsed: content });
          }
        });
        return next;
      });
    } catch (e) { console.error(e); }
  };

  const handleApproveDoc = async (taskIds: number[], role: string) => {
    try {
      const results = await Promise.all(
        taskIds.map(async (tid) => {
          const entry = docMap.get(tid);
          if (entry?.doc) {
            const updated = await api.phase3.approveDocument(entry.doc.id, role);
            return { tid, doc: updated };
          }
          return null;
        })
      );
      setDocMap(prev => {
        const next = new Map(prev);
        results.forEach(res => {
          if (res) {
            const e = next.get(res.tid)!;
            next.set(res.tid, { ...e, doc: res.doc });
          }
        });
        return next;
      });
    } catch (e) { console.error(e); }
  };

  const handleRefineDoc = async (taskIds: number[], refinementPrompt: string) => {
    if (!refinementPrompt.trim()) return;

    setGeneratingIds(prev => {
      const next = new Set(prev);
      taskIds.forEach(tid => next.add(tid));
      return next;
    });

    try {
      const docs = await api.phase3.generateGroupDocument(taskIds, refinementPrompt, 'document');
      setDocMap(prev => {
        const next = new Map(prev);
        docs.forEach(doc => {
          const task = allTasks.find((t: any) => t.id === doc.task_id);
          let parsed = null;
          try { parsed = JSON.parse(doc.content); } catch {}
          next.set(doc.task_id, {
            task,
            doc,
            parsed,
            refinementPrompt: '',
            refinementOpen: false
          });
        });
        return next;
      });
    } catch (e) { console.error(e); }

    setGeneratingIds(prev => {
      const next = new Set(prev);
      taskIds.forEach(tid => next.delete(tid));
      return next;
    });
  };

  const toggleRefinement = (taskIds: number[]) => {
    setDocMap(prev => {
      const next = new Map(prev);
      taskIds.forEach(tid => {
        const e = next.get(tid);
        if (e) next.set(tid, { ...e, refinementOpen: !e.refinementOpen });
      });
      return next;
    });
  };

  const setRefinementPrompt = (taskIds: number[], prompt: string) => {
    setDocMap(prev => {
      const next = new Map(prev);
      taskIds.forEach(tid => {
        const e = next.get(tid);
        if (e) next.set(tid, { ...e, refinementPrompt: prompt });
      });
      return next;
    });
  };

  const exportDoc = (taskIds: number[]) => {
    let html = null;
    let docName = "van_ban";
    for (const tid of taskIds) {
      const entry = docMap.get(tid);
      if (entry?.parsed?.modified_document) {
        html = entry.parsed.modified_document;
        docName = entry.task.impacted_internal_doc || `task_${tid}`;
        break;
      }
    }
    if (!html) return;
    const blob  = new Blob([html], { type: 'application/msword' });
    const url   = URL.createObjectURL(blob);
    const a     = window.document.createElement('a');
    a.href      = url;
    a.download  = `${docName}_sửa_đổi_${Date.now()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUploadJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadState('uploading');
    setUploadMsg('');
    try {
      const result  = await api.phase3.uploadActionPlan(file);
      const created = result?.created ?? result?.plans_created ?? '?';
      const skipped = result?.skipped ?? result?.plans_skipped ?? 0;
      setUploadMsg(`✓ Import ${created} plan${skipped ? `, bỏ qua ${skipped} trùng` : ''}`);
      setUploadState('ok');
      await fetchActionPlans();
    } catch (err: any) {
      setUploadMsg(`✗ ${err.message ?? 'Upload thất bại'}`);
      setUploadState('error');
    } finally {
      setTimeout(() => { setUploadState('idle'); setUploadMsg(''); }, 4000);
    }
  };

  // ── Group rendering entries ───────────────────────────────────────────────
  const renderEntries: GroupedDocEntry[] = [];

  if (selectedAp) {
    const selectedGroups = new Map<string, any[]>();
    selectedTaskIds.forEach(tid => {
      const task = allTasks.find((t: any) => t.id === tid);
      if (!task) return;
      const docName = task.impacted_internal_doc || "Văn bản đào tạo / chưa phân loại";
      if (!selectedGroups.has(docName)) {
        selectedGroups.set(docName, []);
      }
      selectedGroups.get(docName)!.push(task);
    });

    selectedGroups.forEach((tasksInGroup, docName) => {
      const taskIds = tasksInGroup.map(t => t.id);
      const isGenerating = taskIds.some(tid => generatingIds.has(tid));

      // Find if any task in this group has a document in the docMap
      let matchedDoc = null;
      let matchedParsed = null;
      let matchedRefinementOpen = false;
      let matchedRefinementPrompt = '';

      for (const t of tasksInGroup) {
        const entry = docMap.get(t.id);
        if (entry?.doc) {
          matchedDoc = entry.doc;
          matchedParsed = entry.parsed;
          matchedRefinementOpen = entry.refinementOpen ?? false;
          matchedRefinementPrompt = entry.refinementPrompt ?? '';
          break;
        }
      }

      renderEntries.push({
        docName,
        tasks: tasksInGroup,
        taskIds,
        doc: matchedDoc,
        parsed: matchedParsed,
        refinementOpen: matchedRefinementOpen,
        refinementPrompt: matchedRefinementPrompt,
        isGenerating,
      });
    });
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>

      {/* ════ TOP BAR ════ */}
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>

          <div className={styles.brand}>
            <span className={styles.brandBadge}>Phase 3</span>
            <span className={styles.brandTitle}>Compliance Workspace</span>
          </div>

          <div className={styles.selectors}>
            <div className={styles.topSelectWrap}>
              <label className={styles.selectLabel}>Action Plan</label>
              <div className={styles.selectWithDelete}>
                <select
                  className={styles.planSelect}
                  value={selectedApId}
                  disabled={isLoading}
                  onChange={e => handleApChange(e.target.value)}
                >
                  <option value="" disabled>Chọn Action Plan...</option>
                  {actionPlans.map(ap => (
                    <option key={ap.id} value={ap.id.toString()}>
                      {ap.plan_code} — {ap.law_id}
                    </option>
                  ))}
                </select>
                {selectedApId && (
                  <button
                    className={styles.deleteApBtn}
                    onClick={() => handleDeleteAp(selectedApId)}
                    title="Xóa Action Plan"
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Upload JSON */}
          <div className={styles.uploadGroup}>
            <input
              ref={uploadInputRef}
              id="upload-action-plan-input"
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleUploadJson}
            />
            <button
              id="btn-upload-action-plan"
              className={`${styles.uploadBtn} ${uploadState === 'ok' ? styles.uploadBtnOk : ''} ${uploadState === 'error' ? styles.uploadBtnErr : ''}`}
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadState === 'uploading'}
            >
              {uploadState === 'uploading' ? <><span className={styles.spinner}/> Uploading...</> : <>📁 Upload JSON</>}
            </button>
            {uploadMsg && (
              <span className={`${styles.uploadToast} ${uploadState === 'error' ? styles.uploadToastErr : ''}`}>
                {uploadMsg}
              </span>
            )}
          </div>

          {/* Batch generate */}
          <div className={styles.generateGroup}>
            <button
              id="btn-generate-selected"
              className={styles.generateBtn}
              onClick={() => handleGenerateSelected('document')}
              disabled={!someSelected || generatingIds.size > 0}
              title="Chỉnh sửa văn bản cũ"
            >
              {generatingIds.size > 0 ? (
                <><span className={styles.spinner}/> Đang sinh ({generatingIds.size})...</>
              ) : (
                <>
                  ✦ Chỉnh sửa văn bản cũ
                  {someSelected && <span className={styles.genCount}>{selectedTaskIds.size}</span>}
                </>
              )}
            </button>
            <button
              id="btn-generate-training"
              className={`${styles.generateBtn} ${styles.generateBtnAlt}`}
              onClick={() => handleGenerateSelected('announcement')}
              disabled={!someSelected || generatingIds.size > 0}
              title="Sinh văn bản đào tạo nội bộ"
            >
              🎓 Sinh VB Đào tạo
            </button>
          </div>
        </div>
      </header>

      {/* ════ MAIN ════ */}
      <main className={styles.main}>
        {!selectedAp ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⚖</div>
            <h2 className={styles.emptyTitle}>Chọn Action Plan để bắt đầu</h2>
            <p className={styles.emptyDesc}>
              Sau khi chọn plan, tick các tác vụ cần xử lý rồi nhấn <strong>✦ Sinh văn bản</strong>.
              AI sẽ tự động gom nhóm các tác vụ tác động lên cùng một văn bản nội bộ
              và sửa đổi chúng song song.
            </p>
          </div>
        ) : (
          <div className={styles.workspaceLayout}>

            {/* ── LEFT: Task checklist ── */}
            <aside className={styles.taskPanel}>
              <div className={styles.taskPanelHeader}>
                <span className={styles.taskPanelTitle}>Danh sách tác vụ</span>
                <span className={styles.taskPanelMeta}>{selectedAp.law_id}</span>
              </div>

              <div className={styles.taskPanelList}>
                {/* Select all */}
                <label className={styles.taskSelectAll}>
                  <input
                    type="checkbox"
                    className={styles.taskCheckboxInput}
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                  <span className={styles.taskCheckboxCustom}/>
                  <span className={styles.taskSelectAllLabel}>
                    {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    <span className={styles.taskTotalBadge}>{allTasks.length}</span>
                  </span>
                </label>

                <div className={styles.taskDivider}/>

                {allTasks.map((task: any) => {
                  const checked = selectedTaskIds.has(task.id);
                  const hasDoc  = docMap.has(task.id);
                  const isGen   = generatingIds.has(task.id);
                  return (
                    <label
                      key={task.id}
                      className={`${styles.taskItem} ${checked ? styles.taskItemChecked : ''} ${isGen ? styles.taskItemGenerating : ''}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.taskCheckboxInput}
                        checked={checked}
                        onChange={() => toggleTask(task.id)}
                      />
                      <span className={`${styles.taskCheckboxCustom} ${checked ? styles.taskCheckboxChecked : ''}`}/>
                      <div className={styles.taskItemBody}>
                        <div className={styles.taskItemTop}>
                          <span className={styles.taskDeptBadge}>{task.target_department}</span>
                          {hasDoc && !isGen && <span className={styles.taskDocDot} title="Đã có văn bản">✓</span>}
                          {isGen && <span className={styles.taskGenSpinner}/>}
                        </div>
                        <p className={styles.taskItemName}>{task.task_name}</p>
                        {task.impacted_internal_doc && (
                          <p className={styles.taskItemDoc}>→ {task.impacted_internal_doc}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className={styles.taskPanelFooter}>
                {someSelected
                  ? <span className={styles.selectedCount}>✦ {selectedTaskIds.size} tác vụ đã chọn</span>
                  : <span className={styles.selectedCountEmpty}>Chưa chọn tác vụ nào</span>
                }
              </div>
            </aside>

            {/* ── RIGHT: Document stack ── */}
            <div className={styles.docStack}>
              {renderEntries.length === 0 ? (
                <div className={styles.docStackEmpty}>
                  <div className={styles.docStackEmptyIcon}>📄</div>
                  <p>Tick tác vụ bên trái để xem các văn bản cần sửa đổi.</p>
                  <p>Các tác vụ cùng tác động lên 1 văn bản sẽ tự động được gộp lại.</p>
                </div>
              ) : (
                renderEntries.map((group) => (
                  <DocSection
                    key={group.docName}
                    group={group}
                    onSave={handleSaveDoc}
                    onApprove={handleApproveDoc}
                    onRefine={handleRefineDoc}
                    onExport={exportDoc}
                    onToggleRefinement={toggleRefinement}
                    onSetRefinementPrompt={setRefinementPrompt}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── DocSection ────────────────────────────────────────────────────────────────
interface DocSectionProps {
  group: GroupedDocEntry;
  onSave: (taskIds: number[], content: any) => void;
  onApprove: (taskIds: number[], role: string) => void;
  onRefine: (taskIds: number[], prompt: string) => void;
  onExport: (taskIds: number[]) => void;
  onToggleRefinement: (taskIds: number[]) => void;
  onSetRefinementPrompt: (taskIds: number[], prompt: string) => void;
}

function DocSection({
  group,
  onSave, onApprove, onRefine, onExport,
  onToggleRefinement, onSetRefinementPrompt,
}: DocSectionProps) {
  const [approveRole, setApproveRole] = useState('product');
  const doc    = group.doc;
  const parsed = group.parsed;
  const targetDepts = Array.from(new Set(group.tasks.map(t => t.target_department)));
  const taskCodes = group.tasks.map(t => t.task_code).join(', ');

  return (
    <div className={styles.docSection}>

      {/* Section toolbar */}
      <div className={styles.docSectionBar}>
        <div className={styles.docSectionBarLeft}>
          <span className={styles.deptBadge}>{targetDepts.join(' · ')}</span>
          <span className={styles.docSectionCode}>({taskCodes})</span>
          <span className={styles.docSectionName}>{group.docName}</span>
        </div>

        <div className={styles.docSectionBarRight}>
          {doc && (
            <span className={`${styles.statusBadge} ${styles[`status${doc.status}`]}`}>
              {doc.status}
            </span>
          )}

          {/* Approval dots */}
          {doc && (
            <div className={styles.approvalDots} title="Product · Compliance">
              <span className={`${styles.adot} ${doc.product_approved ? styles.adotOk : ''}`}/>
              <span className={`${styles.adot} ${doc.cd_approved ? styles.adotOk : ''}`}/>
            </div>
          )}

          {doc && (
            <>
              {/* Refine */}
              <button
                className={`${styles.secBtn} ${group.refinementOpen ? styles.secBtnActive : ''}`}
                onClick={() => onToggleRefinement(group.taskIds)}
                title="Tinh chỉnh AI"
              >
                ✨
              </button>
              {/* Save */}
              <button className={styles.secBtn} onClick={() => onSave(group.taskIds, parsed)} title="Lưu bản nháp">
                💾
              </button>
              {/* Export */}
              <button className={styles.secBtn} onClick={() => onExport(group.taskIds)} title="Export .doc">
                ↓ .doc
              </button>
              {/* Approve */}
              <div className={styles.approveInline}>
                <select
                  className={styles.approveMiniSelect}
                  value={approveRole}
                  onChange={e => setApproveRole(e.target.value)}
                >
                  <option value="product">Product</option>
                  <option value="cd">Compliance</option>
                </select>
                <button
                  className={styles.approveMiniBtn}
                  onClick={() => onApprove(group.taskIds, approveRole)}
                  disabled={doc?.status === 'APPROVED'}
                >
                  ✍ Ký
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Refinement input (collapsible) */}
      {group.refinementOpen && (
        <div className={styles.refinementBar}>
          <span className={styles.refinementIcon}>✨</span>
          <input
            className={styles.refinementInput}
            placeholder="Yêu cầu tinh chỉnh nội dung văn bản này... (Enter để gửi)"
            value={group.refinementPrompt || ''}
            onChange={e => onSetRefinementPrompt(group.taskIds, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) onRefine(group.taskIds, group.refinementPrompt || ''); }}
            autoFocus
          />
          <button
            className={styles.refineBarBtn}
            onClick={() => onRefine(group.taskIds, group.refinementPrompt || '')}
            disabled={!group.refinementPrompt?.trim()}
          >
            Gửi
          </button>
        </div>
      )}

      {/* Document content */}
      <div className={styles.docSectionContent}>
        {group.isGenerating ? (
          <div className={styles.generatingState}>
            <div className={styles.generatingDots}><span/><span/><span/></div>
            <p className={styles.generatingText}>
              Đang gộp <strong>{group.tasks.length} tác vụ</strong> và sinh nội dung sửa đổi cho <strong>{group.docName}</strong>...
            </p>
          </div>
        ) : parsed?.modified_document || parsed?.old_document ? (
          <div className={styles.annotationLayout}>
            <div
              className={styles.annotationEditor}
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                if (parsed) {
                  parsed.modified_document = e.currentTarget.innerHTML;
                  onSave(group.taskIds, parsed);
                }
              }}
              dangerouslySetInnerHTML={{ 
                __html: parsed.modified_document || parsed.old_document?.replace(/\n/g, '<br/>') || '' 
              }}
            />
            <div className={styles.annotationSidebar}>
              {parsed?.comments?.map((comment: any, idx: number) => (
                <div key={idx} className={styles.commentCard}>
                  <div className={styles.commentCardHeader}>
                    <span className={styles.commentTaskName}>{comment.task_name || 'Đề xuất thay đổi'}</span>
                  </div>
                  <p className={styles.commentReason}>{comment.reason}</p>
                </div>
              ))}
              {(!parsed?.comments || parsed.comments.length === 0) && (
                <div className={styles.commentCard} style={{ opacity: 0.6 }}>
                  <p className={styles.commentReason}>Chưa có đề xuất thay đổi nào (Hoặc sinh bằng phiên bản cũ).</p>
                </div>
              )}
            </div>
          </div>
        ) : parsed?.announcement ? (
          <div className={styles.singleDocView}>
            <div className={styles.docPaperWide}>
              <div className={styles.paperHeader}>
                <div className={styles.paperHeaderLeft}>
                  <span className={styles.paperLabel}>🎓 Văn bản đào tạo / Thông báo</span>
                  <span className={styles.paperMeta}>{group.docName}</span>
                </div>
                <span className={styles.tagAI}>AI GENERATED</span>
              </div>
              <div
                className={styles.paperBody}
                dangerouslySetInnerHTML={{ __html: parsed.announcement.replace(/\n/g, '<br/>') }}
              />
            </div>
          </div>
        ) : doc ? (
          <div className={styles.docSectionEmpty}>
            <p>Nội dung chưa được sinh. Nhấn ✨ tinh chỉnh hoặc sinh lại.</p>
          </div>
        ) : (
          <div className={styles.docSectionEmpty}>
            <p>Văn bản chưa được sinh. Hãy nhấn nút <strong>✦ Chỉnh sửa văn bản cũ</strong> ở thanh công cụ phía trên.</p>
          </div>
        )}
      </div>
    </div>
  );
}
