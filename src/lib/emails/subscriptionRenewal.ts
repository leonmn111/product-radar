// "Your plan renewed": sent once per paid subscription invoice that grants monthly credits (Agency).
import type { Email } from "@/lib/email";
import { dataTable, emailHtml, textTable, type Row } from "./layout";

export type SubscriptionRenewalData = {
  planName: string; // e.g. "Agency"
  credits: number;
  amountPaid: number; // minor units
  currency: string; // ISO, e.g. "GBP"
  newBalance: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceNumber: string | null;
  firstPeriod: boolean; // the subscription's first invoice, not a renewal
  libraryUrl: string;
};

const money = (minor: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

export function SubscriptionRenewal(d: SubscriptionRenewalData): Omit<Email, "to"> {
  const rows: Row[] = [
    ["Plan", d.planName],
    ["Credits added", `+${d.credits}`],
    ["Amount paid", money(d.amountPaid, d.currency)],
    ["New balance", `${d.newBalance} credits`],
    ...(d.periodStart && d.periodEnd ? ([["Period", `${day(d.periodStart)} to ${day(d.periodEnd)}`]] as Row[]) : []),
    ...(d.invoiceNumber ? ([["Invoice", d.invoiceNumber]] as Row[]) : []),
  ];
  const title = d.firstPeriod ? `Welcome to ${d.planName}` : `Your ${d.planName} plan renewed`;
  const subject = `${title}: ${d.credits} credits added`;
  const intro = d.firstPeriod
    ? `Your ${d.planName} subscription is active, and this month's ${d.credits} credits are in your account.`
    : `Your ${d.planName} subscription renewed, and this month's ${d.credits} credits are in your account.`;
  const footer = "A Standard Dossier costs 1 credit on your plan, and bulk uploads 1 credit per product. Manage or cancel your plan from your account page.";
  return {
    subject,
    html: emailHtml({ kicker: "Subscription", title, intro, body: dataTable(rows), action: { label: "Open your library", href: d.libraryUrl }, footer }),
    text: `${title}\n\n${intro}\n\n${textTable(rows)}\n\nOpen your library: ${d.libraryUrl}\n\n${footer}\n`,
  };
}
