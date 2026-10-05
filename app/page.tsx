"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import modelData from "./model-data.json";
import styles from "./dashboard-interactions.module.css";
import AppHeader from "./components/app-header";
import Icon from "./components/icon";
import Dialog from "./components/dialog";
import { ministryStageAverages } from "./maturity-metrics";
import {
  LOCAL_SYNC_FINGERPRINT_KEY,
  fileFingerprint,
  parseWorkbook,
  readLinkedWorkbook,
  uploadWorkbookVersion,
  type OrgUnit,
  type ParsedData,
  type WorkbookRow,
} from "./workbook-data";

type DataPayload = ParsedData;
type SelectedNode = {
  id: string;
  label: string;
  kind: "ministry" | "group" | "main" | "unit";
  group: string;
  unitCodes: string[];
};

const defaultData = modelData as DataPayload;
const stageClasses = ["design", "build", "operation"];
const maturityStates = ["أولي", "جزئي", "متقدم"] as const;

function normalizeData(payload: Partial<DataPayload>): DataPayload | null {
  if (!Array.isArray(payload.rows) || !payload.rows.length) return null;
  if (!Array.isArray(payload.units) || !payload.units.length) return null;
  if (!Array.isArray(payload.scores) || !payload.scores.length) return null;
  if (!Array.isArray(payload.stages) || payload.stages.length !== 3) return null;
  if (!Array.isArray(payload.groups) || payload.groups.length !== 3) return null;
  return {
    rows: payload.rows.map((row) => ({
      ...row,
      target2026: Number.isFinite(Number(row.target2026)) ? Number(row.target2026) : row.verification,
    })),
    units: payload.units,
    scores: payload.scores.map((score) => ({
      ...score,
      target2026: Number.isFinite(Number(score.target2026)) ? Number(score.target2026) : score.value,
    })),
    stages: payload.stages,
    groups: payload.groups,
    thresholds: payload.thresholds ?? defaultData.thresholds,
  };
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundedPercentage(value: number) {
  return Math.round(value);
}

function maturityLabel(value: number | null, thresholds: DataPayload["thresholds"]) {
  if (value === null) return "لا توجد بيانات";
  if (value <= thresholds.initialMax) return "أولي";
  if (value > thresholds.advancedMinExclusive) return "متقدم";
  return "جزئي";
}

function isDash(value: string) {
  return !value || value === "—" || value === "-";
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ar"));
}

function searchText(value: string) {
  return value.normalize("NFKC").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064B-\u065F\u0670\u0640]/g, "").toLowerCase();
}

