"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import modelData from "./model-data.json";
import {
  DEFAULT_COLUMN_LABELS,
  LOCAL_SYNC_FINGERPRINT_KEY,
  fileFingerprint,
  parseWorkbook,
  readLinkedWorkbook,
  uploadWorkbookVersion,
  type ColumnLabels,
  type WorkbookRow,
} from "./workbook-data";

type Stage = string;
type FilterKey = "sector" | "mainUnit" | "subUnit" | "element";
type ViewKey = "element" | "mainUnit" | "subUnit";

type DataRow = WorkbookRow;

type FilterState = Record<FilterKey, string[]>;

type DataPayload = {
  rows: DataRow[];
  stages: Stage[];
  columns: ColumnLabels;
  thresholds: { initialMax: number; advancedMinExclusive: number };
};

const defaultData: DataPayload = {
  rows: modelData.rows as DataRow[],
  stages: modelData.stages as Stage[],
  columns: DEFAULT_COLUMN_LABELS,
  thresholds: modelData.thresholds,
};
const maturityStates = ["أولي", "جزئي", "متقدم"] as const;
const emptyFilters: FilterState = { sector: [], mainUnit: [], subUnit: [], element: [] };
const filterKeys: FilterKey[] = ["sector", "mainUnit", "subUnit", "element"];
const viewKeys: ViewKey[] = ["element", "mainUnit", "subUnit"];

const stageClasses = ["design", "activation", "operation"];

function weightedPercentage(items: DataRow[]) {
  const denominator = items.reduce((sum, item) => sum + (Number.isFinite(item.weight) ? item.weight : 0), 0);
  if (!denominator) return null;
  const numerator = items.reduce((sum, item) => sum + (Number.isFinite(item.earnedWeight) ? item.earnedWeight : 0), 0);
  return (numerator / denominator) * 100;
}

function formatPercentage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
}

function normalizeData(payload: Partial<DataPayload>): DataPayload | null {
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) return null;
  const stages = Array.isArray(payload.stages) && payload.stages.length
    ? payload.stages.map(String)
    : [...new Set(payload.rows.map((row) => String(row.stage)).filter(Boolean))];
  if (!stages.length) return null;
  return {
    rows: payload.rows,
    stages,
    columns: { ...DEFAULT_COLUMN_LABELS, ...(payload.columns ?? {}) },
    thresholds: {
      initialMax: payload.thresholds?.initialMax ?? defaultData.thresholds.initialMax,
      advancedMinExclusive: payload.thresholds?.advancedMinExclusive ?? defaultData.thresholds.advancedMinExclusive,
    },
  };
}

function maturityLabel(value: number | null, thresholds: DataPayload["thresholds"]) {
  if (value === null) return "لا توجد بيانات";
  if (value <= thresholds.initialMax) return "أولي";
  if (value > thresholds.advancedMinExclusive) return "متقدم";
  return "جزئي";
}

function unique(items: DataRow[], key: FilterKey) {
  return [...new Set(items.map((item) => item[key]))].sort((a, b) => a.localeCompare(b, "ar"));
}

function matchesFilters(item: DataRow, filters: FilterState, skip?: FilterKey) {
  return (Object.keys(filters) as FilterKey[]).every(
    (key) => key === skip || filters[key].length === 0 || filters[key].includes(item[key]),
  );
}

