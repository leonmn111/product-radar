// "Your bulk job is done": sent when an Agency bulk upload has finished scoring every row.
import type { Email } from "@/lib/email";
import { dataTable, emailHtml, textTable, type Row } from "./layout";

export type BulkJobCompleteData = {
  jobId: string;
  total: number;
  done: number;
  failed: number; // each failed row's credit was returned
  libraryUrl: string;
};

export function BulkJobCompleteAlert(d: BulkJobCompleteData): Omit<Email, "to"> {
  const rows: Row[] = [
    ["Job", d.jobId],
    ["Rows processed", `${d.done + d.failed} of ${d.total}`],
    ["Scored", String(d.done)],
    ["Failed (refunded)", String(d.failed)],
  ];
  const subject = `Bulk job done: ${d.done} of ${d.total} scored`;
  const intro = d.failed
    ? `Your bulk upload has finished. ${d.done} products were scored; ${d.failed} couldn't be, and their credits were returned.`
    : `Your bulk upload has finished. All ${d.done} products were scored.`;
  const footer = "Each Dossier is kept in your library, and reopening one is free.";
  return {
    subject,
    html: emailHtml({ kicker: "Bulk job", title: "Your bulk job is done", intro, body: dataTable(rows), action: { label: "View results in your library", href: d.libraryUrl }, footer }),
    text: `Your bulk job is done\n\n${intro}\n\n${textTable(rows)}\n\nView results: ${d.libraryUrl}\n\n${footer}\n`,
  };
}
