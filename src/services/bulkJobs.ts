// Agency bulk jobs: up to 100 ASINs from a CSV, each scored as a Standard Dossier in the background.
//
//   parseAsinCsv()     pure: the ASINs in an uploaded CSV (an "asin"/"productId" column or the first
//                      one; Amazon product links work too), duplicates dropped, bad rows named.
//   createBulkJob()    one transaction: the credits (via the caller's spend, one per ASIN) and the
//                      job with a PENDING item per ASIN. Too few credits: nothing is written at all.
//   processBulkJob()   works through the PENDING items one at a time; an item that fails is refunded.
//   ensureProcessing() runs a job at most once per process, and picks up a job a restart interrupted.

import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Dossier } from "@/types/dossier";

export const MAX_BULK_ASINS = 100;
export const BULK_CREDITS_PER_ASIN = 1;

export type ParsedAsins = { asins: string[]; duplicates: number; invalid: { row: number; value: string }[] };

const ASIN = /^[A-Z0-9]{10}$/;
const AMAZON_LINK = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;
const HEADER = /^(asin|asins|product ?id|product_id|productid|id)$/i;

/** One CSV line into cells, honouring double quotes ("a, b" stays one cell; "" is a quote). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const asinOf = (value: string) => {
  const v = value.trim().replace(/^'/, "");
  if (ASIN.test(v.toUpperCase())) return v.toUpperCase();
  return v.match(AMAZON_LINK)?.[1].toUpperCase() ?? null;
};

export function parseAsinCsv(text: string): ParsedAsins {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l, i) => ({ row: i + 1, cells: cells(l) })).filter((l) => l.cells.some(Boolean));
  if (lines.length === 0) return { asins: [], duplicates: 0, invalid: [] };
  // A header row: no ASIN in it, and a column called asin / productId.
  const first = lines[0].cells;
  const named = first.findIndex((c) => HEADER.test(c));
  const hasHeader = named >= 0 && !first.some((c) => asinOf(c));
  const column = hasHeader ? named : 0;
  const seen = new Set<string>();
  const out: ParsedAsins = { asins: [], duplicates: 0, invalid: [] };
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const value = line.cells[column] ?? "";
    const asin = asinOf(value);
    if (!asin) out.invalid.push({ row: line.row, value: value.slice(0, 80) });
    else if (seen.has(asin)) out.duplicates++;
    else {
      seen.add(asin);
      out.asins.push(asin);
    }
  }
  return out;
}

export type SpendInTransaction = (tx: Prisma.TransactionClient, items: { credits: number; reference: string }[]) => Promise<number>;

/** The job and its items, with the credits taken, in one transaction. Throws whatever `spend` throws. */
export async function createBulkJob(db: PrismaClient, userId: string, asins: string[], spend: SpendInTransaction) {
  if (asins.length < 1 || asins.length > MAX_BULK_ASINS) throw new RangeError(`a bulk job takes 1 to ${MAX_BULK_ASINS} ASINs`);
  const items = asins.map((asin, i) => ({ asin, position: i + 1, dossierId: randomBytes(32).toString("hex") }));
  return db.$transaction(async (tx) => {
    const balance = await spend(tx, items.map((i) => ({ credits: BULK_CREDITS_PER_ASIN, reference: i.dossierId })));
    const job = await tx.bulkJob.create({ data: { userId, total: items.length, items: { create: items } }, select: { id: true, status: true, total: true, createdAt: true } });
    return { job, balance };
  });
}

export type BulkDeps = {
  /** Builds and stores one Dossier with this id; null when Amazon UK has no such product. */
  build: (asin: string, dossierId: string) => Promise<Dossier | null>;
  /** Gives back an item's credits when it fails. */
  refund: (userId: string, credits: number, reference: string) => Promise<unknown>;
  /** After the last item, e.g. to email the owner. A failure here is logged; the job is still DONE. */
  onDone?: (summary: { jobId: string; userId: string; total: number; done: number; failed: number }) => Promise<void>;
};

const plain = (e: unknown) => (e instanceof Error ? e.message : "unknown error").slice(0, 300);

/** Scores every PENDING item of a job in turn; marks the job DONE at the end. Safe to run again. */
export async function processBulkJob(db: PrismaClient, jobId: string, deps: BulkDeps): Promise<void> {
  const job = await db.bulkJob.findUnique({ where: { id: jobId }, select: { userId: true, status: true } });
  if (!job || job.status === "DONE") return;
  await db.bulkJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });
  for (;;) {
    const item = await db.bulkJobItem.findFirst({ where: { jobId, status: "PENDING" }, orderBy: { position: "asc" } });
    if (!item) break;
    await db.bulkJobItem.update({ where: { id: item.id }, data: { status: "RUNNING" } });
    let error: string | null = null;
    try {
      if (!(await deps.build(item.asin, item.dossierId))) error = `Amazon UK has no priced product ${item.asin}.`;
    } catch (e) {
      error = `The Dossier couldn't be built (${plain(e)}).`;
    }
    if (error) {
      await deps.refund(job.userId, BULK_CREDITS_PER_ASIN, item.dossierId).catch((e) => console.error("[bulk] refund failed", item.id, e));
      await db.bulkJobItem.update({ where: { id: item.id }, data: { status: "FAILED", error: `${error} Its credit was returned.` } });
    } else {
      await db.bulkJobItem.update({ where: { id: item.id }, data: { status: "DONE" } });
    }
  }
  await db.bulkJob.update({ where: { id: jobId }, data: { status: "DONE", finishedAt: new Date() } });
  if (deps.onDone) {
    const [done, failed, total] = await Promise.all([
      db.bulkJobItem.count({ where: { jobId, status: "DONE" } }),
      db.bulkJobItem.count({ where: { jobId, status: "FAILED" } }),
      db.bulkJobItem.count({ where: { jobId } }),
    ]);
    await deps.onDone({ jobId, userId: job.userId, total, done, failed }).catch((e) => console.error("[bulk] after-job step failed", jobId, e));
  }
}

const active = new Set<string>();

/**
 * Starts a job unless this process is already running it. Items a restart left RUNNING are put back
 * to PENDING first (their credits are still held, so they're simply scored now).
 */
export function ensureProcessing(db: PrismaClient, jobId: string, deps: BulkDeps): Promise<void> {
  if (active.has(jobId)) return Promise.resolve();
  active.add(jobId);
  return db.bulkJobItem
    .updateMany({ where: { jobId, status: "RUNNING" }, data: { status: "PENDING" } })
    .then(() => processBulkJob(db, jobId, deps))
    .catch((e) => console.error("[bulk] job stopped", jobId, e))
    .finally(() => active.delete(jobId));
}

/** A job with its items, for its owner only. */
export function bulkJobFor(db: PrismaClient, jobId: string, userId: string) {
  return db.bulkJob.findFirst({
    where: { id: jobId, userId },
    select: { id: true, status: true, total: true, createdAt: true, finishedAt: true, items: { orderBy: { position: "asc" }, select: { position: true, asin: true, status: true, dossierId: true, error: true } } },
  });
}
