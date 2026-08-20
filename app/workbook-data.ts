import * as XLSX from "xlsx";

export const GROUP_SHEETS = ["المرتبطة بسمو الوزير", "الشؤون التنفيذية", "الجهاز العسكري"] as const;
export const REQUIRED_SHEETS = [
  "المرجع",
  "نقاط التحقق",
  "قائمة الوحدات",
  ...GROUP_SHEETS,
  "النتائج",
  "ملخص الوحدات",
] as const;

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  "قائمة الوحدات": ["كود الوحدة", "المجموعة", "الوحدة التنظيمية الرئيسية", "الوحدة التنظيمية الفرعية", "الوحدة المقاسة", "مستوى الوحدة"],
  "النتائج": ["كود الوحدة", "المجموعة", "الوحدة التنظيمية الرئيسية", "الوحدة التنظيمية الفرعية", "المرحلة", "درجة المرحلة", "التصنيف"],
  "نقاط التحقق": ["كود النقطة", "المرحلة", "العنصر", "نص نقطة التحقق"],
  ...Object.fromEntries(GROUP_SHEETS.map((sheet) => [sheet, [
    "معرف الصف",
    "كود الوحدة",
    "القطاع",
    "الوحدة التنظيمية الرئيسية",
    "الوحدة التنظيمية الفرعية",
    "المرحلة",
    "العنصر",
    "كود النقطة",
    "نص نقطة التحقق",
    "نسبة إنجاز النقطة %",
  ]])),
};

export type OrgUnit = {
  code: string;
  group: string;
  mainUnit: string;
  subUnit: string;
  measuredUnit: string;
  level: string;
};

export type StageScore = {
  unitCode: string;
  group: string;
  mainUnit: string;
  subUnit: string;
  stage: string;
  value: number;
  classification: string;
};

export type WorkbookRow = {
  id: string;
  unitCode: string;
  group: string;
  mainUnit: string;
  subUnit: string;
  stage: string;
  element: string;
  checkpointCode: string;
  checkpointText: string;
  verification: number;
  status: string;
  notes: string;
  provider: string;
};

export type ParsedData = {
  rows: WorkbookRow[];
  units: OrgUnit[];
  scores: StageScore[];
  stages: string[];
  groups: string[];
  thresholds: { initialMax: number; advancedMinExclusive: number };
};

export type LocalFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
};

export const LOCAL_WORKBOOK_NAME = "Copy of قياس_نضج_النموذج_التشغيلي_بالهيكل (1).xlsx";
export const LOCAL_WORKBOOK_URL = `ms-excel:ofe|u|file:///C:/Users/moath/Documents/momma/${encodeURI(LOCAL_WORKBOOK_NAME)}`;
export const LOCAL_SYNC_FINGERPRINT_KEY = "maturity-last-synced-fingerprint-v3";
const LOCAL_SYNC_DB = "maturity-local-sync";
const LOCAL_SYNC_STORE = "settings";
const LOCAL_SYNC_KEY = "linked-workbook";

