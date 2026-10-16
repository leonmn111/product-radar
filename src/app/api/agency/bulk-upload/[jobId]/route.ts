import { connection, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { liveSources } from "@/server/live/config";
import { bulkJobFor, ensureProcessing } from "@/services/bulkJobs";
import type { Dossier } from "@/types/dossier";
import { bulkDeps } from "../run";

// GET /api/agency/bulk-upload/{jobId} → the job's progress, and each finished item's verdict and
// links (owner only). A job a restart interrupted is picked up again here.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "unauthenticated", message: "Sign in to see your bulk jobs." }, { status: 401 });
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "not_found" }, { status: 404 });
  const job = await bulkJobFor(db, jobId, viewer.id);
  if (!job) return Response.json({ error: "not_found", message: "No such bulk job on your account." }, { status: 404 });

  if (job.status !== "DONE") {
    const live = liveSources({ allowSample: true });
    if (live.ready) void ensureProcessing(db, job.id, bulkDeps(live)); // no-op while it's already running
  }

  const done = job.items.filter((i) => i.status === "DONE").map((i) => i.dossierId);
  const records = done.length ? await db.dossierRecord.findMany({ where: { id: { in: done } }, select: { id: true, body: true } }) : [];
  const byId = new Map(records.map((r) => [r.id, r.body as unknown as Dossier]));
  const count = (s: string) => job.items.filter((i) => i.status === s).length;
  return Response.json(
    {
      jobId: job.id,
      status: job.status,
      total: job.total,
      counts: { pending: count("PENDING"), running: count("RUNNING"), done: count("DONE"), failed: count("FAILED") },
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      items: job.items.map((i) => {
        const d = byId.get(i.dossierId);
        return {
          position: i.position,
          asin: i.asin,
          status: i.status,
          ...(i.error ? { error: i.error } : {}),
          ...(d
            ? {
                dossierId: d.id,
                title: d.product.title,
                verdict: d.verdict.status === "shown" ? d.verdict.value.kind : "WITHHELD",
                confidence: d.verdict.confidence,
                shopifyCsvUrl: d.exports.shopifyCsvUrl,
              }
            : {}),
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
