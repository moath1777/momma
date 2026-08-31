import { File } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseWorkbook } from "../app/workbook-data.ts";

const projectDir = path.resolve(import.meta.dirname, "..");
const workbookName = "قياس_نضج_النموذج_التشغيلي_بالهيكل (4).xlsx";
const workbookPath = path.join(projectDir, workbookName);
const bytes = await readFile(workbookPath);
const file = new File([bytes], workbookName, {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const data = await parseWorkbook(file);
await writeFile(path.join(projectDir, "app", "model-data.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Generated ${data.rows.length} checkpoints, ${data.units.length} units, and ${data.scores.length} stage scores.`);
