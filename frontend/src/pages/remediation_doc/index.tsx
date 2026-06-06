import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './remediation_doc.module.css';
import { api } from '../../lib/api';
import {
    ScaleIcon, FileTextIcon, LayersIcon, CheckCircleIcon, CheckIcon,
    SparklesIcon, ClockIcon, SaveIcon, DownloadIcon, EditIcon,
    BookOpenIcon, PenLineIcon, GraduationCapIcon, FileBadgeIcon, SendIcon,
} from '../../components/Icons';

type PageTab = 'workspace' | 'signed';

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
    selectedDraftId?: number | null;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Remediation() {
    const { t } = useTranslation();
    const [pageTab, setPageTab] = useState<PageTab>('workspace');
    const [actionPlans, setActionPlans] = useState<any[]>([]);
    const [selectedApId, setSelectedApId] = useState(() => sessionStorage.getItem('remediation_selectedApId') || '');
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(() => {
        const saved = sessionStorage.getItem('remediation_selectedTaskIds');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [docMap, setDocMap] = useState<Map<number, DocEntry>>(new Map());
    const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDraftsByDoc, setSelectedDraftsByDoc] = useState<Map<string, number>>(new Map());

    useEffect(() => { fetchActionPlans(); }, []);

    const fetchActionPlans = async () => {
        setIsLoading(true);
        try {
            const data = await api.remediation.getActionPlans();
            const plans = Array.isArray(data) ? data : [];
            setActionPlans(plans);
            setSelectedApId(prev => {
                const stillValid = plans.some(p => p.id.toString() === prev);
                if (stillValid) return prev;
                return plans.length > 0 ? plans[0].id.toString() : '';
            });
        } catch { setActionPlans([]); }
        setIsLoading(false);
    };

    useEffect(() => {
        sessionStorage.setItem('remediation_selectedApId', selectedApId);
    }, [selectedApId]);

    useEffect(() => {
        sessionStorage.setItem('remediation_selectedTaskIds', JSON.stringify(Array.from(selectedTaskIds)));
    }, [selectedTaskIds]);

    useEffect(() => {
        if (actionPlans.length > 0 && selectedApId) {
            const ap = actionPlans.find(a => a.id.toString() === selectedApId);
            if (ap) {
                const map = new Map<number, DocEntry>();
                ap.tasks?.forEach((task: any) => {
                    if (task.document) {
                        let parsed = null;
                        try { parsed = JSON.parse(task.document.content); } catch { }
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
        if (!confirm(t('remediation.confirmDeletePlan'))) return;
        try {
            await api.remediation.deleteActionPlan(Number(apId));
            if (selectedApId === apId) {
                setSelectedApId('');
                setSelectedTaskIds(new Set());
                setDocMap(new Map());
            }
            fetchActionPlans();
        } catch (e) {
            alert(t('remediation.deleteError'));
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

    const selectedAp = actionPlans.find(ap => ap.id.toString() === selectedApId);
    const allTasks: any[] = selectedAp?.tasks ?? [];
    const allSelected = allTasks.length > 0 && selectedTaskIds.size === allTasks.length;
    const someSelected = selectedTaskIds.size > 0;

    const resolvedTaskNames = new Set<string>();
    docMap.forEach(entry => {
        entry.parsed?.comments?.forEach((c: any) => {
            if (c.resolved && c.task_name) resolvedTaskNames.add(c.task_name);
        });
    });

    const selectedGroups = new Map<string, any[]>();
    selectedTaskIds.forEach(tid => {
        const task = allTasks.find((t: any) => t.id === tid);
        if (!task) return;
        const docName = task.impacted_internal_doc || "Văn bản đào tạo / chưa phân loại";
        if (!selectedGroups.has(docName)) selectedGroups.set(docName, []);
        selectedGroups.get(docName)!.push(task);
    });

    const allGroupsHaveDraft = selectedGroups.size === 0 ||
        Array.from(selectedGroups.keys()).every(docName => selectedDraftsByDoc.has(docName));

    const toggleSelectAll = () => {
        if (allSelected) setSelectedTaskIds(new Set());
        else setSelectedTaskIds(new Set(allTasks.map((t: any) => t.id)));
    };

    const handleSelectDraft = (docName: string, draftId: number) => {
        setSelectedDraftsByDoc(prev => new Map(prev).set(docName, draftId));
    };

    // ── Batch generate ────────────────────────────────────────────────────────
    const handleGenerateSelected = async (type: 'document' | 'announcement') => {
        if (!selectedTaskIds.size || !selectedAp) return;

        const groups: { [key: string]: number[] } = {};
        selectedTaskIds.forEach(tid => {
            const task = allTasks.find((t: any) => t.id === tid);
            if (!task) return;
            const docName = task.impacted_internal_doc || "Văn bản đào tạo / chưa phân loại";
            if (!groups[docName]) groups[docName] = [];
            groups[docName].push(tid);
        });

        if (type === 'announcement') {
            for (const docName of Object.keys(groups)) {
                if (!selectedDraftsByDoc.has(docName)) {
                    alert(t('remediation.selectDraftFirst', { docName }));
                    return;
                }
            }
        }

        setGeneratingIds(new Set(selectedTaskIds));

        const results = await Promise.allSettled(
            Object.keys(groups).map(async (docName) => {
                const tids = groups[docName];
                const refinementPrompt = type === 'announcement' ? `Dùng bản nháp ID ${selectedDraftsByDoc.get(docName)}` : undefined;
                const docs = await api.remediation.generateGroupDocument(selectedApId, tids, refinementPrompt, type);
                return docs;
            })
        );

        setDocMap(prev => {
            const next = new Map(prev);
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    result.value.forEach(doc => {
                        const task = allTasks.find((t: any) => t.id === doc.task_id);
                        let parsed = null;
                        try { parsed = JSON.parse(doc.content); } catch { }
                        next.set(doc.task_id, { task, doc, parsed });
                    });
                }
            });
            return next;
        });

        setGeneratingIds(new Set());
    };

    // ── Per-document actions ──────────────────────────────────────────────────
    const handleSaveDoc = async (taskIds: number[], content: any) => {
        try {
            const results = await Promise.all(
                taskIds.map(async (tid) => {
                    const entry = docMap.get(tid);
                    if (entry?.doc) {
                        const updated = await api.remediation.updateDocument(entry.doc.id, JSON.stringify(content));
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

    const handleSaveDraft = async (taskIds: number[], content: any) => {
        try {
            let lastDrafts: any[] = [];
            const results = await Promise.all(
                taskIds.map(async (tid) => {
                    const entry = docMap.get(tid);
                    if (entry?.doc) {
                        const drafts = await api.remediation.saveDraft(entry.doc.id, JSON.stringify(content), "Sếp/Chuyên viên");
                        lastDrafts = drafts;
                        return { tid, doc: { ...entry.doc, status: 'PENDING', product_approved: false, cd_approved: false } };
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
            return lastDrafts;
        } catch (e) { console.error(e); return []; }
    };

    const handleApproveDoc = async (taskIds: number[], role: string) => {
        try {
            const results = await Promise.all(
                taskIds.map(async (tid) => {
                    const entry = docMap.get(tid);
                    if (entry?.doc) {
                        const updated = await api.remediation.approveDocument(entry.doc.id, role);
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
        setGeneratingIds(prev => { const next = new Set(prev); taskIds.forEach(tid => next.add(tid)); return next; });
        try {
            const docs = await api.remediation.generateGroupDocument(selectedApId, taskIds, refinementPrompt, 'document');
            setDocMap(prev => {
                const next = new Map(prev);
                docs.forEach(doc => {
                    const task = allTasks.find((t: any) => t.id === doc.task_id);
                    let parsed = null;
                    try { parsed = JSON.parse(doc.content); } catch { }
                    next.set(doc.task_id, { task, doc, parsed, refinementPrompt: '', refinementOpen: false });
                });
                return next;
            });
        } catch (e) { console.error(e); }
        setGeneratingIds(prev => { const next = new Set(prev); taskIds.forEach(tid => next.delete(tid)); return next; });
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
        const blob = new Blob([html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${docName}_sửa_đổi_${Date.now()}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Group rendering entries ───────────────────────────────────────────────
    const renderEntries: GroupedDocEntry[] = [];
    if (selectedAp) {
        const selGroups = new Map<string, any[]>();
        selectedTaskIds.forEach(tid => {
            const task = allTasks.find((t: any) => t.id === tid);
            if (!task) return;
            const docName = task.impacted_internal_doc || "Văn bản đào tạo / chưa phân loại";
            if (!selGroups.has(docName)) selGroups.set(docName, []);
            selGroups.get(docName)!.push(task);
        });
        selGroups.forEach((tasksInGroup, docName) => {
            const taskIds = tasksInGroup.map(t => t.id);
            const isGenerating = taskIds.some(tid => generatingIds.has(tid));
            let matchedDoc = null, matchedParsed = null, matchedRefinementOpen = false, matchedRefinementPrompt = '';
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
                docName, tasks: tasksInGroup, taskIds, doc: matchedDoc, parsed: matchedParsed,
                refinementOpen: matchedRefinementOpen, refinementPrompt: matchedRefinementPrompt,
                isGenerating, selectedDraftId: selectedDraftsByDoc.get(docName) ?? null,
            });
        });
    }

    // ── Signed documents (all plans) ─────────────────────────────────────────
    const signedDocs: { plan: any; task: any; doc: any; parsed: any }[] = [];
    actionPlans.forEach(plan => {
        plan.tasks?.forEach((task: any) => {
            const doc = task.document;
            if (doc && (doc.status === 'APPROVED' || doc.product_approved || doc.cd_approved)) {
                let parsed = null;
                try { parsed = JSON.parse(doc.content); } catch { }
                signedDocs.push({ plan, task, doc, parsed });
            }
        });
    });

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div className={styles.wrapper}>

            {/* ════ TOP BAR ════ */}
            <header className={styles.topBar}>
                <div className={styles.topBarInner}>

                    <div className={styles.brand}>
                        <span className={styles.brandBadge}>{t('remediation.phase')}</span>
                        <span className={styles.brandTitle}>{t('remediation.pageTitle')}</span>
                    </div>

                    {/* Page tabs */}
                    <div className={styles.pageTabs}>
                        <button
                            className={`${styles.pageTab} ${pageTab === 'workspace' ? styles.pageTabActive : ''}`}
                            onClick={() => setPageTab('workspace')}
                        >
                            <LayersIcon size={14} />{t('remediation.tabWorkspace')}
                        </button>
                        <button
                            className={`${styles.pageTab} ${pageTab === 'signed' ? styles.pageTabActive : ''}`}
                            onClick={() => setPageTab('signed')}
                        >
                            <FileBadgeIcon size={14} />{t('remediation.tabSigned')}
                            {signedDocs.length > 0 && (
                                <span className={styles.pageTabBadge}>{signedDocs.length}</span>
                            )}
                        </button>
                    </div>

                    {/* Workspace-only controls */}
                    {pageTab === 'workspace' && (
                        <>
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
                                            <option value="" disabled>{t('remediation.selectPlanPlaceholder')}</option>
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
                                                title={t('remediation.deletePlanTitle')}
                                            >
                                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.generateGroup}>
                                <button
                                    className={styles.generateBtn}
                                    onClick={() => handleGenerateSelected('document')}
                                    disabled={!someSelected || generatingIds.size > 0}
                                    title={t('remediation.generateDocTitle')}
                                >
                                    {generatingIds.size > 0 ? (
                                        <><span className={styles.spinner} /> {t('remediation.generating', { count: generatingIds.size })}</>
                                    ) : (
                                        <>
                                            <EditIcon size={15} />{t('remediation.generateDocBtn')}
                                            {someSelected && <span className={styles.genCount}>{selectedTaskIds.size}</span>}
                                        </>
                                    )}
                                </button>
                                <button
                                    className={`${styles.generateBtn} ${styles.generateBtnAlt}`}
                                    onClick={() => handleGenerateSelected('announcement')}
                                    disabled={!someSelected || generatingIds.size > 0 || !allGroupsHaveDraft}
                                    title={t('remediation.generateTrainingTitle')}
                                >
                                    <GraduationCapIcon size={15} />{t('remediation.generateTrainingBtn')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* ════ MAIN ════ */}
            <main className={styles.main}>
                {pageTab === 'workspace' ? (
                    /* ── WORKSPACE ── */
                    !selectedAp ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}><ScaleIcon size={32} /></div>
                            <h2 className={styles.emptyTitle}>{t('remediation.emptyTitle')}</h2>
                            <p className={styles.emptyDesc}>{t('remediation.emptyDesc')}</p>
                        </div>
                    ) : (
                        <div className={styles.workspaceLayout}>
                            {/* ── LEFT: Task checklist ── */}
                            <aside className={styles.taskPanel}>
                                <div className={styles.taskPanelHeader}>
                                    <span className={styles.taskPanelTitle}>{t('remediation.taskListTitle')}</span>
                                    <span className={styles.taskPanelMeta}>{selectedAp.law_id}</span>
                                </div>

                                <div className={styles.taskPanelList}>
                                    <label className={styles.taskSelectAll}>
                                        <input
                                            type="checkbox"
                                            className={styles.taskCheckboxInput}
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                        />
                                        <span className={styles.taskCheckboxCustom} />
                                        <span className={styles.taskSelectAllLabel}>
                                            {allSelected ? t('remediation.deselectAll') : t('remediation.selectAll')}
                                            <span className={styles.taskTotalBadge}>{allTasks.length}</span>
                                        </span>
                                    </label>

                                    <div className={styles.taskDivider} />

                                    {allTasks.map((task: any) => {
                                        const checked = selectedTaskIds.has(task.id);
                                        const hasDoc = docMap.has(task.id);
                                        const isGen = generatingIds.has(task.id);
                                        const isResolved = resolvedTaskNames.has(task.task_name);
                                        return (
                                            <label
                                                key={task.id}
                                                className={`${styles.taskItem} ${checked ? styles.taskItemChecked : ''} ${isGen ? styles.taskItemGenerating : ''} ${isResolved ? styles.taskItemResolved : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className={styles.taskCheckboxInput}
                                                    checked={checked}
                                                    onChange={() => toggleTask(task.id)}
                                                />
                                                <span className={`${styles.taskCheckboxCustom} ${checked ? styles.taskCheckboxChecked : ''}`} />
                                                <div className={styles.taskItemBody}>
                                                    <div className={styles.taskItemTop}>
                                                        <span className={styles.taskDeptBadge}>{task.target_department}</span>
                                                        {hasDoc && !isGen && <span className={styles.taskDocDot} title={t('remediation.taskHasDoc')}>✓</span>}
                                                        {isGen && <span className={styles.taskGenSpinner} />}
                                                    </div>
                                                    <p className={styles.taskItemName}>{task.task_name}</p>
                                                    {task.impacted_internal_doc && (
                                                        <p className={styles.taskItemDoc}>→ {task.impacted_internal_doc}</p>
                                                    )}
                                                    {isResolved && (
                                                        <p className={styles.taskItemResolvedNote}><CheckIcon size={11} />{t('remediation.taskResolved')}</p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>

                                <div className={styles.taskPanelFooter}>
                                    {someSelected
                                        ? <span className={styles.selectedCount}><CheckCircleIcon size={13} />{t('remediation.tasksSelected', { count: selectedTaskIds.size })}</span>
                                        : <span className={styles.selectedCountEmpty}>{t('remediation.noTasksSelected')}</span>
                                    }
                                </div>
                            </aside>

                            {/* ── RIGHT: Document stack ── */}
                            <div className={styles.docStack}>
                                {renderEntries.length === 0 ? (
                                    <div className={styles.docStackEmpty}>
                                        <div className={styles.docStackEmptyIcon}><FileTextIcon size={24} /></div>
                                        <p>{t('remediation.docEmptyHint1')}</p>
                                        <p>{t('remediation.docEmptyHint2')}</p>
                                    </div>
                                ) : (
                                    renderEntries.map((group) => (
                                        <DocSection
                                            key={group.docName}
                                            group={group}
                                            onSave={handleSaveDoc}
                                            onSaveDraft={handleSaveDraft}
                                            onApprove={handleApproveDoc}
                                            onRefine={handleRefineDoc}
                                            onExport={exportDoc}
                                            onToggleRefinement={toggleRefinement}
                                            onSetRefinementPrompt={setRefinementPrompt}
                                            onSelectDraft={handleSelectDraft}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    )
                ) : (
                    /* ── SIGNED DOCUMENTS ── */
                    <SignedDocumentsPage docs={signedDocs} isLoading={isLoading} />
                )}
            </main>
        </div>
    );
}

// ── Signed Documents Page ─────────────────────────────────────────────────────
interface SignedDoc { plan: any; task: any; doc: any; parsed: any }

function SignedDocumentsPage({ docs, isLoading }: { docs: SignedDoc[]; isLoading: boolean }) {
    const { t } = useTranslation();

    const exportDoc = (doc: SignedDoc) => {
        const html = doc.parsed?.modified_document;
        if (!html) return;
        const docName = doc.task.impacted_internal_doc || `doc_${doc.doc.id}`;
        const blob = new Blob([html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${docName}_đã_ký_${Date.now()}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className={styles.emptyState}>
                <div className={styles.signedLoadingDots}><span /><span /><span /></div>
            </div>
        );
    }

    if (docs.length === 0) {
        return (
            <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><FileBadgeIcon size={32} /></div>
                <h2 className={styles.emptyTitle}>{t('remediation.signedEmptyTitle')}</h2>
                <p className={styles.emptyDesc}>{t('remediation.signedEmptyDesc')}</p>
            </div>
        );
    }

    return (
        <div className={styles.signedPage}>
            <div className={styles.signedHeader}>
                <h2 className={styles.signedTitle}>{t('remediation.signedTitle')}</h2>
                <span className={styles.signedCount}>{docs.length} {t('remediation.signedCountLabel')}</span>
            </div>

            <div className={styles.signedTableWrap}>
                <table className={styles.signedTable}>
                    <thead>
                        <tr>
                            <th>{t('remediation.signedColPlan')}</th>
                            <th>{t('remediation.signedColDoc')}</th>
                            <th>{t('remediation.signedColDept')}</th>
                            <th>{t('remediation.signedColStatus')}</th>
                            <th>{t('remediation.signedColApproval')}</th>
                            <th>{t('remediation.signedColActions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docs.map((item, idx) => (
                            <tr key={`${item.doc.id}-${idx}`}>
                                <td>
                                    <span className={styles.signedPlanCode}>{item.plan.plan_code}</span>
                                    <span className={styles.signedLawId}>{item.plan.law_id}</span>
                                </td>
                                <td>
                                    <span className={styles.signedDocName}>{item.task.impacted_internal_doc || '—'}</span>
                                    <span className={styles.signedTaskCode}>{item.task.task_code}</span>
                                </td>
                                <td>
                                    <span className={styles.signedDept}>{item.task.target_department || '—'}</span>
                                </td>
                                <td>
                                    <span className={`${styles.signedStatus} ${item.doc.status === 'APPROVED' ? styles.signedStatusApproved : styles.signedStatusPartial}`}>
                                        {item.doc.status === 'APPROVED' ? t('remediation.statusApproved') : t('remediation.statusPartial')}
                                    </span>
                                </td>
                                <td>
                                    <div className={styles.signedApprovalDots}>
                                        <span className={`${styles.signedDot} ${item.doc.product_approved ? styles.signedDotOk : ''}`} title="Product" />
                                        <span className={`${styles.signedDot} ${item.doc.cd_approved ? styles.signedDotOk : ''}`} title="Compliance" />
                                    </div>
                                </td>
                                <td>
                                    <button
                                        className={styles.signedExportBtn}
                                        onClick={() => exportDoc(item)}
                                        disabled={!item.parsed?.modified_document}
                                        title={t('remediation.exportDocTitle')}
                                    >
                                        {t('remediation.exportDocLabel')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── DocSection ────────────────────────────────────────────────────────────────
interface DocSectionProps {
    group: GroupedDocEntry;
    onSave: (taskIds: number[], content: any) => void;
    onSaveDraft: (taskIds: number[], content: any) => Promise<any[]>;
    onApprove: (taskIds: number[], role: string) => void;
    onRefine: (taskIds: number[], prompt: string) => void;
    onExport: (taskIds: number[]) => void;
    onToggleRefinement: (taskIds: number[]) => void;
    onSetRefinementPrompt: (taskIds: number[], prompt: string) => void;
    onSelectDraft: (docName: string, draftId: number) => void;
}

function DocSection({
    group,
    onSave, onSaveDraft, onApprove, onRefine, onExport,
    onToggleRefinement, onSetRefinementPrompt, onSelectDraft,
}: DocSectionProps) {
    const { t } = useTranslation();
    const [approveRole, setApproveRole] = useState('product');
    const [localComments, setLocalComments] = useState<any[]>([]);
    const [drafts, setDrafts] = useState<any[]>([]);
    const [showDrafts, setShowDrafts] = useState(false);
    const [viewMode, setViewMode] = useState<'document' | 'announcement'>('document');
    const [commentTops, setCommentTops] = useState<Record<string, number>>({});
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const docBodyRef = useRef<HTMLDivElement>(null);

    const doc = group.doc;
    const parsed = group.parsed;
    const targetDepts = Array.from(new Set(group.tasks.map(t => t.target_department)));
    const taskCodes = group.tasks.map(t => t.task_code).join(', ');

    useEffect(() => { setLocalComments(parsed?.comments ?? []); }, [parsed?.comments]);

    useEffect(() => {
        if (!parsed?.modified_document && parsed?.announcement) setViewMode('announcement');
        else if (parsed?.modified_document && !parsed?.announcement) setViewMode('document');
    }, [parsed]);

    useEffect(() => {
        if (doc) api.remediation.getDrafts(doc.id).then(setDrafts).catch(console.error);
    }, [doc?.id]);

    const recalcPositions = useCallback(() => {
        if (!scrollContainerRef.current || !docBodyRef.current) return;
        const containerRect = scrollContainerRef.current.getBoundingClientRect();
        const scrollTop = scrollContainerRef.current.scrollTop;
        const tops: Record<string, number> = {};
        localComments.forEach((c: any) => {
            const mark = docBodyRef.current!.querySelector(`mark[data-id="${c.id}"]`) as HTMLElement | null;
            if (mark) tops[c.id] = mark.getBoundingClientRect().top - containerRect.top + scrollTop;
        });
        setCommentTops(tops);
    }, [localComments]);

    const sidebarMinHeight = localComments.reduce((max, c: any) => {
        return Math.max(max, (commentTops[c.id] ?? 0) + 120);
    }, 0);

    useLayoutEffect(() => {
        const id = requestAnimationFrame(recalcPositions);
        return () => cancelAnimationFrame(id);
    }, [recalcPositions, parsed?.old_document, parsed?.modified_document]);

    useEffect(() => {
        if (!docBodyRef.current) return;
        const ro = new ResizeObserver(recalcPositions);
        ro.observe(docBodyRef.current);
        return () => ro.disconnect();
    }, [recalcPositions]);

    const handleMarkHover = (commentId: string | null) => {
        if (!docBodyRef.current) return;
        docBodyRef.current.querySelectorAll('mark').forEach(m => m.classList.remove(styles.active));
        if (commentId) docBodyRef.current.querySelectorAll(`mark[data-id="${commentId}"]`).forEach(m => m.classList.add(styles.active));
    };

    const handleCommentChange = (id: string, newReason: string) => {
        setLocalComments(prev => prev.map(c => c.id === id ? { ...c, reason: newReason } : c));
    };

    const toggleCommentResolved = (id: string) => {
        const nextComments = localComments.map(c => c.id === id ? { ...c, resolved: !c.resolved } : c);
        setLocalComments(nextComments);
        if (parsed) onSave(group.taskIds, { ...parsed, comments: nextComments });
    };

    const handleCommentBlur = () => {
        if (parsed) onSave(group.taskIds, { ...parsed, comments: localComments });
    };

    const doSaveDraft = async () => {
        if (parsed) {
            const newDrafts = await onSaveDraft(group.taskIds, { ...parsed, comments: localComments });
            if (newDrafts?.length > 0) { setDrafts(newDrafts); setShowDrafts(true); }
        }
    };

    const doRestoreDraft = (draftContent: string) => {
        if (!confirm(t('remediation.confirmRestore'))) return;
        try { onSave(group.taskIds, JSON.parse(draftContent)); } catch (e) { console.error(e); }
    };

    const docHtml = parsed?.modified_document
        || (parsed?.old_document ? parsed.old_document.replace(/\n/g, '<br/>') : '');

    return (
        <div className={styles.docSection}>
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
                    {doc && (
                        <div className={styles.approvalDots} title="Product · Compliance">
                            <span className={`${styles.adot} ${doc.product_approved ? styles.adotOk : ''}`} />
                            <span className={`${styles.adot} ${doc.cd_approved ? styles.adotOk : ''}`} />
                        </div>
                    )}
                    {doc && (
                        <>
                            <button
                                className={`${styles.secBtn} ${group.refinementOpen ? styles.secBtnActive : ''}`}
                                onClick={() => onToggleRefinement(group.taskIds)}
                                title={t('remediation.refineAi')}
                            ><SparklesIcon size={14} /></button>
                            <button
                                className={`${styles.secBtn} ${showDrafts ? styles.secBtnActive : ''}`}
                                onClick={() => setShowDrafts(!showDrafts)}
                                title={t('remediation.draftHistory')}
                            ><ClockIcon size={14} /> {drafts.length}</button>
                            <button className={styles.secBtn} onClick={doSaveDraft} title={t('remediation.saveDraft')}><SaveIcon size={14} /></button>
                            <button className={styles.secBtn} onClick={() => onExport(group.taskIds)} title={t('remediation.exportDocTitle')}>
                                <DownloadIcon size={14} />{t('remediation.exportDocLabel')}
                            </button>
                            <div className={styles.approveInline}>
                                <select className={styles.approveMiniSelect} value={approveRole} onChange={e => setApproveRole(e.target.value)}>
                                    <option value="product">Product</option>
                                    <option value="cd">Compliance</option>
                                </select>
                                <button
                                    className={styles.approveMiniBtn}
                                    onClick={() => onApprove(group.taskIds, approveRole)}
                                    disabled={doc?.status === 'APPROVED'}
                                ><PenLineIcon size={13} />{t('remediation.signBtn')}</button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showDrafts && drafts.length > 0 && (
                <div className={styles.draftHistoryBar}>
                    <div className={styles.draftsTitle}>{t('remediation.draftHistoryTitle')}</div>
                    <div className={styles.draftsList}>
                        {drafts.map((d: any, idx: number) => (
                            <div key={d.id} className={`${styles.draftItem} ${group.selectedDraftId === d.id ? styles.draftItemSelected : ''}`}>
                                <span className={styles.draftTime}>{new Date(d.created_at).toLocaleString('vi-VN')}</span>
                                {idx === 0 && <span className={styles.draftBadge}>{t('remediation.draftNewest')}</span>}
                                <button className={styles.draftRestoreBtn} onClick={() => doRestoreDraft(d.content)} title={t('remediation.draftRestoreTitle')}>
                                    {t('remediation.draftRestore')}
                                </button>
                                <button
                                    className={`${styles.draftSelectBtn} ${group.selectedDraftId === d.id ? styles.draftSelectBtnActive : ''}`}
                                    onClick={() => onSelectDraft(group.docName, d.id)}
                                    title={t('remediation.draftSelectTitle')}
                                >
                                    {group.selectedDraftId === d.id ? t('remediation.draftSelected') : t('remediation.draftSelectBtn')}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {group.refinementOpen && (
                <div className={styles.refinementBar}>
                    <span className={styles.refinementIcon}><SparklesIcon size={16} /></span>
                    <input
                        className={styles.refinementInput}
                        placeholder={t('remediation.refinePlaceholder')}
                        value={group.refinementPrompt || ''}
                        onChange={e => onSetRefinementPrompt(group.taskIds, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) onRefine(group.taskIds, group.refinementPrompt || ''); }}
                        autoFocus
                    />
                    <button className={styles.refineBarBtn} onClick={() => onRefine(group.taskIds, group.refinementPrompt || '')} disabled={!group.refinementPrompt?.trim()}>
                        <SendIcon size={14} />
                    </button>
                </div>
            )}

            {parsed && (parsed.modified_document || parsed.old_document) && parsed.announcement && (
                <div className={styles.viewModeTabs}>
                    <button className={`${styles.tabBtn} ${viewMode === 'document' ? styles.tabBtnActive : ''}`} onClick={() => setViewMode('document')}>
                        <EditIcon size={13} />{t('remediation.tabDocument')}
                    </button>
                    <button className={`${styles.tabBtn} ${viewMode === 'announcement' ? styles.tabBtnActive : ''}`} onClick={() => setViewMode('announcement')}>
                        <GraduationCapIcon size={13} />{t('remediation.tabAnnouncement')}
                    </button>
                </div>
            )}

            <div className={styles.docSectionContent}>
                {group.isGenerating ? (
                    <div className={styles.generatingState}>
                        <div className={styles.generatingDots}><span /><span /><span /></div>
                        <p className={styles.generatingText}>
                            {t('remediation.generatingContent', { count: group.tasks.length, docName: group.docName })}
                        </p>
                    </div>
                ) : viewMode === 'document' && (parsed?.modified_document || parsed?.old_document) ? (
                    <div ref={scrollContainerRef} className={styles.annotationLayout} onScroll={recalcPositions}>
                        <div
                            ref={docBodyRef}
                            className={styles.annotationEditor}
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => {
                                if (parsed) onSave(group.taskIds, { ...parsed, modified_document: e.currentTarget.innerHTML, comments: localComments });
                            }}
                            dangerouslySetInnerHTML={{ __html: docHtml }}
                        />
                        <div className={styles.annotationSidebar} style={{ minHeight: sidebarMinHeight }}>
                            {localComments.map((comment: any) => (
                                <div
                                    key={comment.id}
                                    className={`${styles.commentCard} ${comment.resolved ? styles.commentCardResolved : ''}`}
                                    style={commentTops[comment.id] !== undefined ? { top: commentTops[comment.id] } : { position: 'relative' }}
                                    onMouseEnter={() => handleMarkHover(comment.id)}
                                    onMouseLeave={() => handleMarkHover(null)}
                                >
                                    <div className={styles.commentCardHeader}>
                                        <label className={styles.commentTickWrap} onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" checked={comment.resolved || false} onChange={() => toggleCommentResolved(comment.id)} />
                                            <span className={styles.commentTickMark} />
                                        </label>
                                    </div>
                                    <textarea
                                        className={styles.commentReasonInput}
                                        value={comment.reason}
                                        onChange={e => handleCommentChange(comment.id, e.target.value)}
                                        onBlur={handleCommentBlur}
                                        rows={3}
                                    />
                                </div>
                            ))}
                            {localComments.length === 0 && (
                                <div className={styles.commentCard} style={{ opacity: 0.6 }}>
                                    <p className={styles.commentReason}>{t('remediation.noComments')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'announcement' && parsed?.announcement ? (
                    <div className={styles.singleDocView}>
                        <div className={styles.docPaperWide}>
                            <div className={styles.paperHeader}>
                                <div className={styles.paperHeaderLeft}>
                                    <span className={styles.paperLabel}><GraduationCapIcon size={14} />{t('remediation.trainingDocLabel')}</span>
                                    <span className={styles.paperMeta}>{group.docName}</span>
                                </div>
                                <span className={styles.tagAI}>{t('remediation.aiGenerated')}</span>
                            </div>
                            <div className={styles.paperBody} dangerouslySetInnerHTML={{ __html: parsed.announcement.replace(/\n/g, '<br/>') }} />
                        </div>
                    </div>
                ) : doc ? (
                    <div className={styles.docSectionEmpty}><p>{t('remediation.noContentRefine')}</p></div>
                ) : (
                    <div className={styles.docSectionEmpty}><p>{t('remediation.noContentGenerate')}</p></div>
                )}
            </div>
        </div>
    );
}
