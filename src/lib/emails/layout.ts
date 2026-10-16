// The shared look of ProductRadar's transactional emails: monochrome and data-first, like the
// terminal. Email-safe HTML (tables, inline styles, no images or tracking), with a plain-text twin.

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const MONO = "SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export type Row = [label: string, value: string];

/** A label / value table, values in monospace. */
export function dataTable(rows: Row[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d4d4d8">${rows
    .map(
      ([label, value], i) =>
        `<tr><td style="padding:8px 12px;font:600 11px/1.4 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#52525b;border-top:${i ? "1px solid #e4e4e7" : "0"}">${escapeHtml(label)}</td><td align="right" style="padding:8px 12px;font:600 14px/1.4 ${MONO};color:#09090b;border-top:${i ? "1px solid #e4e4e7" : "0"}">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** The whole message: a dark code-style header, a title, the body and a footer. */
export function emailHtml({ kicker, title, intro, body, action, footer }: { kicker: string; title: string; intro: string; body: string; action?: { label: string; href: string }; footer: string }): string {
  const button = action
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(action.href)}" style="display:inline-block;padding:10px 16px;background:#09090b;color:#ffffff;text-decoration:none;font:600 13px/1 ${SANS};border-radius:4px">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d4d4d8">
<tr><td style="padding:10px 16px;background:#09090b;font:700 11px/1.4 ${MONO};letter-spacing:.14em;color:#ffffff;text-transform:uppercase">ProductRadar <span style="color:#a1a1aa">· ${escapeHtml(kicker)}</span></td></tr>
<tr><td style="padding:20px 16px 4px;font:700 18px/1.3 ${SANS};color:#09090b">${escapeHtml(title)}</td></tr>
<tr><td style="padding:4px 16px 16px;font:400 14px/1.5 ${SANS};color:#3f3f46">${escapeHtml(intro)}</td></tr>
<tr><td style="padding:0 16px 20px">${body}${button}</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #e4e4e7;font:400 12px/1.5 ${SANS};color:#52525b">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** The plain-text twin of a data table. */
export const textTable = (rows: Row[]) => {
  const width = Math.max(...rows.map(([l]) => l.length));
  return rows.map(([l, v]) => `${l.toUpperCase().padEnd(width)}  ${v}`).join("\n");
};
