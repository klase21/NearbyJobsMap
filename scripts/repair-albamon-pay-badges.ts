import { getDatabasePath, openWritableDatabase } from "../src/db/connection";
import { auditLegacyAlbamonPayBadges, repairLegacyAlbamonPayBadges } from "../src/db/repairs/legacy-albamon-pay-badge";

const apply = process.argv.includes("--apply");
const database = openWritableDatabase(getDatabasePath());
try {
  const before = auditLegacyAlbamonPayBadges(database);
  const result = apply ? repairLegacyAlbamonPayBadges(database) : { ...before, repairedCount: 0 };
  const after = auditLegacyAlbamonPayBadges(database);
  console.log(JSON.stringify({ mode: apply ? "apply" : "audit", before, result, after }, null, 2));
} finally {
  database.close();
}
