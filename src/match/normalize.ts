export type Unit = 'g' | 'ml' | 'un';

export interface Size {
  /** Cantidad total en la unidad base (g, ml o unidades). */
  amount: number;
  unit: Unit;
}

const UNIT_FACTORS: Record<string, [Unit, number]> = {
  kg: ['g', 1000],
  kilo: ['g', 1000],
  kilos: ['g', 1000],
  g: ['g', 1],
  gr: ['g', 1],
  grs: ['g', 1],
  gramos: ['g', 1],
  l: ['ml', 1000],
  lt: ['ml', 1000],
  lts: ['ml', 1000],
  litro: ['ml', 1000],
  litros: ['ml', 1000],
  cc: ['ml', 1],
  ml: ['ml', 1],
  un: ['un', 1],
  unidad: ['un', 1],
  u: ['un', 1],
  unid: ['un', 1],
  unidades: ['un', 1],
};

const UNIT_RE = Object.keys(UNIT_FACTORS)
  .sort((a, b) => b.length - a.length)
  .join('|');

// "6x200 ml", "6 x 1 L", "pack 4 x 90 g"
const MULTI_RE = new RegExp(`(\\d+)\\s*x\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\b`, 'i');
// "1 L", "1,5 kg", "500g"
const SINGLE_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\b`, 'i');

function toNumber(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Extrae el tamaño total de un texto como "Leche Entera 6x1 L" o "Arroz 1 kg". */
export function parseSize(text: string | undefined): Size | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const multi = MULTI_RE.exec(t);
  if (multi) {
    const [unit, factor] = UNIT_FACTORS[multi[3]!]!;
    return { amount: Number(multi[1]) * toNumber(multi[2]!) * factor, unit };
  }
  const single = SINGLE_RE.exec(t);
  if (single) {
    const [unit, factor] = UNIT_FACTORS[single[2]!]!;
    return { amount: toNumber(single[1]!) * factor, unit };
  }
  // "Palta Hass Unidad": se vende por unidad aunque no diga "1".
  if (/\bunidad\b/.test(t)) return { amount: 1, unit: 'un' };
  return undefined;
}

/** Productos a granel (precio por kilo, peso variable): no se comparan con productos por unidad. */
export function isBulk(text: string): boolean {
  return /\bgranel\b|\baprox/i.test(text);
}

/** Precio por 1 kg, 1 L o 1 unidad. */
export function pricePerUnit(price: number, size: Size | undefined): number | undefined {
  if (!size || size.amount <= 0) return undefined;
  const base = size.unit === 'un' ? 1 : 1000;
  return (price / size.amount) * base;
}

/** Palabras de empaque o relleno que no ayudan a identificar el producto. */
const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'con', 'y', 'x', 'pack', 'caja', 'bolsa', 'botella', 'bandeja',
  'malla', 'lata', 'unidad', 'unidades', 'un', 'granel', 'aprox', 'neto', 'drenado', 'formato', 'envase', 'trozo',
]);

/** Consulta corta para buscadores: sin tamaños, empaques ni signos. Ej. "Tomate Larga Vida Unidad" → "tomate larga vida". */
export function simplifyQuery(text: string, maxWords = 4): string {
  return [...nameTokens(text)].slice(0, maxWords).join(' ');
}

/** Tokens normalizados (sin tildes, sin unidades ni números) para comparar nombres. */
export function nameTokens(text: string): Set<string> {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(new RegExp(`\\d+(?:[.,]\\d+)?\\s*(${UNIT_RE})\\b`, 'g'), ' ')
    .replace(/[^a-z0-9ñ ]/g, ' ');
  return new Set(clean.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
