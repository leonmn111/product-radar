// "Your Pre-order Check": sent once per paid £29 Pre-order Check, with the link to its page.
import type { Email } from "@/lib/email";
import { dataTable, emailHtml, textTable, type Row } from "./layout";

export type PreorderCheckReceiptData = {
  productTitle: string;
  amountPence: number;
  paidAt: Date;
  reference: string; // the Stripe Checkout Session id
  checkUrl: string; // the Pre-order Check's own page
};

const gbp = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function PreorderCheckReceipt(d: PreorderCheckReceiptData): Omit<Email, "to"> {
  const rows: Row[] = [
    ["Product", d.productTitle],
    ["Amount paid", gbp(d.amountPence)],
    ["Date", utc(d.paidAt)],
    ["Reference", d.reference],
  ];
  const subject = `Your Pre-order Check: ${d.productTitle.slice(0, 60)}`;
  const intro = "Thanks for your purchase. Your full Pre-order Check is ready: every UK cost line, the worst case and an ad-test plan. Its page stays open at the link below.";
  const footer = "A one-off payment, not a subscription. Stripe processed it; your card statement shows it. A calculated estimate, not a guarantee.";
  return {
    subject,
    html: emailHtml({ kicker: "Receipt", title: "Your Pre-order Check", intro, body: dataTable(rows), action: { label: "Open your Pre-order Check", href: d.checkUrl }, footer }),
    text: `Your Pre-order Check\n\n${intro}\n\n${textTable(rows)}\n\nOpen your Pre-order Check: ${d.checkUrl}\n\n${footer}\n`,
  };
}
