import type { CartItem, Offer, StoreId } from '../types';
import { isBulk, jaccard, nameTokens, parseSize, pricePerUnit, type Size } from './normalize';

export interface Substitute {
  offer: Offer;
  /** 0..1: qué tan parecido es (nombre y tamaño). */
  score: number;
  /** Precio del sustituto llevado al tamaño del producto original (por kilo/litro/unidad), si son comparables. */
  equivalentPrice?: number;
  /** Precio por kg, litro o unidad del sustituto y del original. */
  ppu?: number;
  itemPpu?: number;
}

/** Clave de una regla de sustitución: producto de origen → tienda destino. */
export function substituteKey(item: Pick<CartItem, 'store' | 'sku'>, store: StoreId): string {
  return `${item.store}:${item.sku}>${store}`;
}

/** Decisiones del usuario: sku aceptado en la tienda destino, o la lista de skus rechazados. */
export interface SubstituteRules {
  accepted: Record<string, string>;
  rejected: Record<string, string[]>;
}

/** Palabras de corte, preparación o estado: no dicen qué producto es ("filete" de pollo vs. de pescado). */
const DESCRIPTORS = new Set([
  'filete', 'filetes', 'filetito', 'trozo', 'trozos', 'lomito', 'lomitos', 'picada', 'picado', 'molida', 'molido',
  'entero', 'entera', 'laminado', 'rebanado', 'natural', 'congelado', 'congelada', 'congelados', 'fresco', 'fresca',
  'importado', 'importada', 'sin', 'piel', 'listo', 'listos', 'blanco', 'blanca', 'extra', 'premium', 'mix',
]);

/** Singular aproximado: "frutas" → "fruta", "champiñones" → "champiñon". */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function coreTokens(name: string, brand: string | undefined): string[] {
  const brandTokens = nameTokens(brand ?? '');
  return [...nameTokens(name)].filter((w) => !brandTokens.has(w)).map(stem);
}

/** Gramos y mililitros se comparan como iguales (densidad ≈ 1: aceites, salsas, lácteos). */
function sameUnit(a: Size, b: Size): boolean {
  return a.unit === b.unit || (a.unit !== 'un' && b.unit !== 'un');
}

/** Un sustituto que cuesta menos de 1/4 o más de 4 veces el original casi seguro es otra cosa. */
const MAX_PRICE_RATIO = 4;

/**
 * Candidatos a sustituto: mismo tipo de producto (comparten una de las dos primeras palabras
 * significativas del nombre, ej. "salmón", "merluza") y tamaño parecido (entre la mitad y el doble).
 */
export function substituteCandidates(item: CartItem, offers: Offer[], rejected: string[] = [], max = 3): Substitute[] {
  const itemCore = coreTokens(item.name, item.brand);
  const head = new Set(itemCore.filter((w) => !DESCRIPTORS.has(w) && !DESCRIPTORS.has(`${w}s`)).slice(0, 2));
  const bulk = isBulk(item.name);
  const a = parseSize(item.sizeText ?? item.name);
  const itemPpu = pricePerUnit(item.unitPrice, a);

  const subs: Substitute[] = [];
  for (const offer of offers) {
    if (!offer.available || rejected.includes(offer.sku)) continue;
    const core = coreTokens(offer.name, offer.brand);
    if (!core.some((w) => head.has(w))) continue;
    const nameScore = jaccard(new Set(itemCore), new Set(core));
    if (nameScore < 0.2) continue;

    const b = parseSize(offer.sizeText ?? offer.name);
    let sizeScore = 0.5;
    let equivalentPrice: number | undefined;
    const ppu = pricePerUnit(offer.unitPrice, b);
    if (bulk || isBulk(offer.name)) {
      // Granel: peso variable, no hay precio equivalente confiable.
      sizeScore = 0.2;
    } else if (a && b && sameUnit(a, b)) {
      const ratio = b.amount / a.amount;
      if (ratio < 0.5 || ratio > 2) continue;
      sizeScore = 1 - Math.min(1, Math.abs(Math.log2(ratio)));
      equivalentPrice = Math.round((offer.unitPrice * a.amount) / b.amount);
    } else if (a && b) {
      // Unidad vs. kilo: se muestra, pero no hay precio equivalente.
      sizeScore = 0.2;
    } else if (!a && !b) {
      equivalentPrice = offer.unitPrice;
    }
    const compared = equivalentPrice ?? offer.unitPrice;
    if (compared > item.unitPrice * MAX_PRICE_RATIO || compared * MAX_PRICE_RATIO < item.unitPrice) continue;
    subs.push({ offer, score: 0.6 * nameScore + 0.4 * sizeScore, equivalentPrice, ppu, itemPpu });
  }
  return subs
    .filter((s) => s.score >= 0.3)
    .sort((x, y) => y.score - x.score || (x.equivalentPrice ?? Infinity) - (y.equivalentPrice ?? Infinity))
    .slice(0, max);
}
