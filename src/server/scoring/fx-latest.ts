import type { FxRates } from "./fx";
import rates from "./fx-rates.json";

/** The ECB rates the app compares prices with; fx-rates.json records their date and source. */
export const LATEST_FX: FxRates = { date: rates.date, perEur: rates.perEur };