function OrgNode({
  label,
  selected,
  root = false,
  leaf = false,
  dimmed = false,
  maturity,
  onClick,
}: {
  label: string;
  selected: boolean;
  root?: boolean;
  leaf?: boolean;
  dimmed?: boolean;
  maturity?: ReturnType<typeof maturityLabel>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`org-node ${root ? "root" : ""} ${leaf ? "leaf" : ""} ${selected ? "selected" : ""} ${selected ? styles.selectedNode : ""} ${dimmed ? styles.dimmedNode : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="org-node-copy">
        <strong>{label}</strong>
        {!root && maturity ? (
          <span className={styles.nodeMaturitySignals} aria-label={`مستوى النضج الكلي: ${maturity}`}>
            <span className={`${styles.nodeMaturitySignal} ${maturity === "أولي" ? styles.nodeMaturityInitial : maturity === "جزئي" ? styles.nodeMaturityPartial : styles.nodeMaturityAdvanced} ${styles.nodeMaturityActive}`}><i />{maturity}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

function AnimatedStageScore({
  value,
  stage,
  updateSequence,
}: {
  value: number | null;
  stage: string;
  updateSequence: number;
}) {
  const initialValue = value ?? 0;
  const [displayValue, setDisplayValue] = useState(initialValue);
  const displayValueRef = useRef(initialValue);

  useEffect(() => {
    if (value === null) return;
    const from = displayValueRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    const duration = reducedMotion ? 0 : 500;
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const nextValue = from + (value - from) * eased;
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);
      if (elapsed < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        displayValueRef.current = value;
        setDisplayValue(value);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, updateSequence]);

  const progress = value === null ? 0 : Math.max(0, Math.min(100, displayValue));
  const isAnimating = value !== null && Math.abs(displayValue - value) > 0.05;

  return (
    <div
      className={`maturity-stage-score ${styles.animatedScore} ${isAnimating ? styles.scoreAnimating : ""}`}
      style={{ "--stage-progress": `${progress}%` } as React.CSSProperties}
      aria-label={`نسبة ${stage}: ${value === null ? "لا توجد بيانات" : `${roundedPercentage(value)} بالمئة`}`}
    >
      <strong>{value === null ? "—" : roundedPercentage(displayValue)}</strong><span>%</span>
      <output className={styles.screenReaderUpdate} aria-live="polite">
        {isAnimating ? `تتغير نسبة مرحلة ${stage}` : `نسبة مرحلة ${stage} ${value === null ? "لا توجد بيانات" : `${roundedPercentage(value)} بالمئة`}`}
      </output>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<DataPayload>(defaultData);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState(defaultData.groups[0]);
  const [isMinistry, setIsMinistry] = useState(false);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [selectionMotion, setSelectionMotion] = useState(0);
  const [unitQuery, setUnitQuery] = useState("");
  const [viewMode, setViewMode] = useState<"chart" | "list">("chart");
  const [checkpointQuery, setCheckpointQuery] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const loadedVersionId = useRef<string | null>(null);
  const selectionScrollFrame = useRef<number | null>(null);
  const selectionDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stagesRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    if (selectionScrollFrame.current !== null) cancelAnimationFrame(selectionScrollFrame.current);
    if (selectionDelayTimer.current !== null) clearTimeout(selectionDelayTimer.current);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (window.matchMedia("(max-width: 700px)").matches) setViewMode("list"); });
    return () => cancelAnimationFrame(frame);
  }, []);

  const groupUnits = useMemo(
    () => data.units.filter((unit) => unit.group === activeGroup),
    [activeGroup, data.units],
  );

  const groupRoot = useMemo<SelectedNode>(() => ({
    id: `group:${activeGroup}`,
    label: activeGroup,
    kind: "group",
    group: activeGroup,
    unitCodes: groupUnits.map((unit) => unit.code),
  }), [activeGroup, groupUnits]);

  const ministryRoot = useMemo<SelectedNode>(() => ({
    id: "ministry",
    label: "مستوى الوزارة",
    kind: "ministry",
    group: "",
    unitCodes: data.units.map((unit) => unit.code),
  }), [data.units]);

  const activeNode = isMinistry ? ministryRoot : selected?.group === activeGroup ? selected : groupRoot;
  const hasFocusedNode = activeNode.kind === "main" || activeNode.kind === "unit";
  const canShowCheckpoints = hasFocusedNode;
  const activeUnitCodeSet = useMemo(() => new Set(activeNode.unitCodes), [activeNode.unitCodes]);

  function nodeMaturity(unitCodes: string[]) {
    const unitCodeSet = new Set(unitCodes);
    const weightedRows = data.rows
      .filter((row) => unitCodeSet.has(row.unitCode))
      .flatMap((row) => {
        const weight = Number((row as WorkbookRow & { weight?: unknown }).weight);
        return Number.isFinite(weight) && weight > 0 ? [{ value: row.verification, weight }] : [];
      });

    const weightedScore = weightedRows.length
      ? weightedRows.reduce((total, row) => total + row.value * row.weight, 0) / weightedRows.reduce((total, row) => total + row.weight, 0)
      : average(data.scores.filter((score) => unitCodeSet.has(score.unitCode)).map((score) => score.value));
    return maturityLabel(weightedScore, data.thresholds);
  }

  useEffect(() => {
    const refreshData = () => fetch(`/api/data?refresh=${Date.now()}`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Data unavailable"); return response.json(); })
      .then((result) => {
        setDataUnavailable(false);
        const nextData = result?.data ? normalizeData(result.data) : null;
        if (!nextData || loadedVersionId.current === result.id) return;
        loadedVersionId.current = result.id;
        setData(nextData);
        setActiveVersionId(result.id);
        setActiveGroup((current) => nextData.groups.includes(current) ? current : nextData.groups[0]);
        setSelected((current) => {
          if (!current || !nextData.groups.includes(current.group)) return null;
          const units = nextData.units.filter((unit) => unit.group === current.group && (current.kind === "main" ? unit.mainUnit === current.label : unit.code === current.unitCodes[0]));
          return units.length ? { ...current, label: current.kind === "unit" ? units[0].measuredUnit : current.label, unitCodes: units.map((unit) => unit.code) } : null;
        });
        setOpenStage((current) => current && nextData.stages.includes(current) ? current : null);
        setSelectionMotion((current) => current + 1);
      })
      .catch(() => setDataUnavailable(true));
    refreshData();
    const watch = window.setInterval(refreshData, 2500);
    return () => window.clearInterval(watch);
  }, []);

  useEffect(() => {
    let stopped = false;
    let syncing = false;
    let handle: Awaited<ReturnType<typeof readLinkedWorkbook>> = null;
    const syncLinkedFile = async () => {
      if (!handle || syncing || stopped) return;
      try {
        const permission = await handle.queryPermission?.({ mode: "read" });
        if (permission !== "granted") return;
        const file = await handle.getFile();
        const fingerprint = fileFingerprint(file);
        if (localStorage.getItem(LOCAL_SYNC_FINGERPRINT_KEY) === fingerprint) return;
        syncing = true;
        const parsed = await parseWorkbook(file);
        await uploadWorkbookVersion(file, parsed);
        localStorage.setItem(LOCAL_SYNC_FINGERPRINT_KEY, fingerprint);
        loadedVersionId.current = null;
      } catch {
        // Keep the embedded workbook available if Excel temporarily locks the linked file.
      } finally {
        syncing = false;
      }
    };
    readLinkedWorkbook().then((linkedHandle) => {
      handle = linkedHandle;
      return syncLinkedFile();
    }).catch(() => undefined);
    const watch = window.setInterval(syncLinkedFile, 2500);
    return () => { stopped = true; window.clearInterval(watch); };
  }, []);

  const ministryMetrics = useMemo(() => ministryStageAverages(data), [data]);

  const stageMetrics = useMemo(() => Object.fromEntries(data.stages.map((stage) => {
    if (isMinistry) return [stage, ministryMetrics[stage].value];
    const values = data.scores
      .filter((score) => activeUnitCodeSet.has(score.unitCode) && score.stage === stage)
      .map((score) => score.value);
    return [stage, average(values)];
  })) as Record<string, number | null>, [activeUnitCodeSet, data.scores, data.stages, isMinistry, ministryMetrics]);

  const stageTargets = useMemo(() => Object.fromEntries(data.stages.map((stage) => {
    if (isMinistry) return [stage, ministryMetrics[stage].target];
    const values = data.scores
      .filter((score) => activeUnitCodeSet.has(score.unitCode) && score.stage === stage)
      .map((score) => score.target2026)
      .filter((value) => Number.isFinite(value));
    return [stage, average(values)];
  })) as Record<string, number | null>, [activeUnitCodeSet, data.scores, data.stages, isMinistry, ministryMetrics]);

  const mainBranches = useMemo(() => sortedUnique(groupUnits.map((unit) => unit.mainUnit)).map((mainUnit) => {
    const units = groupUnits.filter((unit) => unit.mainUnit === mainUnit);
    const children = units.filter((unit) => unit.measuredUnit !== mainUnit && !isDash(unit.subUnit));
    const direct = units.find((unit) => unit.measuredUnit === mainUnit || isDash(unit.subUnit));
    return { mainUnit, units, children, direct };
  }), [groupUnits]);

  const militaryColumns = useMemo(() => {
    const orderedBranches = [...mainBranches].sort((a, b) =>
      (a.units[0]?.code || "").localeCompare(b.units[0]?.code || ""),
    );
    const sizes = [6, 5, 6, 4];
    let offset = 0;
    return sizes.map((size, index) => {
      const branches = orderedBranches.slice(offset, index === sizes.length - 1 ? undefined : offset + size);
      offset += size;
      return { id: `military-column-${index + 1}`, featured: index === 0, branches };
    });
  }, [mainBranches]);

  const allModalRows = useMemo(() => {
    if (!openStage) return [];
    return data.rows
      .filter((row) => activeUnitCodeSet.has(row.unitCode) && row.stage === openStage)
      .sort((a, b) => a.element.localeCompare(b.element, "ar") || a.checkpointCode.localeCompare(b.checkpointCode) || a.unitCode.localeCompare(b.unitCode));
  }, [activeUnitCodeSet, data.rows, openStage]);

  const modalRows = useMemo(() => allModalRows.filter((row) =>
    (!onlyGaps || row.verification < row.target2026) &&
    searchText(`${row.checkpointCode} ${row.checkpointText} ${row.element} ${row.mainUnit} ${row.subUnit}`).includes(searchText(checkpointQuery.trim()))
  ), [allModalRows, checkpointQuery, onlyGaps]);

  const filteredUnits = useMemo(() => groupUnits.filter((unit) => searchText(`${unit.measuredUnit} ${unit.mainUnit} ${unit.code}`).includes(searchText(unitQuery.trim()))), [groupUnits, unitQuery]);

  const modalElements = useMemo(() => sortedUnique(modalRows.map((row) => row.element)), [modalRows]);
  const unitByCode = useMemo(() => new Map(data.units.map((unit) => [unit.code, unit])), [data.units]);

  function selectGroup(group: string) {
    cancelSelectionScroll();
    setIsMinistry(false);
    setActiveGroup(group);
    setSelected(null);
    setOpenStage(null);
    setUnitQuery("");
    setSelectionMotion((current) => current + 1);
  }

  function selectMinistry() {
    cancelSelectionScroll();
    setIsMinistry(true);
    setSelected(null);
    setOpenStage(null);
    setUnitQuery("");
    setSelectionMotion((current) => current + 1);
  }

  function selectRoot() {
    selectNode(null);
  }

  function selectMain(mainUnit: string, units: OrgUnit[]) {
    selectNode({
      id: `main:${activeGroup}:${mainUnit}`,
      label: mainUnit,
      kind: "main",
      group: activeGroup,
      unitCodes: units.map((unit) => unit.code),
    });
  }

  function selectUnit(unit: OrgUnit) {
    selectNode({
      id: `unit:${unit.code}`,
      label: unit.measuredUnit,
      kind: "unit",
      group: activeGroup,
      unitCodes: [unit.code],
    });
  }

  function cancelSelectionScroll() {
    if (selectionScrollFrame.current !== null) cancelAnimationFrame(selectionScrollFrame.current);
    if (selectionDelayTimer.current !== null) clearTimeout(selectionDelayTimer.current);
    selectionScrollFrame.current = null;
    selectionDelayTimer.current = null;
  }

  function selectNode(node: SelectedNode | null) {
    cancelSelectionScroll();
    const applySelection = () => {
      selectionDelayTimer.current = null;
      setSelected(node);
      setOpenStage(null);
      setSelectionMotion((current) => current + 1);
    };
    const revealResults = () => {
      selectionScrollFrame.current = null;
      // Briefly hold the previous numbers after the cards come into view.
      selectionDelayTimer.current = setTimeout(applySelection, 250);
    };
    const startY = window.scrollY;
    const stages = stagesRef.current?.getBoundingClientRect();
    const desiredY = stages ? startY + stages.top - Math.max(16, (window.innerHeight - stages.height) / 2) : startY;
    const targetY = Math.max(0, Math.min(desiredY, document.documentElement.scrollHeight - window.innerHeight));
    if (Math.abs(startY - targetY) <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo({ top: targetY, behavior: "instant" });
      revealResults();
      return;
    }
    let startedAt: number | null = null;
    const scroll = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / 180);
      window.scrollTo({ top: targetY + (startY - targetY) * Math.pow(1 - progress, 3), behavior: "instant" });
      if (progress < 1) selectionScrollFrame.current = requestAnimationFrame(scroll);
      else revealResults();
    };
    selectionScrollFrame.current = requestAnimationFrame(scroll);
  }

  function showStage(stage: string) {
    setCheckpointQuery("");
    setOnlyGaps(false);
    setOpenStage(stage);
  }

  return (
    <main className="maturity-dashboard">
      <AppHeader active="dashboard" action={<a className="button button-outline" href={activeVersionId ? `/api/versions/${activeVersionId}/file` : "/قياس_نضج_النموذج_التشغيلي_بالهيكل.xlsx"} download><Icon name="download" />تنزيل البيانات</a>} />
      <div className="app-container dashboard-content" id="main-content">
      <section className="page-heading">
        <div><p className="eyebrow">لوحة الأداء المؤسسي</p><h1>قياس نضج النموذج التشغيلي</h1><p className="page-description">صورة أوضح للأداء، من مستوى الوزارة إلى تفاصيل كل وحدة.</p></div>
        <a className="help-link" href="/guide"><Icon name="book" />كيف تقرأ النتائج؟<Icon name="arrow" /></a>
      </section>
      {dataUnavailable && <div className="notice warning" role="status"><Icon name="info" /><p>تعذر جلب آخر تحديث. تُعرض آخر بيانات متاحة، وستُعاد المحاولة تلقائيًا.</p></div>}
      <section className="scope-navigation" aria-label="نطاق القياس">
        <button aria-label="عرض القياس على مستوى الوزارة" aria-pressed={isMinistry} className={`ministry-overview ${isMinistry ? "active" : ""}`} type="button" onClick={selectMinistry}>
          <span className="ministry-overview-icon"><Icon name="chart" /></span>
          <span className="ministry-overview-copy"><strong>مستوى الوزارة</strong><small>المتوسط العام للمجموعات الثلاث</small></span>
          <span className="ministry-overview-action">{isMinistry ? "المعروض حاليًا" : "عرض ملخص الوزارة"}<Icon name={isMinistry ? "check" : "arrow"} /></span>
        </button>
        <div className="scope-groups">
          <p id="groups-label">المجموعات التابعة للوزارة</p>
          <div className="group-selector" role="group" aria-labelledby="groups-label">
            {data.groups.map((group) => <button aria-pressed={!isMinistry && activeGroup === group} className={!isMinistry && activeGroup === group ? "active" : ""} type="button" key={group} onClick={() => selectGroup(group)}>{group}<span>{data.units.filter((unit) => unit.group === group).length}</span></button>)}
          </div>
        </div>
      </section>
      <section className="selection-summary" id="scope-summary" aria-live="polite">
        <div className="scope-icon"><Icon name="grid" /></div>
        <div className="scope-copy"><p>النطاق المحدد {hasFocusedNode && <span> / {activeGroup}</span>}</p><h2>{activeNode.label}</h2></div>
        <span className="scope-count">{isMinistry ? `${data.groups.length} مجموعات تنظيمية` : `${activeNode.unitCodes.length} وحدة تنظيمية`}</span>
        {isMinistry ? <p className="ministry-method">متوسط المجموعات الثلاث بالتساوي لكل مرحلة</p> : hasFocusedNode ? <button className="button button-quiet" type="button" onClick={selectRoot}><Icon name="refresh" />عرض المجموعة كاملة</button> : <a className="scope-hint button button-quiet" href="#units">اختر وحدة لاستكشاف التفاصيل<Icon name="arrow" /></a>}
      </section>

      <section className="maturity-stages" ref={stagesRef} aria-label={`درجات النضج لـ ${activeNode.label}`}>
        {data.stages.map((stage, index) => {
          const value = stageMetrics[stage] ?? null;
          const target = stageTargets[stage] ?? null;
          const gap = value === null || target === null ? null : target - value;
          const maturity = maturityLabel(value, data.thresholds);
          return (
            <article
              className={`maturity-stage ${stageClasses[index]} ${styles.stageCard}`}
              key={stage}
            >
              <div className="maturity-stage-heading">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>مرحلة القياس</small>
                  <h2>{stage}</h2>
                  <div className="maturity-stage-target" aria-label={`مستهدف عام 2026 لمرحلة ${stage}: ${target === null ? "لا توجد بيانات" : `${roundedPercentage(target)} بالمئة`}`}>
                    <span>مستهدف 2026</span>
                    <strong>{target === null ? "—" : `${roundedPercentage(target)}%`}</strong>
                    {gap !== null && <em>{roundedPercentage(gap) > 0 ? `فجوة ${roundedPercentage(gap)} نقطة` : roundedPercentage(gap) < 0 ? `متجاوز بـ ${roundedPercentage(Math.abs(gap))} نقطة` : "تم تحقيق المستهدف"}</em>}
                  </div>
                </div>
              </div>
              <AnimatedStageScore value={value} stage={stage} updateSequence={selectionMotion} />
              <div className="maturity-stage-foot">
                <div className="maturity-dots" data-maturity={maturity} aria-label={`مستوى النضج: ${maturity}`}>
                  {maturityStates.map((state) => <i className={maturity === state ? "active" : ""} key={state}>{state}</i>)}
                </div>
                {!isMinistry && <button className="stage-details" type="button" disabled={!canShowCheckpoints} onClick={() => showStage(stage)} aria-label={`عرض نقاط تحقق مرحلة ${stage}`}>{canShowCheckpoints ? "نقاط التحقق" : "اختر وحدة لعرض التفاصيل"}<Icon name={canShowCheckpoints ? "arrow" : "info"} /></button>}
              </div>
            </article>
          );
        })}
      </section>

      {!isMinistry && <section id="units" className={`organization-panel ${activeGroup === "الجهاز العسكري" ? "military-organization" : ""} ${hasFocusedNode ? styles.nodeSelectionActive : ""}`}>
        <div className="organization-head">
          <div><h2>استكشف الوحدات التنظيمية</h2><p>اختر وحدة لتحديث مؤشرات النضج في الأعلى.</p></div>
          <div className="organization-tools">
            <label className="search-field"><Icon name="search" /><input type="search" aria-label="البحث عن وحدة تنظيمية" placeholder="ابحث باسم الوحدة أو رمزها…" value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} />{unitQuery && <button type="button" aria-label="مسح البحث" onClick={() => setUnitQuery("")}><Icon name="close" /></button>}</label>
            <div className="view-toggle" role="group" aria-label="طريقة عرض الوحدات"><button type="button" aria-pressed={viewMode === "chart"} onClick={() => { setViewMode("chart"); setUnitQuery(""); }}><Icon name="grid" />هيكل</button><button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}><Icon name="list" />قائمة</button></div>
          </div>
        </div>
        <div className="organization-meta">
          <span>{unitQuery ? `${filteredUnits.length} نتائج البحث` : `${groupUnits.length} وحدة ضمن ${activeGroup}`}</span>
          <aside className="organization-legend" aria-label="دليل مستويات النضج">
            <div className="organization-legend-items">
              <span className="organization-legend-item initial"><i /><span><strong>أولي</strong><small>حتى {data.thresholds.initialMax}%</small></span></span>
              <span className="organization-legend-item partial"><i /><span><strong>جزئي</strong><small>أكثر من {data.thresholds.initialMax}% إلى {data.thresholds.advancedMinExclusive}%</small></span></span>
              <span className="organization-legend-item advanced"><i /><span><strong>متقدم</strong><small>أكثر من {data.thresholds.advancedMinExclusive}%</small></span></span>
            </div>
          </aside>
        </div>

        {(unitQuery.trim() || viewMode === "list") ? <div className="unit-list">
          {filteredUnits.map((unit) => {
            const maturity = nodeMaturity([unit.code]);
            const isSelected = activeNode.kind === "unit" && activeNode.unitCodes[0] === unit.code;
            return <button key={unit.code} className={`unit-list-card ${isSelected ? "selected" : ""}`} type="button" aria-pressed={isSelected} onClick={() => selectUnit(unit)}><span className="unit-list-icon"><Icon name="grid" /></span><span className="unit-list-copy"><small>{unit.code} · {unit.level || "وحدة تنظيمية"}</small><strong>{unit.measuredUnit}</strong><span>{unit.mainUnit !== unit.measuredUnit ? unit.mainUnit : activeGroup}</span></span><span className={`maturity-badge ${maturity === "أولي" ? "initial" : maturity === "جزئي" ? "partial" : "advanced"}`}>{maturity}</span><Icon name={isSelected ? "check" : "arrow"} /></button>;
          })}
          {!filteredUnits.length && <div className="empty-state"><Icon name="search" /><h3>لا توجد وحدات مطابقة</h3><p>جرّب اسمًا آخر أو رمز الوحدة ضمن المجموعة المختارة.</p><button type="button" className="button button-outline" onClick={() => setUnitQuery("")}>مسح البحث</button></div>}
        </div> : <>
        <div className="chart-hint"><Icon name="info" /><span>اضغط على أي وحدة لتحليلها. يمكنك تمرير الهيكل أفقيًا أو استخدام عرض القائمة.</span></div>
        <div className="org-chart-scroll" tabIndex={0} role="region" aria-label={`الهيكل التنظيمي لـ ${activeGroup}`}>
          <div className="org-chart">
            <div className="org-root-wrap">
              <OrgNode label={activeGroup} selected={activeNode.id === groupRoot.id} dimmed={hasFocusedNode} root onClick={selectRoot} />
            </div>
            <div className="org-trunk" aria-hidden="true" />
            {activeGroup === "الجهاز العسكري" ? (
              <div className="military-direct-map">
                {militaryColumns.map((column) => (
                  <div className={`military-column ${column.featured ? "featured" : ""}`} key={column.id}>
                    {column.branches.map((branch) => {
                      const mainId = `main:${activeGroup}:${branch.mainUnit}`;
                      return (
                        <div className="military-unit" key={branch.mainUnit}>
                          <OrgNode
                            label={branch.mainUnit}
                            selected={activeNode.id === mainId}
                            dimmed={hasFocusedNode && activeNode.id !== mainId}
                            maturity={nodeMaturity(branch.units.map((unit) => unit.code))}
                            onClick={() => selectMain(branch.mainUnit, branch.units)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="org-branches">
                {mainBranches.map((branch) => {
                  const mainId = `main:${activeGroup}:${branch.mainUnit}`;
                  return (
                    <div className="org-branch" key={branch.mainUnit}>
                      <div className="org-branch-line" aria-hidden="true" />
                      <OrgNode
                        label={branch.mainUnit}
                        selected={activeNode.id === mainId}
                        dimmed={hasFocusedNode && activeNode.id !== mainId}
                        maturity={nodeMaturity(branch.units.map((unit) => unit.code))}
                        onClick={() => selectMain(branch.mainUnit, branch.units)}
                      />
                      {branch.children.length > 0 && (
                        <div className="org-children">
                          {branch.children.map((unit) => (
                            <OrgNode
                              key={unit.code}
                              label={unit.measuredUnit}
                              selected={activeNode.id === `unit:${unit.code}`}
                              dimmed={hasFocusedNode && activeNode.id !== `unit:${unit.code}`}
                              maturity={nodeMaturity([unit.code])}
                              leaf
                              onClick={() => selectUnit(unit)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div></>}
      </section>}
      <footer className="app-footer"><span>قياس نضج النموذج التشغيلي</span><span>تُعرض النسب مقربة لأقرب عدد صحيح · مستهدفات 2026</span></footer>
      </div>

      {openStage && (
        <Dialog className={`checkpoint-modal ${stageClasses[Math.max(0, data.stages.indexOf(openStage))]}`} labelId="checkpoint-title" onClose={() => setOpenStage(null)}>
            <header className="checkpoint-head">
              <div><p>{activeNode.label}</p><h2 id="checkpoint-title">نقاط تحقق مرحلة {openStage}</h2><span>{allModalRows.length} قياسًا ضمن النطاق المحدد</span></div>
              <button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setOpenStage(null)}><Icon name="close" /></button>
            </header>
            <div className="checkpoint-tools"><label className="search-field"><Icon name="search" /><input type="search" aria-label="البحث في نقاط التحقق" placeholder="ابحث في نقاط التحقق…" value={checkpointQuery} onChange={(event) => setCheckpointQuery(event.target.value)} /></label><button className={`button ${onlyGaps ? "button-primary" : "button-outline"}`} type="button" aria-pressed={onlyGaps} onClick={() => setOnlyGaps(!onlyGaps)}>النقاط دون المستهدف</button><span aria-live="polite">{modalRows.length} نتيجة</span></div>
            <div className="checkpoint-content">
              {modalElements.map((element) => {
                const elementRows = modalRows.filter((row) => row.element === element);
                return (
                  <section className="checkpoint-group" key={element}>
                    <div className="checkpoint-group-title"><h3>{element}</h3><span>{elementRows.length} نقطة</span></div>
                    <div className="checkpoint-list">
                      {elementRows.map((row: WorkbookRow) => {
                        const unit = unitByCode.get(row.unitCode);
                        return (
                          <article className="checkpoint-row" key={row.id}>
                            <div className="checkpoint-code"><b>{row.checkpointCode}</b><span>{unit?.measuredUnit || row.subUnit}</span></div>
                            <div className="checkpoint-copy"><strong>{row.checkpointText}</strong>{row.notes && <p>{row.notes}</p>}{row.provider && <small>الجهة المزودة: {row.provider}</small>}</div>
                            <div className="checkpoint-value">
                              <div><small>الحالي</small><b>{row.verification.toFixed(0)}%</b></div>
                              <div className="checkpoint-target"><small>مستهدف 2026</small><b>{roundedPercentage(row.target2026)}%</b></div>
                              <span>{row.status || maturityLabel(row.verification, data.thresholds)}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!modalRows.length && <div className="empty-state"><Icon name="search" /><h3>لا توجد نقاط تحقق مطابقة</h3><p>جرّب تغيير البحث أو عرض جميع النقاط.</p><button type="button" className="button button-outline" onClick={() => { setOnlyGaps(false); setCheckpointQuery(""); }}>عرض جميع النقاط</button></div>}
            </div>
        </Dialog>
      )}
    </main>
  );
}
