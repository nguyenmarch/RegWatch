import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './remediation_doc.module.css';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../lib/permissions';
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
    taskIds: string[];
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
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => {
        const saved = sessionStorage.getItem('remediation_selectedTaskIds');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [docMap, setDocMap] = useState<Map<string, DocEntry>>(new Map());
    const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDraftsByDoc, setSelectedDraftsByDoc] = useState<Map<string, number>>(new Map());
    const [signFilter, setSignFilter] = useState<'all' | 'unsigned' | 'partial' | 'signed'>('all');

    useEffect(() => { fetchActionPlans(); }, []);

    const fetchActionPlans = async () => {
        setIsLoading(true);
        try {
            const data = await api.remediation.getActionPlans();
            setActionPlans(Array.isArray(data) ? data : []);
        } catch { setActionPlans([]); }
        setIsLoading(false);
    };

    const refreshSilent = useCallback(async () => {
        try {
            const data = await api.remediation.getActionPlans();
            setActionPlans(Array.isArray(data) ? data : []);
        } catch {}
    }, []);

    // Auto-refresh every 5s — keeps signed tab and approval dots in sync
    useEffect(() => {
        const id = setInterval(refreshSilent, 5000);
        return () => clearInterval(id);
    }, [refreshSilent]);

    const handleGenerateTraining = useCallback(async (item: { plan: any; task: any; doc: any }) => {
        const planId = item.plan.plan_code || String(item.plan.id);
        const refs = [{ plan_id: planId, task_id: item.task.task_id }];
        await api.remediation.generateGroupByRefs(refs, '', 'announcement');
        await refreshSilent();
    }, [refreshSilent]);

    useEffect(() => {
        sessionStorage.setItem('remediation_selectedTaskIds', JSON.stringify(Array.from(selectedTaskIds)));
    }, [selectedTaskIds]);

    // Gộp toàn bộ task của MỌI action plan, gắn plan_id + uid (= plan_id::task_id)
    // để định danh duy nhất xuyên nhiều plan. Sắp xếp theo khối (target_department).
    const allTasks: any[] = [];
    actionPlans.forEach((plan: any) => {
        const planId = plan.plan_code || String(plan.id);
        (plan.tasks ?? []).forEach((task: any) => {
            const uid = `${planId}::${task.task_id}`;
            allTasks.push({ ...task, plan_id: planId, uid, id: uid });
        });
    });
    allTasks.sort((a, b) =>
        (a.target_department || '').localeCompare(b.target_department || '', 'vi'));

    const khoiOf = (task: any) => (task.target_department || '').trim() || 'Chưa phân loại';

    const signStatusOf = (task: any): 'unsigned' | 'partial' | 'signed' => {
        const doc = docMap.get(task.uid)?.doc;
        if (!doc) return 'unsigned';
        if (doc.status === 'APPROVED') return 'signed';
        if (doc.product_approved || doc.cd_approved) return 'partial';
        return 'unsigned';
    };

    // Dựng docMap từ document đã có sẵn trên mỗi task (key = uid).
    // Merge strategy: API data wins when present; approved local entries are
    // kept when the API returns null (prevents reset from transient mismatches).
    useEffect(() => {
        setDocMap(prev => {
            const next = new Map(prev);
            actionPlans.forEach((plan: any) => {
                const planId = plan.plan_code || String(plan.id);
                (plan.tasks ?? []).forEach((task: any) => {
                    const uid = `${planId}::${task.task_id}`;
                    if (task.document) {
                        let parsed = null;
                        try { parsed = JSON.parse(task.document.content); } catch { }
                        next.set(uid, { task: { ...task, plan_id: planId, uid, id: uid }, doc: task.document, parsed });
                    } else {
                        // API returned no doc for this task — only evict if not approved locally
                        const existing = prev.get(uid);
                        if (!existing?.doc?.product_approved && !existing?.doc?.cd_approved) {
                            next.delete(uid);
                        }
                    }
                });
            });
            return next;
        });
    }, [actionPlans]);

    // ── Task selection ───────────────────────────────────────────────────────
    const toggleTask = (taskId: string) => {
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
            return next;
        });
    };

    const allSelected = allTasks.length > 0 && selectedTaskIds.size === allTasks.length;
    const someSelected = selectedTaskIds.size > 0;

    // Gom task theo KHỐI (target_department). Mỗi khối → 1 văn bản nội bộ.
    const tasksByKhoi = new Map<string, any[]>();
    allTasks.forEach((task: any) => {
        const k = khoiOf(task);
        if (!tasksByKhoi.has(k)) tasksByKhoi.set(k, []);
        tasksByKhoi.get(k)!.push(task);
    });
    const khoiList = Array.from(tasksByKhoi.keys());

    // Nhóm các task ĐANG CHỌN theo khối (phục vụ generate + announcement draft).
    const selectedGroups = new Map<string, any[]>();
    selectedTaskIds.forEach(tid => {
        const task = allTasks.find((t: any) => t.uid === tid);
        if (!task) return;
        const k = khoiOf(task);
        if (!selectedGroups.has(k)) selectedGroups.set(k, []);
        selectedGroups.get(k)!.push(task);
    });

    const allGroupsHaveDraft = selectedGroups.size === 0 ||
        Array.from(selectedGroups.keys()).every(k => selectedDraftsByDoc.has(k));

    const toggleSelectAll = () => {
        if (allSelected) setSelectedTaskIds(new Set());
        else setSelectedTaskIds(new Set(allTasks.map((t: any) => t.uid)));
    };

    // Chọn / bỏ chọn toàn bộ alert của 1 khối.
    const toggleKhoi = (khoi: string) => {
        const uids = (tasksByKhoi.get(khoi) ?? []).map((t: any) => t.uid);
        const allOn = uids.length > 0 && uids.every(u => selectedTaskIds.has(u));
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            if (allOn) uids.forEach(u => next.delete(u));
            else uids.forEach(u => next.add(u));
            return next;
        });
    };

    const handleSelectDraft = (docName: string, draftId: number) => {
        setSelectedDraftsByDoc(prev => new Map(prev).set(docName, draftId));
    };

    // ── Batch generate (gom theo khối) ─────────────────────────────────────────
    const handleGenerateSelected = async (type: 'document' | 'announcement') => {
        if (!selectedTaskIds.size) return;

        // group key (khối) → danh sách task object đang chọn của khối đó.
        const groups = new Map<string, any[]>();
        selectedTaskIds.forEach(tid => {
            const task = allTasks.find((t: any) => t.uid === tid);
            if (!task) return;
            const k = khoiOf(task);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(task);
        });

        if (type === 'announcement') {
            for (const k of groups.keys()) {
                if (!selectedDraftsByDoc.has(k)) {
                    alert(t('remediation.selectDraftFirst', { docName: k }));
                    return;
                }
            }
        }

        setGeneratingIds(new Set(selectedTaskIds));

        const results = await Promise.allSettled(
            Array.from(groups.entries()).map(async ([k, tasksInGroup]) => {
                const refs = tasksInGroup.map((tk: any) => ({ plan_id: tk.plan_id, task_id: tk.task_id }));
                const refinementPrompt = type === 'announcement' ? `Dùng bản nháp ID ${selectedDraftsByDoc.get(k)}` : undefined;
                return api.remediation.generateGroupByRefs(refs, refinementPrompt, type);
            })
        );

        setDocMap(prev => {
            const next = new Map(prev);
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    result.value.forEach(doc => {
                        const uid = `${doc.plan_id}::${doc.task_id}`;
                        const task = allTasks.find((t: any) => t.uid === uid);
                        let parsed = null;
                        try { parsed = JSON.parse(doc.content); } catch { }
                        next.set(uid, { task, doc, parsed });
                    });
                }
            });
            return next;
        });

        setGeneratingIds(new Set());
    };

    // ── Per-document actions ──────────────────────────────────────────────────
    const handleSaveDoc = async (taskIds: string[], content: any) => {
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

    const handleSaveDraft = async (taskIds: string[], content: any) => {
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

    const handleApproveDoc = async (taskIds: string[], role: string) => {
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

    const handleUnapproveDoc = async (taskIds: string[], role: string) => {
        try {
            const results = await Promise.all(
                taskIds.map(async (tid) => {
                    const entry = docMap.get(tid);
                    if (entry?.doc) {
                        const updated = await api.remediation.unapproveDocument(entry.doc.id, role);
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

    const handleRefineDoc = async (taskIds: string[], refinementPrompt: string) => {
        if (!refinementPrompt.trim()) return;
        setGeneratingIds(prev => { const next = new Set(prev); taskIds.forEach(tid => next.add(tid)); return next; });
        try {
            const refs = taskIds
                .map(uid => allTasks.find((t: any) => t.uid === uid))
                .filter(Boolean)
                .map((tk: any) => ({ plan_id: tk.plan_id, task_id: tk.task_id }));
            const docs = await api.remediation.generateGroupByRefs(refs, refinementPrompt, 'document');
            setDocMap(prev => {
                const next = new Map(prev);
                docs.forEach(doc => {
                    const uid = `${doc.plan_id}::${doc.task_id}`;
                    const task = allTasks.find((t: any) => t.uid === uid);
                    let parsed = null;
                    try { parsed = JSON.parse(doc.content); } catch { }
                    next.set(uid, { task, doc, parsed, refinementPrompt: '', refinementOpen: false });
                });
                return next;
            });
        } catch (e) { console.error(e); }
        setGeneratingIds(prev => { const next = new Set(prev); taskIds.forEach(tid => next.delete(tid)); return next; });
    };

    const toggleRefinement = (taskIds: string[]) => {
        setDocMap(prev => {
            const next = new Map(prev);
            taskIds.forEach(tid => {
                const e = next.get(tid);
                if (e) next.set(tid, { ...e, refinementOpen: !e.refinementOpen });
            });
            return next;
        });
    };

    const setRefinementPrompt = (taskIds: string[], prompt: string) => {
        setDocMap(prev => {
            const next = new Map(prev);
            taskIds.forEach(tid => {
                const e = next.get(tid);
                if (e) next.set(tid, { ...e, refinementPrompt: prompt });
            });
            return next;
        });
    };

    const exportDoc = (taskIds: string[]) => {
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

    // ── Group rendering entries (gom theo KHỐI) ──────────────────────────────
    const renderEntries: GroupedDocEntry[] = [];
    {
        selectedGroups.forEach((tasksInGroup, docName) => {
            const taskIds = tasksInGroup.map(t => t.uid);
            const isGenerating = taskIds.some(tid => generatingIds.has(tid));
            let matchedDoc = null, matchedParsed = null, matchedRefinementOpen = false, matchedRefinementPrompt = '';
            for (const t of tasksInGroup) {
                const entry = docMap.get(t.uid);
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

    // ── Signed documents — derived from docMap so it reflects sign actions immediately ──
    const signedDocs: { plan: any; task: any; doc: any; parsed: any }[] = [];
    allTasks.forEach((task: any) => {
        const entry = docMap.get(task.uid);
        if (!entry?.doc) return;
        const { doc, parsed } = entry;
        if (doc.status === 'APPROVED' || doc.product_approved || doc.cd_approved) {
            const plan = actionPlans.find((p: any) => (p.plan_code || String(p.id)) === task.plan_id);
            if (plan) signedDocs.push({ plan, task, doc, parsed });
        }
    });

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div className={styles.wrapper}>

            {/* ════ TOP BAR ════ */}
            <header className={styles.topBar}>
                <div className={styles.topBarInner}>

                    <div className={styles.brand}>
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
                    allTasks.length === 0 ? (
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
                                    <span className={styles.taskPanelMeta}>{khoiList.length} khối</span>
                                </div>

                                <div className={styles.taskPanelList}>
                                    {/* Sign filter chips */}
                                    <div className={styles.signFilterRow}>
                                        {(['all', 'unsigned', 'partial', 'signed'] as const).map(f => (
                                            <button
                                                key={f}
                                                className={`${styles.signFilterChip} ${signFilter === f ? styles.signFilterChipActive : ''}`}
                                                onClick={() => setSignFilter(f)}
                                            >
                                                {t(`remediation.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
                                            </button>
                                        ))}
                                    </div>

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

                                    {khoiList.map((khoi) => {
                                        const allKhoiTasks = tasksByKhoi.get(khoi) ?? [];
                                        const tasks = signFilter === 'all'
                                            ? allKhoiTasks
                                            : allKhoiTasks.filter(tk => signStatusOf(tk) === signFilter);
                                        if (tasks.length === 0) return null;
                                        const uids = tasks.map((tk: any) => tk.uid);
                                        const khoiAllOn = uids.length > 0 && uids.every(u => selectedTaskIds.has(u));
                                        return (
                                            <div key={khoi} className={styles.taskKhoiGroup}>
                                                {/* Header khối: chọn cả khối */}
                                                <label className={styles.taskKhoiHeader}>
                                                    <input
                                                        type="checkbox"
                                                        className={styles.taskCheckboxInput}
                                                        checked={khoiAllOn}
                                                        onChange={() => toggleKhoi(khoi)}
                                                    />
                                                    <span className={`${styles.taskCheckboxCustom} ${khoiAllOn ? styles.taskCheckboxChecked : ''}`} />
                                                    <span className={styles.taskKhoiName}>{khoi}</span>
                                                    <span className={styles.taskTotalBadge}>{tasks.length}</span>
                                                </label>

                                                {tasks.map((task: any) => {
                                                    const checked = selectedTaskIds.has(task.uid);
                                                    const isGen = generatingIds.has(task.uid);
                                                    const entry = docMap.get(task.uid);
                                                    const comments = entry?.parsed?.comments ?? [];
                                                    const total = comments.length;
                                                    const done = comments.filter((c: any) => c.resolved).length;
                                                    const hasDoc = !!entry?.doc;
                                                    const allResolved = total > 0 && done === total;
                                                    return (
                                                        <label
                                                            key={task.uid}
                                                            className={`${styles.taskItem} ${checked ? styles.taskItemChecked : ''} ${isGen ? styles.taskItemGenerating : ''} ${allResolved ? styles.taskItemResolved : ''}`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className={styles.taskCheckboxInput}
                                                                checked={checked}
                                                                onChange={() => toggleTask(task.uid)}
                                                            />
                                                            <span className={`${styles.taskCheckboxCustom} ${checked ? styles.taskCheckboxChecked : ''}`} />
                                                            <div className={styles.taskItemBody}>
                                                                <div className={styles.taskItemTop}>
                                                                    {task.code && <span className={styles.taskDeptBadge}>{task.code}</span>}
                                                                    {isGen && <span className={styles.taskGenSpinner} />}
                                                                    {entry?.doc && (
                                                                        <span className={styles.taskSignDots} title="Product · Compliance">
                                                                            <span className={`${styles.taskSignDot} ${entry.doc.product_approved ? (entry.doc.status === 'APPROVED' ? styles.taskSignDotLocked : styles.taskSignDotOk) : ''}`} />
                                                                            <span className={`${styles.taskSignDot} ${entry.doc.cd_approved ? (entry.doc.status === 'APPROVED' ? styles.taskSignDotLocked : styles.taskSignDotOk) : ''}`} />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className={styles.taskItemName}>{task.task_name}</p>
                                                                {hasDoc && total > 0 && (
                                                                    <p className={styles.taskItemResolvedNote}>
                                                                        <CheckIcon size={11} />
                                                                        {allResolved
                                                                            ? t('remediation.taskResolved')
                                                                            : `Đã xử lý ${done}/${total} thay đổi`}
                                                                    </p>
                                                                )}
                                                                {hasDoc && total === 0 && (
                                                                    <p className={styles.taskItemDoc}>✓ Đã sinh văn bản (không có thay đổi)</p>
                                                                )}
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
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
                                            onUnapprove={handleUnapproveDoc}
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
                    <SignedDocumentsPage
                        docs={signedDocs}
                        isLoading={isLoading}
                        onGenerateTraining={handleGenerateTraining}
                    />
                )}
            </main>
        </div>
    );
}

// ── Signed Documents Page ─────────────────────────────────────────────────────
interface SignedDoc { plan: any; task: any; doc: any; parsed: any }

function SignedDocumentsPage({
    docs,
    isLoading,
    onGenerateTraining,
}: {
    docs: SignedDoc[];
    isLoading: boolean;
    onGenerateTraining: (item: SignedDoc) => Promise<void>;
}) {
    const { t } = useTranslation();
    const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());

    const exportDoc = (item: SignedDoc) => {
        const html = item.parsed?.modified_document;
        if (!html) return;
        const docName = item.task.impacted_internal_doc || `doc_${item.doc.id}`;
        const blob = new Blob([html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${docName}_đã_ký_${Date.now()}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleGenTraining = async (item: SignedDoc) => {
        setGeneratingIds(prev => new Set(prev).add(item.doc.id));
        try { await onGenerateTraining(item); } finally {
            setGeneratingIds(prev => { const s = new Set(prev); s.delete(item.doc.id); return s; });
        }
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
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {item.doc.status === 'APPROVED' && (
                                            <button
                                                className={styles.signedTrainingBtn}
                                                onClick={() => handleGenTraining(item)}
                                                disabled={generatingIds.has(item.doc.id)}
                                                title={t('remediation.generateTrainingTitle')}
                                            >
                                                {generatingIds.has(item.doc.id)
                                                    ? <><span className={styles.spinner} />{t('remediation.generating', { count: 1 })}</>
                                                    : <><GraduationCapIcon size={13} />{t('remediation.generateTrainingBtn')}</>
                                                }
                                            </button>
                                        )}
                                        <button
                                            className={styles.signedExportBtn}
                                            onClick={() => exportDoc(item)}
                                            disabled={!item.parsed?.modified_document}
                                            title={t('remediation.exportDocTitle')}
                                        >
                                            {t('remediation.exportDocLabel')}
                                        </button>
                                    </div>
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
    onSave: (taskIds: string[], content: any) => void;
    onSaveDraft: (taskIds: string[], content: any) => Promise<any[]>;
    onApprove: (taskIds: string[], role: string) => void;
    onUnapprove: (taskIds: string[], role: string) => void;
    onRefine: (taskIds: string[], prompt: string) => void;
    onExport: (taskIds: string[]) => void;
    onToggleRefinement: (taskIds: string[]) => void;
    onSetRefinementPrompt: (taskIds: string[], prompt: string) => void;
    onSelectDraft: (docName: string, draftId: number) => void;
}

function DocSection({
    group,
    onSave, onSaveDraft, onApprove, onUnapprove, onRefine, onExport,
    onToggleRefinement, onSetRefinementPrompt, onSelectDraft,
}: DocSectionProps) {
    const { t } = useTranslation();
    const { user } = useAuth();

    // Derive which sign options this user is allowed to use
    const userRole = normalizeRole(user?.role)
    const canSignProduct    = userRole === 'admin' || userRole === 'product'
    const canSignCompliance = userRole === 'admin' || userRole === 'compliance'
    const defaultSignRole   = canSignProduct ? 'product' : canSignCompliance ? 'cd' : ''

    const [approveRole, setApproveRole] = useState(defaultSignRole);
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
                            {(canSignProduct || canSignCompliance) && (
                                <div className={styles.approveInline}>
                                    {(canSignProduct && canSignCompliance) ? (
                                        <select className={styles.approveMiniSelect} value={approveRole} onChange={e => setApproveRole(e.target.value)}>
                                            <option value="product">Product</option>
                                            <option value="cd">Compliance</option>
                                        </select>
                                    ) : (
                                        <span className={styles.approveMiniLabel}>
                                            {canSignProduct ? 'Product' : 'Compliance'}
                                        </span>
                                    )}

                                    {/* Undo sign — only visible if already signed & not fully APPROVED */}
                                    {doc?.status !== 'APPROVED' && (
                                        (canSignProduct && doc?.product_approved) ||
                                        (canSignCompliance && doc?.cd_approved)
                                    ) && (
                                        <button
                                            className={styles.unapproveMiniBtn}
                                            onClick={() => onUnapprove(group.taskIds, approveRole)}
                                        >{t('remediation.unsignBtn')}</button>
                                    )}

                                    <button
                                        className={styles.approveMiniBtn}
                                        onClick={() => onApprove(group.taskIds, approveRole)}
                                        disabled={doc?.status === 'APPROVED'}
                                    ><PenLineIcon size={13} />{t('remediation.signBtn')}</button>
                                </div>
                            )}
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
