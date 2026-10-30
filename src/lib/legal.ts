// The details the Terms and Privacy Policy state about who runs ProductRadar. UK law (and the
// Stripe and AliExpress reviews) need the operator's name, a contact email that's read, and an
// address; until they're filled in, the pages show a clearly marked placeholder instead.

import { SITE_URL } from "./site";

export const LEGAL = {
  tradingName: "ProductRadar",
  website: SITE_URL,
  /** The operator's legal name, e.g. "Jane Smith, trading as ProductRadar". */
  operator: "Leon Menalla, trading as ProductRadar" as string | null,
  /** An inbox someone reads, for legal, privacy and refund requests. */
  contactEmail: "leonmenalla@yahoo.com" as string | null,
  /** A postal address for legal notices (a business or virtual-office address works). */
  postalAddress: "25 Dockenfield Close, Havant, PO9 3ST, United Kingdom" as string | null,
  /** The ICO data protection fee registration number, or its status while registration is pending. */
  icoRegistration: "Pending Registration" as string | null,
  lastUpdated: "30 October 2026",
};

/** True when every required detail is filled in (the ICO number is optional). */
export const legalDetailsComplete = () => Boolean(LEGAL.operator && LEGAL.contactEmail && LEGAL.postalAddress);
