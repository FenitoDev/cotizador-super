import type { CartItem, Offer } from '../types';
import { isBulk, jaccard, nameTokens, parseSize } from './normalize';

/** ean/name: mismo producto. substitute: otro producto que el usuario aceptó como reemplazo. doubtful: no se usa. */
export type MatchKind = 'ean' | 'name' | 'substitute' | 'doubtful';

export interface Match {
  offer: Offer;
  kind: MatchKind;
  score: number;
}

const ACCEPT = 0.6;
const DOUBTFUL = 0.35;

/** Marcas que en realidad significan "sin marca" (frutas, verduras, granel). */
const GENERIC_BRANDS = new Set(['multi marca', 'multimarca', 'sin marca', 'generico', 'genérico', 'granel']);

/** Marcas propias de cada cadena: entre ellas se consideran equivalentes (mismo producto, otra etiqueta). */
const PRIVATE_LABELS = new Set(['lider', 'great value', 'acuenta', 'cuisine & co', 'jumbo', 'santa isabel', 'unimarc', 'nuestra cocina']);

function normBrand(brand: string | undefined): string | undefined {
  const b = brand?.toLowerCase().trim();
  return !b || GENERIC_BRANDS.has(b) ? undefined : b;
}

function brandFactor(a: string | undefined, b: string | undefined): number {
  const x = normBrand(a);
  const y = normBrand(b);
  if (!x || !y || x === y) return 1;
  if (PRIVATE_LABELS.has(x) && PRIVATE_LABELS.has(y)) return 1;
  return 0.5;
}

/** Puntaje 0..1 entre un producto del carrito y una oferta de otra tienda. */
export function similarity(item: Pick<CartItem, 'name' | 'brand' | 'sizeText'>, offer: Offer): number {
  const a = parseSize(item.sizeText ?? item.name);
  const b = parseSize(offer.sizeText ?? offer.name);
  // Mismo tamaño suma; tamaño distinto descarta casi por completo.
  let sizeFactor = 0.85;
  if (a && b) sizeFactor = a.unit === b.unit && Math.abs(a.amount - b.amount) / a.amount < 0.01 ? 1 : 0.2;
  else if (isBulk(item.name) !== isBulk(offer.name)) sizeFactor = 0.2;
  // El nombre de Jumbo suele incluir la marca y el de Lider no: se compara sin ella.
  const brandTokens = new Set([...nameTokens(item.brand ?? ''), ...nameTokens(offer.brand ?? '')]);
  const strip = (t: Set<string>) => new Set([...t].filter((w) => !brandTokens.has(w)));
  const nameScore = jaccard(strip(nameTokens(item.name)), strip(nameTokens(offer.name)));
  return Math.min(1, nameScore * sizeFactor * brandFactor(item.brand, offer.brand) + (sizeFactor === 1 ? 0.15 : 0));
}

/** Elige la mejor oferta equivalente: primero por EAN, luego por nombre + marca + tamaño. */
export function bestMatch(item: CartItem, offers: Offer[]): Match | undefined {
  if (item.ean) {
    const byEan = offers.find((o) => o.ean && stripEan(o.ean) === stripEan(item.ean!));
    if (byEan) return { offer: byEan, kind: 'ean', score: 1 };
  }
  let best: Match | undefined;
  for (const offer of offers) {
    const score = similarity(item, offer);
    // Con marcas comerciales distintas no es el mismo producto (a lo más, un sustituto).
    const sameBrand = brandFactor(item.brand, offer.brand) === 1;
    if (!best || score > best.score) best = { offer, kind: score >= ACCEPT && sameBrand ? 'name' : 'doubtful', score };
  }
  return best && best.score >= DOUBTFUL ? best : undefined;
}

function stripEan(ean: string): string {
  return ean.replace(/\D/g, '').replace(/^0+/, '');
}