export function fileFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function openLocalSyncDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_SYNC_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_SYNC_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLinkedWorkbook() {
  const db = await openLocalSyncDatabase();
  return new Promise<LocalFileHandle | null>((resolve, reject) => {
    const request = db.transaction(LOCAL_SYNC_STORE, "readonly").objectStore(LOCAL_SYNC_STORE).get(LOCAL_SYNC_KEY);
    request.onsuccess = () => {
      db.close();
      const handle = (request.result as LocalFileHandle | undefined) ?? null;
      resolve(handle?.name.toLowerCase().endsWith(".xlsx") ? handle : null);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveLinkedWorkbook(handle: LocalFileHandle) {
  const db = await openLocalSyncDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(LOCAL_SYNC_STORE, "readwrite").objectStore(LOCAL_SYNC_STORE).put(handle, LOCAL_SYNC_KEY);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown, sheet: string, rowNumber: number, column: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`قيمة رقمية غير صحيحة في شيت «${sheet}»، الصف ${rowNumber}، عمود «${column}».`);
  return number;
}

function readSheet(workbook: XLSX.WorkBook, name: string) {
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(workbook.Sheets[name], {
    header: 1,
    raw: true,
    defval: "",
  });
  const headers = (matrix[0] ?? []).map(text);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>;
  const missing = (REQUIRED_COLUMNS[name] ?? []).filter((header) => indexes[header] === undefined);
  if (missing.length) throw new Error(`الأعمدة المفقودة في شيت «${name}»: ${missing.join("، ")}`);
  return { rows: matrix.slice(1), indexes };
}

function cell(row: Array<string | number | boolean>, indexes: Record<string, number>, header: string) {
  const index = indexes[header];
  return index === undefined ? "" : row[index];
}

export function parseWorkbook(file: File): Promise<ParsedData> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellNF: true });
    const missingSheets = REQUIRED_SHEETS.filter((name) => !workbook.SheetNames.includes(name));
    if (missingSheets.length) throw new Error(`الشيتات المفقودة: ${missingSheets.join("، ")}`);

    const unitsSheet = readSheet(workbook, "قائمة الوحدات");
    const units = unitsSheet.rows
      .filter((row) => text(cell(row, unitsSheet.indexes, "كود الوحدة")))
      .map((row) => ({
        code: text(cell(row, unitsSheet.indexes, "كود الوحدة")),
        group: text(cell(row, unitsSheet.indexes, "المجموعة")),
        mainUnit: text(cell(row, unitsSheet.indexes, "الوحدة التنظيمية الرئيسية")),
        subUnit: text(cell(row, unitsSheet.indexes, "الوحدة التنظيمية الفرعية")),
        measuredUnit: text(cell(row, unitsSheet.indexes, "الوحدة المقاسة")),
        level: text(cell(row, unitsSheet.indexes, "مستوى الوحدة")),
      }));
    if (!units.length) throw new Error("شيت «قائمة الوحدات» لا يحتوي على وحدات.");

    const unitCodes = new Set(units.map((unit) => unit.code));
    if (unitCodes.size !== units.length) throw new Error("توجد أكواد وحدات مكررة في شيت «قائمة الوحدات».");

    const resultsSheet = readSheet(workbook, "النتائج");
    const scores = resultsSheet.rows
      .filter((row) => text(cell(row, resultsSheet.indexes, "كود الوحدة")))
      .map((row, index) => {
        const value = numberValue(cell(row, resultsSheet.indexes, "درجة المرحلة"), "النتائج", index + 2, "درجة المرحلة");
        if (value < 0 || value > 100) throw new Error(`درجة المرحلة خارج النطاق في شيت «النتائج»، الصف ${index + 2}.`);
        return {
          unitCode: text(cell(row, resultsSheet.indexes, "كود الوحدة")),
          group: text(cell(row, resultsSheet.indexes, "المجموعة")),
          mainUnit: text(cell(row, resultsSheet.indexes, "الوحدة التنظيمية الرئيسية")),
          subUnit: text(cell(row, resultsSheet.indexes, "الوحدة التنظيمية الفرعية")),
          stage: text(cell(row, resultsSheet.indexes, "المرحلة")),
          value,
          classification: text(cell(row, resultsSheet.indexes, "التصنيف")),
        };
      });
    if (!scores.length) throw new Error("شيت «النتائج» لا يحتوي على نتائج.");
    if (scores.some((score) => !unitCodes.has(score.unitCode))) throw new Error("توجد نتائج مرتبطة بكود وحدة غير موجود في «قائمة الوحدات».");

    const rows: WorkbookRow[] = [];
    for (const sheetName of GROUP_SHEETS) {
      const input = readSheet(workbook, sheetName);
      input.rows
        .filter((row) => text(cell(row, input.indexes, "معرف الصف")))
        .forEach((row, index) => {
          const verification = numberValue(cell(row, input.indexes, "نسبة إنجاز النقطة %"), sheetName, index + 2, "نسبة إنجاز النقطة %");
          if (verification < 0 || verification > 100) throw new Error(`نسبة إنجاز النقطة خارج النطاق في شيت «${sheetName}»، الصف ${index + 2}.`);
          const unitCode = text(cell(row, input.indexes, "كود الوحدة"));
          if (!unitCodes.has(unitCode)) throw new Error(`كود الوحدة «${unitCode}» في شيت «${sheetName}» غير موجود في «قائمة الوحدات».`);
          rows.push({
            id: text(cell(row, input.indexes, "معرف الصف")),
            unitCode,
            group: text(cell(row, input.indexes, "القطاع")),
            mainUnit: text(cell(row, input.indexes, "الوحدة التنظيمية الرئيسية")),
            subUnit: text(cell(row, input.indexes, "الوحدة التنظيمية الفرعية")),
            stage: text(cell(row, input.indexes, "المرحلة")),
            element: text(cell(row, input.indexes, "العنصر")),
            checkpointCode: text(cell(row, input.indexes, "كود النقطة")),
            checkpointText: text(cell(row, input.indexes, "نص نقطة التحقق")),
            verification,
            status: text(cell(row, input.indexes, "حالة النقطة")),
            notes: text(cell(row, input.indexes, "ملاحظات النقطة")),
            provider: text(cell(row, input.indexes, "الجهة المزودة للمعلومة")),
          });
        });
    }
    if (!rows.length) throw new Error("أوراق الإدخال الثلاث لا تحتوي على نقاط تحقق.");

    const stages = [...new Set(scores.map((score) => score.stage).filter(Boolean))];
    if (stages.length !== 3) throw new Error(`يجب أن تحتوي النتائج على 3 مراحل بالضبط؛ الموجود ${stages.length}.`);
    const groups = GROUP_SHEETS.filter((group) => units.some((unit) => unit.group === group));
    if (groups.length !== 3) throw new Error("يجب أن تضم «قائمة الوحدات» المجموعات الثلاث: المرتبطة بسمو الوزير، الشؤون التنفيذية، الجهاز العسكري.");

    return { rows, units, scores, stages, groups: [...groups], thresholds: { initialMax: 30, advancedMinExclusive: 70 } };
  });
}

export async function uploadWorkbookVersion(file: File, parsedData?: ParsedData) {
  const data = parsedData ?? await parseWorkbook(file);
  const form = new FormData();
  form.append("file", file);
  form.append("data", JSON.stringify(data));
  const response = await fetch("/api/versions", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "تعذر رفع الملف.");
  return { data, result };
}
