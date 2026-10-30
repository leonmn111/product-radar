// "Your balance is topped up": sent once per paid top-up (credit pack), from the Stripe webhook. Amounts in £ only.
import type { Email } from "@/lib/email";
import { balanceGbp, creditsGbp, STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";
import { dataTable, emailHtml, textTable, type Row } from "./layout";

export type CreditPurchaseReceiptData = {
  packName: string; // e.g. "Growth Pack"
  credits: number;
  amountPence: number;
  currency: string; // ISO, e.g. "GBP"
  newBalance: number;
  purchasedAt: Date;
  reference: string; // the Stripe Checkout Session id
  libraryUrl: string;
};

const money = (pence: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(pence / 100);
const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function CreditPurchaseReceipt(d: CreditPurchaseReceiptData): Omit<Email, "to"> {
  const rows: Row[] = [
    ["Pack", d.packName],
    ["Amount paid", money(d.amountPence, d.currency)],
    ["Added to your balance", balanceGbp(d.credits)],
    ["New balance", balanceGbp(d.newBalance)],
    ["Date", utc(d.purchasedAt)],
    ["Reference", d.reference],
  ];
  const subject = `Receipt: ${d.packName}, ${money(d.amountPence, d.currency)} top-up`;
  const intro = `Thanks for your purchase. ${balanceGbp(d.credits)} is in your balance and ready to use.`;
  const footer = `A search costs ${creditsGbp(1)} and a Standard Dossier ${creditsGbp(STANDARD_DOSSIER_CREDITS.FREE)} (${creditsGbp(STANDARD_DOSSIER_CREDITS.PRO)} on Pro). Stripe processed the payment; your card statement shows it.`;
  return {
    subject,
    html: emailHtml({ kicker: "Receipt", title: "Your balance is topped up", intro, body: dataTable(rows), action: { label: "Open your library", href: d.libraryUrl }, footer }),
    text: `Your balance is topped up\n\n${intro}\n\n${textTable(rows)}\n\nOpen your library: ${d.libraryUrl}\n\n${footer}\n`,
  };
}
