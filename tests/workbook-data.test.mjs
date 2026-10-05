import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { GROUP_SHEETS, REQUIRED_SHEETS, REQUIRED_COLUMNS, parseWorkbook } from "../app/workbook-data.ts";
import { ministryStageAverages } from "../app/maturity-metrics.ts";

const stages = ["التصميم", "البناء المؤسسي", "التشغيل"];

function workbookFile(points, { cachedScore = 77, reference = true, blankBeforePoints = false } = {}) {
  const workbook = XLSX.utils.book_new();
  const units = GROUP_SHEETS.map((group, index) => ({ "كود الوحدة": `U${index}`, "المجموعة": group, "الوحدة التنظيمية الرئيسية": group, "الوحدة التنظيمية الفرعية": group, "الوحدة المقاسة": group, "مستوى الوحدة": "وحدة" }));
  const results = units.flatMap((unit) => stages.map((stage) => ({ ...unit, "المرحلة": stage, "درجة المرحلة": unit["كود الوحدة"] === "U2" && stage === stages[0] ? cachedScore : 77, "درجة المرحلة المستهدفة لعام 2026": 99, "التصنيف": "متقدم" })));
  for (const sheet of REQUIRED_SHEETS) {
    const headers = REQUIRED_COLUMNS[sheet] ?? (sheet === "المرجع" ? ["المرحلة", "العنصر", "الوزن في المرحلة %"] : ["بيانات"]);
    let rows = [];
    if (sheet === "قائمة الوحدات") rows = units;
    if (sheet === "النتائج") rows = results;
    if (sheet === "المرجع" && reference) rows = stages.flatMap((stage) => [{ "المرحلة": stage, "العنصر": "A", "الوزن في المرحلة %": 25 }, { "المرحلة": stage, "العنصر": "B", "الوزن في المرحلة %": 75 }]);
    if (GROUP_SHEETS.includes(sheet)) {
      const code = `U${GROUP_SHEETS.indexOf(sheet)}`;
      rows = stages.flatMap((stage, stageIndex) => (code === "U2" && stageIndex === 0 ? points : [{ value: 60, target: 80, element: "A" }]).map((point, pointIndex) => ({
        "معرف الصف": `${code}-${stageIndex}-${pointIndex}`, "كود الوحدة": code, "القطاع": sheet,
        "الوحدة التنظيمية الرئيسية": sheet, "الوحدة التنظيمية الفرعية": sheet,
        "المرحلة": stage, "العنصر": point.element ?? "A", "كود النقطة": `${stageIndex}-${pointIndex}`, "نص نقطة التحقق": "نقطة تحقق توضيحية",
        "نسبة إنجاز النقطة %": point.value, "نسبة إنجاز النقطة المستهدفة لعام 2026 %": point.target ?? 80,
      })));
    }
    const matrix = [headers, ...(sheet === GROUP_SHEETS[2] && blankBeforePoints ? [headers.map(() => "")] : []), ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheet);
  }
  return new File([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })], "NA-test.xlsx");
}

function militaryDesign(data) {
  return data.scores.find((score) => score.unitCode === "U2" && score.stage === stages[0]);
}

test("accepts NA in checkpoint cells and excludes it from element averages, preserving weights", async () => {
  for (const marker of ["NA", "na", " Na "]) {
    const data = await parseWorkbook(workbookFile([
      { value: marker, target: 100, element: "A" },
      { value: 100, target: 90, element: "A" },
      { value: 40, target: 80, element: "B" },
    ], { cachedScore: "#VALUE!" }));
    const excluded = data.rows.find((row) => row.verification === null);
    assert.equal(excluded.target2026, null);
    assert.equal(excluded.status, "لا يقاس (NA)");
    assert.equal(militaryDesign(data).value, 55);
    assert.equal(militaryDesign(data).target2026, 82.5);
    assert.equal(data.scores.find((score) => score.unitCode === "U2" && score.stage === stages[1]).value, 77);
    assert.deepEqual(JSON.parse(JSON.stringify(data)).rows.find((row) => row.verification === null), excluded);
  }
});

test("removes entirely inapplicable elements from both weighted denominators", async () => {
  const data = await parseWorkbook(workbookFile([{ value: "NA", element: "A" }, { value: 40, target: 80, element: "B" }]));
  assert.equal(militaryDesign(data).value, 40);
  assert.equal(militaryDesign(data).target2026, 80);
});

test("all-NA stages stay unavailable through group and ministry aggregation", async () => {
  const data = await parseWorkbook(workbookFile([{ value: "NA" }, { value: "NA", element: "B" }], { cachedScore: "NA" }));
  assert.equal(militaryDesign(data).value, null);
  assert.equal(militaryDesign(data).target2026, null);
  assert.equal(militaryDesign(data).classification, "لا يقاس (NA)");
  assert.deepEqual(ministryStageAverages(data)[stages[0]], { value: null, target: null });
});

test("without reference weights, excludes NA from the arithmetic mean and counts real zeroes", async () => {
  const data = await parseWorkbook(workbookFile([{ value: "NA" }, { value: 0, target: 50 }, { value: 100, target: 100 }], { reference: false }));
  assert.equal(militaryDesign(data).value, 50);
  assert.equal(militaryDesign(data).target2026, 75);
});

test("NA in the checkpoint target also marks the whole checkpoint as inapplicable", async () => {
  const data = await parseWorkbook(workbookFile([{ value: 70, target: "NA" }, { value: 60, target: 90 }]));
  assert.equal(data.rows.find((row) => row.verification === null).target2026, null);
  assert.equal(militaryDesign(data).value, 60);
});

test("rejects other text and invalid percentages and reports the physical worksheet row", async () => {
  await assert.rejects(parseWorkbook(workbookFile([{ value: "wrong" }], { blankBeforePoints: true })), /الجهاز العسكري.*الصف 3.*نسبة إنجاز النقطة %/);
  for (const value of [-1, 101]) await assert.rejects(parseWorkbook(workbookFile([{ value }])), /نسبة إنجاز النقطة خارج النطاق/);
  await assert.rejects(parseWorkbook(workbookFile([{ value: 40, target: 101 }])), /مستهدف 2026 خارج النطاق/);
});

test("numeric-only workbooks continue to use their Excel stage results", async () => {
  const data = await parseWorkbook(workbookFile([{ value: 100, target: 100 }]));
  assert.ok(data.scores.every((score) => score.value === 77 && score.target2026 === 99));
  const original = new File([await readFile(new URL("../قياس_نضج_النموذج_التشغيلي_بالهيكل (4).xlsx", import.meta.url))], "original.xlsx");
  const originalData = await parseWorkbook(original);
  assert.equal(originalData.rows.length, 1200);
  assert.equal(originalData.scores.length, 120);
  assert.ok(originalData.rows.every((row) => typeof row.verification === "number"));
  assert.ok(originalData.scores.every((score) => typeof score.value === "number"));
});
