// The free TikTok Shop UK calculator (/tools/tiktok-shop-uk-calculator): what a seller keeps on one
// self-shipped sale after TikTok's referral commission, the order fee and the creator's commission, and so
// the most they can spend on ads to make that sale without losing money. Pure arithmetic with no
// validation library, so it runs in the browser as the visitor types. The rates are the margin engine's
// TikTok Shop UK stack (engine/policy.ts), so the calculator and the Dossier never disagree.
//
//   referral fee     9% of the sale price (5% in selected Electronics & Beauty categories)
//   order fee        £0.50 per self-shipped order (the playbook's figure, unconfirmed by a public source)
//   creator cut      the visitor's own rate (default 15%) of the sale price
//   VAT-registered   the sale price includes 20% VAT: a sixth of it goes to HMRC, and both commissions
//                    are charged on the price before VAT, as the margin engine does
//   max ad cost      the profit before ads: spend more than this on ads per sale and the sale loses money

import { TIKTOK_SHOP_UK_DEFAULT_STACK, TIKTOK_UK_REFERRAL_EVIDENCE, UK_VAT_STANDARD } from "./policy";
import { money2, pct1 } from "./sellingCosts";

export type TikTokShopCategory = { id: string; label: string; rate: number };

/** The referral rates, as TIKTOK_UK_REFERRAL_EVIDENCE states them: 9% standard, 5% in selected Electronics & Beauty categories. */
export const TIKTOK_SHOP_UK_CATEGORIES: TikTokShopCategory[] = [
  { id: "standard", label: "Standard (9%)", rate: TIKTOK_UK_REFERRAL_EVIDENCE.value as number },
  { id: "electronics_beauty", label: "Electronics / Beauty (5%)", rate: 0.05 },
];

export const TIKTOK_SHOP_UK_ORDER_FEE = TIKTOK_SHOP_UK_DEFAULT_STACK.perOrder!.amount;
export const TIKTOK_SHOP_UK_DEFAULT_CREATOR_PCT = TIKTOK_SHOP_UK_DEFAULT_STACK.creatorCommission!.rate * 100;

export type TikTokShopInput = {
  /** What the customer pays, in £. */
  salePrice: number;
  /** One unit landed in the UK: cost of goods plus shipping to the UK. */
  landedCost: number;
  category: string;
  /** Creator commission in percent (15 = 15%). */
  creatorPct: number;
  /** When true the sale price includes 20% UK VAT, which the seller pays to HMRC. */
  vatRegistered: boolean;
};

export type TikTokShopResult = {
  referralRate: number;
  /** The referral commission alone, and with the £0.50 order fee: TikTok's platform fee. */
  referral: number;
  orderFee: number;
  platformFee: number;
  creatorCut: number;
  /** VAT inside the sale price (0 unless VAT-registered). */
  vat: number;
  /** What the sale keeps before any advertising. */
  netProfit: number;
  /** Net profit as % of the sale price. */
  marginPct: number;
  /** The most the seller can spend on ads per sale and break even: the net profit, never below £0. */
  maxAdCost: number;
  /** Sales needed per £1 of ads to break even (sale price ÷ max ad cost); null when there's nothing to spend. */
  breakEvenRoas: number | null;
};

/** Null until the sale price is a positive number and the creator commission is a percentage. */
export function tiktokShopUkMargin(i: TikTokShopInput): TikTokShopResult | null {
  if (!(i.salePrice > 0) || !(i.creatorPct >= 0 && i.creatorPct <= 100)) return null;
  const category = TIKTOK_SHOP_UK_CATEGORIES.find((c) => c.id === i.category) ?? TIKTOK_SHOP_UK_CATEGORIES[0];
  const priceEx = i.vatRegistered ? i.salePrice / (1 + UK_VAT_STANDARD.rate) : i.salePrice;
  const vat = money2(i.salePrice - priceEx);
  const referral = money2(category.rate * priceEx);
  const orderFee = TIKTOK_SHOP_UK_ORDER_FEE;
  const creatorCut = money2((i.creatorPct / 100) * priceEx);
  const netProfit = money2(i.salePrice - vat - (i.landedCost || 0) - referral - orderFee - creatorCut);
  const maxAdCost = Math.max(0, netProfit);
  return {
    referralRate: category.rate,
    referral,
    orderFee,
    platformFee: money2(referral + orderFee),
    creatorCut,
    vat,
    netProfit,
    marginPct: pct1(netProfit / i.salePrice),
    maxAdCost,
    breakEvenRoas: maxAdCost > 0 ? Math.round((i.salePrice / maxAdCost) * 100) / 100 : null,
  };
}
