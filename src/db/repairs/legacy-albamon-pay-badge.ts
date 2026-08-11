import type Database from "better-sqlite3";
import type { MapPosition } from "../../domain/ui-job";
import { calculateJobContentHash } from "../content-hash";
import { JobRepository } from "../repositories/job-repository";

type SalaryRow = {
  id: string;
  source_posting_id: string;
  salary_original_text: string;
  salary_type: string;
  salary_minimum_amount: number | null;
  salary_maximum_amount: number | null;
  salary_currency: string | null;
  salary_negotiable: number;
  salary_includes_incentive: number | null;
  salary_normalized_monthly_minimum: number | null;
  salary_normalized_monthly_maximum: number | null;
  salary_normalization_basis: string | null;
  salary_normalization_confidence: string | null;
  display_map_latitude: number | null;
  display_map_longitude: number | null;
  display_map_kind: "exact" | "estimated" | null;
  display_map_provenance: "source" | "fictional_demo" | null;
};

export interface LegacyAlbamonPayBadgeAudit {
  targetCount: number;
  sourcePostingIds: string[];
  independentlyStructuredCount: number;
}

export interface LegacyAlbamonPayBadgeRepairResult extends LegacyAlbamonPayBadgeAudit {
  repairedCount: number;
}

const normalizeDisplay = (value: string): string => value.trim().replace(/\s+/gu, "");

function isIndependentlyStructured(row: SalaryRow): boolean {
  return row.salary_type !== "unknown"
    || row.salary_minimum_amount !== null
    || row.salary_maximum_amount !== null
    || row.salary_currency !== null
    || row.salary_negotiable !== 0
    || row.salary_includes_incentive !== null
    || row.salary_normalized_monthly_minimum !== null
    || row.salary_normalized_monthly_maximum !== null
    || row.salary_normalization_basis !== null
    || row.salary_normalization_confidence !== null;
}

function findTargets(database: Database.Database): SalaryRow[] {
  return (database.prepare(`SELECT id, source_posting_id, salary_original_text, salary_type,
      salary_minimum_amount, salary_maximum_amount, salary_currency, salary_negotiable,
      salary_includes_incentive, salary_normalized_monthly_minimum, salary_normalized_monthly_maximum,
      salary_normalization_basis, salary_normalization_confidence,
      display_map_latitude, display_map_longitude, display_map_kind, display_map_provenance
    FROM jobs WHERE source = 'albamon'`).all() as SalaryRow[])
    .filter((row) => normalizeDisplay(row.salary_original_text) === "당일지급");
}

export function auditLegacyAlbamonPayBadges(database: Database.Database): LegacyAlbamonPayBadgeAudit {
  const targets = findTargets(database);
  return {
    targetCount: targets.length,
    sourcePostingIds: targets.map((row) => row.source_posting_id),
    independentlyStructuredCount: targets.filter(isIndependentlyStructured).length,
  };
}

function mapPosition(row: SalaryRow): MapPosition | null {
  return row.display_map_latitude !== null
    && row.display_map_longitude !== null
    && row.display_map_kind !== null
    && row.display_map_provenance !== null
    ? {
        latitude: row.display_map_latitude,
        longitude: row.display_map_longitude,
        kind: row.display_map_kind,
        provenance: row.display_map_provenance,
      }
    : null;
}

export function repairLegacyAlbamonPayBadges(database: Database.Database): LegacyAlbamonPayBadgeRepairResult {
  const targets = findTargets(database);
  const independentlyStructuredCount = targets.filter(isIndependentlyStructured).length;
  if (independentlyStructuredCount > 0) {
    throw new Error(`LEGACY_ALBAMON_PAY_BADGE_HAS_STRUCTURED_SALARY:${independentlyStructuredCount}`);
  }

  const repository = new JobRepository(database);
  const clearSalary = database.prepare(`UPDATE jobs SET
      salary_original_text = '', salary_type = 'unknown',
      salary_minimum_amount = NULL, salary_maximum_amount = NULL, salary_currency = NULL,
      salary_negotiable = 0, salary_includes_incentive = NULL,
      salary_normalized_monthly_minimum = NULL, salary_normalized_monthly_maximum = NULL,
      salary_normalization_basis = NULL, salary_normalization_confidence = NULL,
      salary_quality = 'unknown'
    WHERE id = ? AND source = 'albamon' AND trim(salary_original_text) <> ''`);
  const updateHash = database.prepare("UPDATE jobs SET content_hash = ? WHERE id = ?");

  const repairedCount = database.transaction(() => {
    let repaired = 0;
    for (const row of targets) {
      repaired += clearSalary.run(row.id).changes;
      const job = repository.findById(row.id);
      if (!job) throw new Error(`LEGACY_ALBAMON_PAY_BADGE_JOB_MISSING:${row.id}`);
      updateHash.run(calculateJobContentHash(job, mapPosition(row)), row.id);
    }
    return repaired;
  })();

  return {
    targetCount: targets.length,
    sourcePostingIds: targets.map((row) => row.source_posting_id),
    independentlyStructuredCount,
    repairedCount,
  };
}
