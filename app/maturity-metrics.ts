import type { ParsedData } from "./workbook-data";

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function ministryStageAverages(data: Pick<ParsedData, "groups" | "stages" | "units" | "scores">) {
  const groupCodes = data.groups.map((group) => new Set(data.units.filter((unit) => unit.group === group).map((unit) => unit.code)));

  return Object.fromEntries(data.stages.map((stage) => {
    const groupScores = groupCodes.map((codes) => data.scores.filter((score) => codes.has(score.unitCode) && score.stage === stage));
    const equalGroupMean = (field: "value" | "target2026") => {
      const values = groupScores.map((scores) => mean(scores.map((score) => score[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value))));
      // A ministry result requires a result from every group, with equal weight before rounding.
      return values.length && values.every((value): value is number => value !== null) ? mean(values) : null;
    };
    return [stage, { value: equalGroupMean("value"), target: equalGroupMean("target2026") }];
  })) as Record<string, { value: number | null; target: number | null }>;
}