function MultiSelect({
  filterKey,
  label,
  options,
  selected,
  open,
  onOpen,
  onToggle,
  onClear,
}: {
  filterKey: FilterKey;
  label: string;
  options: string[];
  selected: string[];
  open: boolean;
  onOpen: () => void;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = options.filter((option) => option.includes(query.trim()));

  return (
    <div className={`filter-control ${open ? "is-open" : ""}`}>
      <button className="filter-trigger" type="button" onClick={onOpen} aria-expanded={open}>
        <span>
          <small>{label}</small>
          <strong>{selected.length === 1 ? selected[0] : selected.length ? `${selected.length} محدد` : "الكل"}</strong>
        </span>
        <span className="chevron">⌄</span>
      </button>
      {open && (
        <div className="filter-menu">
          <div className="filter-menu-head">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`ابحث في ${label}`}
              aria-label={`بحث في ${label}`}
              autoFocus
            />
            {selected.length > 0 && (
              <button type="button" onClick={onClear}>مسح</button>
            )}
          </div>
          <div className="filter-options">
            {visible.map((option) => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                />
                <span>{option}</span>
              </label>
            ))}
            {visible.length === 0 && <p className="empty-options">لا توجد نتائج</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<DataPayload>(defaultData);
  const [activeDataReady, setActiveDataReady] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<Stage>(defaultData.stages[0]);
  const [activeView, setActiveView] = useState<ViewKey>("element");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<{ name: string; view: ViewKey } | null>(null);
  const [detailPage, setDetailPage] = useState(0);
  const loadedVersionId = useRef<string | null>(null);
  const rows = data.rows;
  const stages = data.stages;
  const columns = data.columns;
  const filterLabels: Record<FilterKey, string> = {
    sector: columns.sector,
    mainUnit: columns.mainUnit,
    subUnit: columns.subUnit,
    element: columns.element,
  };
  const viewLabels: Record<ViewKey, string> = {
    element: columns.element,
    mainUnit: columns.mainUnit,
    subUnit: columns.subUnit,
  };

  useEffect(() => {
    const refreshData = () => fetch(`/api/data?refresh=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        const nextData = result?.data ? normalizeData(result.data) : null;
        if (!nextData) return;
        setActiveDataReady(true);
        if (loadedVersionId.current === result.id) return;
        loadedVersionId.current = result.id;
        setData(nextData);
        setActiveVersionId(result.id);
        setActiveStage(nextData.stages[0]);
        setFilters(emptyFilters);
      })
      .catch(() => undefined);
    refreshData();
    const watch = window.setInterval(refreshData, 1000);
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
        // The dashboard remains usable if the local file is temporarily locked
        // by Excel or the browser no longer has permission to read it.
      } finally {
        syncing = false;
      }
    };

    readLinkedWorkbook().then((linkedHandle) => {
      handle = linkedHandle;
      return syncLinkedFile();
    }).catch(() => undefined);
    const watch = window.setInterval(syncLinkedFile, 1000);
    return () => { stopped = true; window.clearInterval(watch); };
  }, []);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilters(row, filters)),
    [filters, rows],
  );

  const filterOptions = useMemo(() => {
    const result = {} as Record<FilterKey, string[]>;
    (Object.keys(filters) as FilterKey[]).forEach((key) => {
      result[key] = unique(rows.filter((row) => matchesFilters(row, filters, key)), key);
    });
    return result;
  }, [filters, rows]);

  const metrics = useMemo(
    () => Object.fromEntries(stages.map((stage) => [
      stage,
      weightedPercentage(filteredRows.filter((row) => row.stage === stage)),
    ])) as Record<Stage, number | null>,
    [filteredRows, stages],
  );

  const groups = useMemo(() => {
    const stageRows = filteredRows.filter((row) => row.stage === activeStage);
    return unique(stageRows, activeView).map((name) => {
      const groupRows = stageRows.filter((row) => row[activeView] === name);
      return {
        name,
        value: weightedPercentage(groupRows) ?? 0,
        units: new Set(groupRows.map((row) => row.subUnit)).size,
        records: groupRows.length,
      };
    }).sort((a, b) => b.value - a.value);
  }, [activeStage, activeView, filteredRows]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleGroups = groups.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const activeFilterCount = Object.values(filters).reduce((sum, values) => sum + values.length, 0);
  const allFiltersSelected = (Object.keys(filters) as FilterKey[]).every((key) => filters[key].length > 0);

  const detailRows = detail
    ? filteredRows.filter((row) => row.stage === activeStage && row[detail.view] === detail.name)
    : [];
  const detailPageSize = 8;
  const detailPageCount = Math.max(1, Math.ceil(detailRows.length / detailPageSize));
  const visibleDetailRows = detailRows.slice(
    detailPage * detailPageSize,
    detailPage * detailPageSize + detailPageSize,
  );

  function toggleFilter(key: FilterKey, value: string) {
    setFilters((current) => {
      const exists = current[key].includes(value);
      const next = { ...current, [key]: exists ? current[key].filter((item) => item !== value) : [...current[key], value] };
      if (key === "sector") return { ...next, mainUnit: [], subUnit: [] };
      if (key === "mainUnit") return { ...next, subUnit: [] };
      return next;
    });
    setPage(0);
  }

  function clearFilter(key: FilterKey) {
    setFilters((current) => ({ ...current, [key]: [] }));
    setPage(0);
  }

  function resetFilters() {
    setFilters(emptyFilters);
    setOpenFilter(null);
    setPage(0);
  }

  if (!activeDataReady) {
    return (
      <main className="dashboard-shell" aria-busy="true">
        <div style={{ minHeight: "calc(100vh - 36px)", display: "grid", placeItems: "center" }}>
          <div style={{ padding: "22px 28px", border: "1px solid #dce8e2", borderRadius: 18, color: "#1d7549", background: "rgba(255,255,255,.94)", boxShadow: "0 14px 35px rgba(23,52,41,.06)", fontWeight: 900 }}>
            جارٍ تحميل الإصدار الحالي من البيانات...
          </div>
        </div>
      </main>
    );
  }

  const filterControls = (
    <>
      {filterKeys.map((key) => (
        <MultiSelect
          key={key}
          filterKey={key}
          label={filterLabels[key]}
          options={filterOptions[key]}
          selected={filters[key]}
          open={openFilter === key}
          onOpen={() => setOpenFilter(openFilter === key ? null : key)}
          onToggle={(value) => toggleFilter(key, value)}
          onClear={() => clearFilter(key)}
        />
      ))}
    </>
  );

  return (
    <main className={`dashboard-shell ${allFiltersSelected ? "filters-complete" : ""}`} onClick={(event) => {
      if ((event.target as HTMLElement).closest(".filter-control")) return;
      setOpenFilter(null);
    }}>
      <header className="topbar">
        <div className="brand-logo">
          <img src="/mngdp-logo.png" alt="برنامج تطوير وزارة الحرس الوطني" />
        </div>
        <div className="title-block">
          <p>لوحة الأداء المؤسسي</p>
          <h1>قياس نضج النموذج التشغيلي</h1>
        </div>
        <button className="mobile-filter-button" type="button" onClick={() => setMobileFiltersOpen(true)}>
          الفلاتر {activeFilterCount ? `(${activeFilterCount})` : ""}
        </button>
        <nav className="site-nav" aria-label="التنقل الرئيسي">
          <a className="active" href="/">لوحة التحليل</a>
          <a href="/guide">الدليل الإرشادي</a>
          <a href="/upload">رفع البيانات</a>
        </nav>
        <a className="download-link" href={activeVersionId ? `/api/versions/${activeVersionId}/file` : "/النموذج_التشغيلي_موحد_النسب.xlsx"} download>
          تنزيل البيانات
        </a>
      </header>

      <section className="filter-strip" aria-label="فلاتر اللوحة">
        <div className="filter-strip-label">
          <span>نطاق التحليل</span>
          <small>{activeFilterCount ? `${activeFilterCount} اختيارات نشطة` : "جميع البيانات"}</small>
        </div>
        <div className="desktop-filters">{filterControls}</div>
        <button className="reset-button" type="button" onClick={resetFilters} disabled={!activeFilterCount}>
          ↻ إعادة الضبط
        </button>
      </section>

      <section className="stage-section" aria-labelledby="stages-title">
        <div className="stage-section-head">
          <h2 id="stages-title">مراحل قياس مستوى نضج النموذج التشغيلي</h2>
          <div className="stage-title-links" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div className="stage-grid">
          {stages.map((stage) => {
          // A newly uploaded workbook can briefly change the stage list before
          // the derived metrics are recalculated. Treat a missing value as no
          // data instead of allowing the visual formatter to crash the page.
          const value = metrics[stage] ?? null;
          const stageIndex = stages.indexOf(stage);
          const stageClass = stageClasses[stageIndex % stageClasses.length];
          const maturity = maturityLabel(value, data.thresholds);
          return (
            <button
              type="button"
              className={`stage-card ${stageClass} ${activeStage === stage ? "active" : ""}`}
              key={stage}
              onClick={() => { setActiveStage(stage); setPage(0); }}
            >
              <div className="stage-card-head">
                <div className="stage-statuses" aria-label={`مستوى النضج: ${maturity}`}>
                  {maturityStates.map((state) => (
                    <span className={maturity === state ? "is-lit" : ""} key={state}>{state}</span>
                  ))}
                </div>
              </div>
              <div className="stage-card-main">
                <div
                  className="progress-ring"
                  style={{ "--progress": `${value ?? 0}%` } as React.CSSProperties}
                  aria-label={`${stage}: ${value?.toFixed(1) ?? "لا توجد بيانات"}`}
                >
                  <span>{value === null ? "—" : value.toFixed(1)}</span>
                  <small>%</small>
                </div>
              <div>
                  <h2>{stage}</h2>
                </div>
              </div>
            </button>
          );
          })}
        </div>
      </section>

      {!allFiltersSelected && <section className={`analysis-panel ${stageClasses[Math.max(0, stages.indexOf(activeStage)) % stageClasses.length]}`}>
        <div className="analysis-head">
          <div>
            <p>تفصيل المرحلة المختارة</p>
            <h2>{activeStage} حسب {viewLabels[activeView]}</h2>
          </div>
          <div className="view-tabs" role="tablist">
            {viewKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={activeView === key ? "active" : ""}
                onClick={() => { setActiveView(key); setPage(0); }}
              >
                {viewLabels[key]}
              </button>
            ))}
          </div>
          <div className="legend"><i /> {columns.verification} الموزونة</div>
        </div>

        <div className="bars-grid">
          {visibleGroups.map((group, index) => (
            <button
              className="bar-item"
              type="button"
              key={group.name}
              onClick={() => { setDetail({ name: group.name, view: activeView }); setDetailPage(0); }}
            >
              <div className="bar-rank">{String(safePage * pageSize + index + 1).padStart(2, "0")}</div>
              <div className="bar-copy">
                <div><strong>{group.name}</strong><span>{formatPercentage(group.value)}%</span></div>
                <div className="bar-track"><i style={{ width: `${group.value}%` }} /></div>
                <small>{group.units} وحدة · {group.records} سجل</small>
              </div>
            </button>
          ))}
          {visibleGroups.length === 0 && (
            <div className="no-data">لا توجد بيانات ضمن الفلاتر الحالية</div>
          )}
        </div>

        <div className="analysis-footer">
          <span>اضغط على أي بند لعرض السجلات المكوّنة لنسبته</span>
          {pageCount > 1 && (
            <div className="pagination">
              <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>‹</button>
              <b>{safePage + 1} / {pageCount}</b>
              <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage === pageCount - 1}>›</button>
            </div>
          )}
        </div>
      </section>}

      {mobileFiltersOpen && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setMobileFiltersOpen(false)}>
          <section className="filter-drawer" role="dialog" aria-modal="true" aria-label="فلاتر اللوحة" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head"><h2>تحديد نطاق التحليل</h2><button type="button" onClick={() => setMobileFiltersOpen(false)}>×</button></div>
            <div className="drawer-filters">{filterControls}</div>
            <div className="drawer-actions">
              <button type="button" onClick={resetFilters}>مسح الكل</button>
              <button type="button" onClick={() => { setOpenFilter(null); setMobileFiltersOpen(false); }}>عرض النتائج</button>
            </div>
          </section>
        </div>
      )}

      {detail && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetail(null)}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-label={`تفاصيل ${detail.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="detail-head">
              <div><p>{activeStage}</p><h2>{detail.name}</h2></div>
              <button type="button" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="detail-table" role="table">
              <div className="detail-row detail-header" role="row"><span>{columns.id}</span><span>{columns.subUnit}</span><span>{columns.element}</span><span>{columns.verification}</span></div>
              {visibleDetailRows.map((row) => (
                <div className="detail-row" role="row" key={row.id}>
                  <span>{row.id}</span><span>{row.subUnit}</span><span>{row.element}</span><b>{formatPercentage(row.verification)}%</b>
                </div>
              ))}
            </div>
            <div className="detail-footer">
              <span>{detailRows.length} سجل</span>
              {detailPageCount > 1 && <div className="pagination"><button type="button" onClick={() => setDetailPage(Math.max(0, detailPage - 1))} disabled={detailPage === 0}>‹</button><b>{detailPage + 1} / {detailPageCount}</b><button type="button" onClick={() => setDetailPage(Math.min(detailPageCount - 1, detailPage + 1))} disabled={detailPage === detailPageCount - 1}>›</button></div>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
