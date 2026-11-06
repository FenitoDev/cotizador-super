import type { PurchaseRecord } from './history';
import type { SubstituteRules } from './match/substitutes';
import type { QuoteSettings } from './quote';
import { defaultSettings } from './settings';

const KEY = 'settings';

export async function loadSettings(): Promise<QuoteSettings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<QuoteSettings> | undefined;
  const settings = { ...defaultSettings(), ...stored };
  // Ajustes guardados con el formato antiguo (costo por pedido): se vuelve a las suscripciones por defecto.
  if (settings.subscriptions.some((s) => typeof s.monthlyCost !== 'number')) settings.subscriptions = defaultSettings().subscriptions;
  return settings;
}

export async function saveSettings(settings: QuoteSettings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

const SUBS_KEY = 'substituteRules';

export async function loadSubstituteRules(): Promise<SubstituteRules> {
  const stored = (await browser.storage.local.get(SUBS_KEY))[SUBS_KEY] as SubstituteRules | undefined;
  return { accepted: {}, rejected: {}, ...stored };
}

/** Aceptar un sustituto reemplaza al anterior; rechazarlo lo oculta de las sugerencias para ese producto. */
export async function setSubstitute(key: string, sku: string | null, decision: 'accept' | 'reject'): Promise<SubstituteRules> {
  const rules = await loadSubstituteRules();
  if (sku === null) {
    delete rules.accepted[key];
    delete rules.rejected[key];
  } else if (decision === 'accept') {
    rules.accepted[key] = sku;
  } else {
    rules.rejected[key] = [...new Set([...(rules.rejected[key] ?? []), sku])];
    if (rules.accepted[key] === sku) delete rules.accepted[key];
  }
  await browser.storage.local.set({ [SUBS_KEY]: rules });
  return rules;
}

const HISTORY_KEY = 'history';

export async function loadHistory(): Promise<PurchaseRecord[]> {
  return ((await browser.storage.local.get(HISTORY_KEY))[HISTORY_KEY] as PurchaseRecord[] | undefined) ?? [];
}

export async function addPurchase(record: PurchaseRecord): Promise<PurchaseRecord[]> {
  const history = [record, ...(await loadHistory())];
  await browser.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}

export async function deletePurchase(id: string): Promise<PurchaseRecord[]> {
  const history = (await loadHistory()).filter((r) => r.id !== id);
  await browser.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}
