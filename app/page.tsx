"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import modelData from "./model-data.json";
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
  kind: "group" | "main" | "unit";
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
    rows: payload.rows,
    units: payload.units,
    scores: payload.scores,
    stages: payload.stages,
    groups: payload.groups,
    thresholds: payload.thresholds ?? defaultData.thresholds,
  };
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function scoreText(value: number | null) {
  return value === null ? "—" : String(Math.round(value));
}

function OrgNode({
  label,
  selected,
  root = false,
  leaf = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  root?: boolean;
  leaf?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`org-node ${root ? "root" : ""} ${leaf ? "leaf" : ""} ${selected ? "selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="org-node-copy"><strong>{label}</strong></span>
    </button>
  );
}

export default function Home() {
  const [data, setData] = useState<DataPayload>(defaultData);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState(defaultData.groups[0]);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const loadedVersionId = useRef<string | null>(null);

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

  const activeNode = selected?.group === activeGroup ? selected : groupRoot;
  const activeUnitCodeSet = useMemo(() => new Set(activeNode.unitCodes), [activeNode.unitCodes]);

  useEffect(() => {
    const refreshData = () => fetch(`/api/data?refresh=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        const nextData = result?.data ? normalizeData(result.data) : null;
        if (!nextData || loadedVersionId.current === result.id) return;
        loadedVersionId.current = result.id;
        setData(nextData);
        setActiveVersionId(result.id);
        setActiveGroup(nextData.groups[0]);
        setSelected(null);
        setOpenStage(null);
      })
      .catch(() => undefined);
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

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenStage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const stageMetrics = useMemo(() => Object.fromEntries(data.stages.map((stage) => {
    const values = data.scores
      .filter((score) => activeUnitCodeSet.has(score.unitCode) && score.stage === stage)
      .map((score) => score.value);
    return [stage, average(values)];
  })) as Record<string, number | null>, [activeUnitCodeSet, data.scores, data.stages]);

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
      const branches = orderedBranches.slice(offset, offset + size);
      offset += size;
      return { id: `military-column-${index + 1}`, tone: ["green", "olive", "olive", "gray"][index], branches };
    });
  }, [mainBranches]);

  const militarySections = useMemo(() => [
    { label: "القيادة والعمليات", columns: militaryColumns.slice(0, 2) },
    { label: "الإسناد والخدمات", columns: militaryColumns.slice(2, 4) },
  ], [militaryColumns]);

  const modalRows = useMemo(() => {
    if (!openStage) return [];
    return data.rows
      .filter((row) => activeUnitCodeSet.has(row.unitCode) && row.stage === openStage)
      .sort((a, b) => a.element.localeCompare(b.element, "ar") || a.checkpointCode.localeCompare(b.checkpointCode) || a.unitCode.localeCompare(b.unitCode));
  }, [activeUnitCodeSet, data.rows, openStage]);

  const modalElements = useMemo(() => sortedUnique(modalRows.map((row) => row.element)), [modalRows]);
  const unitByCode = useMemo(() => new Map(data.units.map((unit) => [unit.code, unit])), [data.units]);

  function selectGroup(group: string) {
    setActiveGroup(group);
    setSelected(null);
    setOpenStage(null);
  }

  function selectMain(mainUnit: string, units: OrgUnit[]) {
    setSelected({
      id: `main:${activeGroup}:${mainUnit}`,
      label: mainUnit,
      kind: "main",
      group: activeGroup,
      unitCodes: units.map((unit) => unit.code),
    });
  }

  function selectUnit(unit: OrgUnit) {
    setSelected({
      id: `unit:${unit.code}`,
      label: unit.measuredUnit,
      kind: "unit",
      group: activeGroup,
      unitCodes: [unit.code],
    });
  }

  return (
    <main className="maturity-dashboard">
      <header className="topbar maturity-topbar">
        <div className="brand-logo"><img src="/mngdp-logo.png" alt="برنامج تطوير وزارة الحرس الوطني" /></div>
        <div className="title-block"><p>لوحة الأداء المؤسسي</p><h1>قياس نضج النموذج التشغيلي</h1></div>
        <nav className="site-nav" aria-label="التنقل الرئيسي">
          <a className="active" href="/">لوحة التحليل</a>
          <a href="/guide">الدليل الإرشادي</a>
          <a href="/upload">رفع البيانات</a>
        </nav>
        <a className="download-link" href={activeVersionId ? `/api/versions/${activeVersionId}/file` : "/قياس_نضج_النموذج_التشغيلي_بالهيكل.xlsx"} download>تنزيل البيانات</a>
      </header>

      <section className="selection-summary" aria-live="polite">
        <div><p>النطاق المحدد</p><h2>{activeNode.label}</h2><span>{activeNode.kind === "group" ? `${activeNode.unitCodes.length} وحدة تنظيمية` : activeNode.kind === "main" ? `${activeNode.unitCodes.length} وحدات ضمن الفرع` : unitByCode.get(activeNode.unitCodes[0])?.level || "وحدة تنظيمية"}</span></div>
        <div className="selection-line" aria-hidden="true" />
        <p className="selection-help">اختر أي عقدة من الهيكل لتحديث النتائج، ثم اضغط على إحدى المراحل لعرض نقاط التحقق.</p>
      </section>

      <section className="maturity-stages" aria-label={`درجات النضج لـ ${activeNode.label}`}>
        {data.stages.map((stage, index) => {
          const value = stageMetrics[stage] ?? null;
          const maturity = maturityLabel(value, data.thresholds);
          return (
            <button className={`maturity-stage ${stageClasses[index]}`} type="button" key={stage} onClick={() => setOpenStage(stage)}>
              <div className="maturity-stage-heading"><span>{String(index + 1).padStart(2, "0")}</span><div><small>مرحلة القياس</small><h2>{stage}</h2></div></div>
              <div className="maturity-stage-score" style={{ "--stage-progress": `${value ?? 0}%` } as React.CSSProperties}>
                <strong>{scoreText(value)}</strong><span>%</span>
              </div>
              <div className="maturity-stage-foot">
                <div className="maturity-dots" aria-label={`مستوى النضج: ${maturity}`}>
                  {maturityStates.map((state) => <i className={maturity === state ? "active" : ""} key={state}>{state}</i>)}
                </div>
                <span>عرض نقاط التحقق ←</span>
              </div>
            </button>
          );
        })}
      </section>

      <section className={`organization-panel ${activeGroup === "الجهاز العسكري" ? "military-organization" : ""}`}>
        <div className="organization-head">
          <div><p>الهيكل التنظيمي</p><h2>اختر المجموعة ثم الوحدة المطلوب تحليلها</h2></div>
          <div className="organization-tabs" role="tablist" aria-label="المجموعات التنظيمية">
            {data.groups.map((group) => (
              <button role="tab" aria-selected={activeGroup === group} className={activeGroup === group ? "active" : ""} type="button" key={group} onClick={() => selectGroup(group)}>{group}</button>
            ))}
          </div>
          <div className="organization-legend"><i /> العقدة المحددة</div>
        </div>

        <div className="org-chart-scroll">
          <div className="org-chart">
            <div className="org-root-wrap">
              <OrgNode label={activeGroup} selected={activeNode.id === groupRoot.id} root onClick={() => setSelected(null)} />
            </div>
            <div className="org-trunk" aria-hidden="true" />
            {activeGroup === "الجهاز العسكري" ? (
              <div className="military-command-map">
                {militarySections.map((section) => {
                  const sectionUnits = section.columns.flatMap((column) => column.branches.flatMap((branch) => branch.units));
                  const sectionId = `main:${activeGroup}:${section.label}`;
                  return (
                    <section className="military-command-section" key={section.label}>
                      <div className="military-command">
                        <OrgNode
                          label={section.label}
                          selected={activeNode.id === sectionId}
                          onClick={() => selectMain(section.label, sectionUnits)}
                        />
                      </div>
                      <div className="military-section-columns">
                        {section.columns.map((column) => (
                          <div className={`military-column tone-${column.tone}`} key={column.id}>
                            {column.branches.map((branch) => {
                              const mainId = `main:${activeGroup}:${branch.mainUnit}`;
                              return (
                                <div className="military-unit" key={branch.mainUnit}>
                                  <OrgNode
                                    label={branch.mainUnit}
                                    selected={activeNode.id === mainId}
                                    onClick={() => selectMain(branch.mainUnit, branch.units)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
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
                        onClick={() => selectMain(branch.mainUnit, branch.units)}
                      />
                      {branch.children.length > 0 && (
                        <div className="org-children">
                          {branch.children.map((unit) => (
                            <OrgNode
                              key={unit.code}
                              label={unit.measuredUnit}
                              selected={activeNode.id === `unit:${unit.code}`}
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
        </div>
      </section>

      {openStage && (
        <div className="checkpoint-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenStage(null); }}>
          <section className={`checkpoint-modal ${stageClasses[Math.max(0, data.stages.indexOf(openStage))]}`} role="dialog" aria-modal="true" aria-labelledby="checkpoint-title">
            <header className="checkpoint-head">
              <div><p>{activeNode.label}</p><h2 id="checkpoint-title">نقاط تحقق مرحلة {openStage}</h2><span>{modalRows.length} قياسًا ضمن {modalElements.length} عناصر</span></div>
              <button type="button" aria-label="إغلاق" onClick={() => setOpenStage(null)}>×</button>
            </header>
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
                            <div className="checkpoint-value"><b>{row.verification.toFixed(0)}%</b><span>{row.status || maturityLabel(row.verification, data.thresholds)}</span></div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!modalRows.length && <div className="checkpoint-empty">لا توجد نقاط تحقق ضمن هذا النطاق.</div>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
