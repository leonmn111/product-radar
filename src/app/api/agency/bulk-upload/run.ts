// How a bulk job's items are scored (shared by the upload and the status route, which resumes a job a
// restart interrupted): the same Standard Dossier, cache and storage as one-off Dossiers.

import { simulatedImageMatcher } from "@/engine/imageMatch";
import { db } from "@/lib/db";
import type { LiveSourcesStatus } from "@/server/live/config";
import { createDbCreditStore } from "@/server/billing/credits";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier } from "@/services/dossierService";
import { saveDossier } from "@/services/dossierStore";
import type { BulkDeps } from "@/services/bulkJobs";

export function bulkDeps(live: Extract<LiveSourcesStatus, { ready: true }>): BulkDeps {
  const credits = createDbCreditStore(db);
  return {
    async build(asin, dossierId) {
      const result = await getProductDossier(asin, {
        sources: live.sources,
        cache: dbDossierCache,
        sample: live.sample,
        notes: live.sample ? ["Development sample data: the supplier offers are made up."] : [],
        imageMatcher: live.sample ? simulatedImageMatcher : undefined,
        id: dossierId,
      });
      if (result) await saveDossier(result.dossier);
      return result?.dossier ?? null;
    },
    refund: (userId, n, reference) => credits.refund(userId, n, reference),
  };
}
