// How a paid request answers when a data source fails part-way (a refused or expired token, a network
// error, a rate limit, or the query's own budget running out): 503, with no Dossier built and nothing
// charged. Building one anyway would read "no answer" as "no data", e.g. a supplier outage as "no
// supplier, AVOID". The caller is told which provider failed, never its internal message (it can name
// credentials); the full message goes to the server log for the owner.

import { SourceError } from "@/server/sources/types";
import { BudgetExceededError } from "./budget";

export type SourceFailure = SourceError | BudgetExceededError;

export const isSourceFailure = (e: unknown): e is SourceFailure => e instanceof SourceError || e instanceof BudgetExceededError;

/** Seconds a caller should wait before retrying. */
export const RETRY_AFTER_SECONDS = 120;

/** The failure in words for the caller. */
export function sourceFailureMessage(e: SourceFailure): string {
  if (e instanceof SourceError) return `A data source (${e.provider}) didn't answer properly, so no Dossier was built.`;
  return `The data sources didn't all answer within this request's ${e.reason === "deadline" ? "time" : "call"} budget, so no Dossier was built.`;
}

/** Logs the full failure for the owner and returns the caller's message. */
export function reportSourceFailure(where: string, e: SourceFailure): string {
  console.error(`[${where}] source failed:`, e.message);
  return sourceFailureMessage(e);
}
