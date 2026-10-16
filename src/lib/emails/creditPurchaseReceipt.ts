// "Your credits are in": sent once per paid credit pack, from the Stripe webhook.
import type { Email } from "@/lib/email";
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
    ["Credits added", `+${d.credits}`],
    ["Amount paid", money(d.amountPence, d.currency)],
    ["New balance", `${d.newBalance} credits`],
    ["Date", utc(d.purchasedAt)],
    ["Reference", d.reference],
  ];
  const subject = `Receipt: ${d.packName}, ${d.credits} credits (${money(d.amountPence, d.currency)})`;
  const intro = `Thanks for your purchase. ${d.credits} credits are in your account and ready to use.`;
  const footer = "A search costs 1 credit and a Standard Dossier 4 (1 on Pro). Stripe processed the payment; your card statement shows it.";
  return {
    subject,
    html: emailHtml({ kicker: "Receipt", title: "Your credits are in", intro, body: dataTable(rows), action: { label: "Open your library", href: d.libraryUrl }, footer }),
    text: `Your credits are in\n\n${intro}\n\n${textTable(rows)}\n\nOpen your library: ${d.libraryUrl}\n\n${footer}\n`,
  };
}
