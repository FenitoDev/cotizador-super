import { useEffect, useState } from 'react';
import type { HistorySummary, PurchaseRecord } from '../../src/history';
import type { HistoryResponse, QuoteResponse, ReadCartResponse, Request, SearchOriginResponse } from '../../src/messages';
import { storeFromUrl } from '../../src/messages';
import type { Quote, QuoteSettings } from '../../src/quote';
import { substituteKey } from '../../src/match/substitutes';
import { loadSettings, saveSettings } from '../../src/storage';
import { ENABLED_STORES, type CartItem, type StoreId } from '../../src/types';

const STORE_NAMES: Record<StoreId, string> = { jumbo: 'Jumbo', lider: 'Lider', unimarc: 'Unimarc' };
const clp = (n: number | undefined) => (n === undefined ? '—' : `$${Math.round(n).toLocaleString('es-CL')}`);

function send<T>(msg: Request): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}

export default function App() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [origin, setOrigin] = useState<StoreId>('jumbo');
  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState<Quote>();
  const [settings, setSettings] = useState<QuoteSettings>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [history, setHistory] = useState<{ records: PurchaseRecord[]; summary: HistorySummary }>();
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
    send<HistoryResponse>({ type: 'getHistory' }).then((res) => res.ok && setHistory(res.data));
  }, []);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  const readCart = () =>
    run('Leyendo carrito…', async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const store = storeFromUrl(tab?.url);
      if (!tab?.id || !store) throw new Error('Abre el carrito de Jumbo o Lider en la pestaña activa.');
      const res = await send<ReadCartResponse>({ type: 'readCart', tabId: tab.id });
      if (!res.ok) throw new Error(res.error);
      setOrigin(store);
      setItems(res.data.items);
      setExcluded(res.data.excluded);
      setQuote(undefined);
    });

  const addByName = () =>
    run('Buscando…', async () => {
      const res = await send<SearchOriginResponse>({ type: 'searchOrigin', store: origin, name: query });
      if (!res.ok) throw new Error(res.error);
      if (!res.data) throw new Error(`Sin resultados en ${STORE_NAMES[origin]}.`);
      setItems((xs) => [...xs.filter((x) => x.store === origin), res.data!]);
      setQuery('');
      setQuote(undefined);
    });

  const doQuote = () =>
    run('Cotizando en las otras tiendas…', async () => {
      const res = await send<QuoteResponse>({ type: 'quote', items });
      if (!res.ok) throw new Error(res.error);
      setQuote(res.data);
      setRecorded(false);
    });

  const recordPurchase = () =>
    run('Registrando compra…', async () => {
      const res = await send<HistoryResponse>({ type: 'recordPurchase', quote: quote! });
      if (!res.ok) throw new Error(res.error);
      setHistory(res.data);
      setRecorded(true);
    });

  const deletePurchase = (id: string) =>
    run('Borrando…', async () => {
      const res = await send<HistoryResponse>({ type: 'deletePurchase', id });
      if (!res.ok) throw new Error(res.error);
      setHistory(res.data);
    });

  /** Acepta, rechaza u olvida un sustituto y vuelve a cotizar. */
  const decideSubstitute = (key: string, sku: string | null, decision: 'accept' | 'reject') =>
    run('Actualizando sustitutos…', async () => {
      await send({ type: 'setSubstitute', key, sku, decision });
      const res = await send<QuoteResponse>({ type: 'quote', items });
      if (!res.ok) throw new Error(res.error);
      setQuote(res.data);
    });

  const updateSettings = (s: QuoteSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  const originTotal = quote?.singleStore[quote.origin];

  return (
    <main>
      <h1>Cotizador Súper</h1>

      <section>
        <button onClick={readCart} disabled={!!busy}>Leer carrito de la pestaña</button>
        <div className="row">
          <select value={origin} onChange={(e) => setOrigin(e.target.value as StoreId)}>
            {ENABLED_STORES.map((s) => (
              <option key={s} value={s}>{STORE_NAMES[s]}</option>
            ))}
          </select>
          <input
            placeholder="Agregar producto (prueba), ej. leche colun entera"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query && addByName()}
          />
          <button onClick={addByName} disabled={!query || !!busy}>+</button>
        </div>
      </section>

      {items.length > 0 && (
        <section>
          <h2>Carrito en {STORE_NAMES[items[0]!.store]}</h2>
          <ul className="items">
            {items.map((it, i) => (
              <li key={it.sku}>
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => {
                    const q = Math.max(1, Number(e.target.value));
                    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: q } : x)));
                    setQuote(undefined);
                  }}
                />
                <span className="name">{it.name}</span>
                <span>{clp(it.unitPrice)}</span>
                <button className="link" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>✕</button>
              </li>
            ))}
          </ul>
          {excluded.length > 0 && (
            <p className="muted small">No se comparan (vendedor externo): {excluded.join(', ')}</p>
          )}
          <button className="primary" onClick={doQuote} disabled={!!busy}>Cotizar</button>
        </section>
      )}

      {busy && <p className="muted">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {quote && (
        <>
          <section>
            <h2>Comparación</h2>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  {ENABLED_STORES.map((s) => <th key={s}>{STORE_NAMES[s]}</th>)}
                </tr>
              </thead>
              <tbody>
                {quote.rows.map((row) => {
                  const prices = ENABLED_STORES.map((s) => row.matches[s]?.kind !== 'doubtful' ? row.matches[s]?.offer.unitPrice : undefined);
                  const min = Math.min(...prices.filter((p): p is number => p !== undefined));
                  return (
                    <tr key={row.item.sku}>
                      <td>{row.item.quantity}× {row.item.name}</td>
                      {ENABLED_STORES.map((s, k) => {
                        const m = row.matches[s];
                        const err = row.errors[s];
                        return (
                          <td key={s} className={prices[k] === min ? 'best' : ''} title={m ? `${m.offer.name} (${m.kind}, ${m.score.toFixed(2)})` : err}>
                            {m ? clp(m.offer.unitPrice) : err ? '⚠' : 'no está'}
                            {m?.kind === 'doubtful' && <small> ¿?</small>}
                            {m?.kind === 'name' && <small> ≈</small>}
                            {m?.kind === 'substitute' && <small> ↺</small>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>Todo en una tienda (con despacho)</td>
                  {ENABLED_STORES.map((s) => <td key={s}>{clp(quote.singleStore[s])}</td>)}
                </tr>
              </tbody>
            </table>
            <p className="muted small">≈ emparejado por nombre · ↺ sustituto aceptado · ¿? dudoso (no se usa) · pasa el mouse para ver el producto</p>
          </section>

          {quote.rows.some((r) => Object.values(r.substitutes).some((s) => s?.length) || Object.values(r.matches).some((m) => m?.kind === 'substitute')) && (
            <section>
              <h2>Sustitutos</h2>
              <p className="muted small">Productos sin el mismo artículo en la otra tienda. Precio equivalente = llevado al tamaño del original.</p>
              {quote.rows.flatMap((row) =>
                ENABLED_STORES.filter((s) => s !== row.item.store).map((s) => {
                  const key = substituteKey(row.item, s);
                  const m = row.matches[s];
                  const subs = row.substitutes[s] ?? [];
                  if (m?.kind === 'substitute') {
                    return (
                      <div key={key} className="cart">
                        <strong>{row.item.name}</strong> ({clp(row.item.unitPrice)})
                        <div>↺ En {STORE_NAMES[s]}: {m.offer.name} {clp(m.offer.unitPrice)}{' '}
                          <button className="link" onClick={() => decideSubstitute(key, null, 'accept')}>quitar</button>
                        </div>
                      </div>
                    );
                  }
                  if (subs.length === 0) return null;
                  return (
                    <div key={key} className="cart">
                      <strong>{row.item.name}</strong> ({clp(row.item.unitPrice)}) — en {STORE_NAMES[s]}:
                      <ul>
                        {subs.map((sub) => (
                          <li key={sub.offer.sku}>
                            {sub.offer.url ? <a href={sub.offer.url} target="_blank" rel="noreferrer">{sub.offer.name}</a> : sub.offer.name}{' '}
                            {clp(sub.offer.unitPrice)}
                            {sub.equivalentPrice !== undefined && sub.equivalentPrice !== sub.offer.unitPrice && <> (equivale a {clp(sub.equivalentPrice)})</>}
                            {sub.equivalentPrice === undefined && <small> · distinta unidad, no comparable</small>}{' '}
                            <button className="link" onClick={() => decideSubstitute(key, sub.offer.sku, 'accept')}>✓ aceptar</button>
                            <button className="link" onClick={() => decideSubstitute(key, sub.offer.sku, 'reject')}>✕</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }),
              )}
              {quote.withSuggestions && quote.best && quote.withSuggestions.total < quote.best.total - 1 && (
                <p className="saving">
                  Si aceptas los primeros sugeridos: {clp(quote.withSuggestions.total)} (
                  {quote.withSuggestions.carts.map((c) => STORE_NAMES[c.option.store]).join(' + ')})
                </p>
              )}
            </section>
          )}

          {quote.best && (
            <section>
              <h2>Mejor opción: {clp(quote.best.total)}</h2>
              {originTotal !== undefined && originTotal > quote.best.total && (
                <p className="saving">Ahorras {clp(originTotal - quote.best.total)} vs. comprar todo en {STORE_NAMES[quote.origin]}</p>
              )}
              {quote.best.carts.map((c) => (
                <div key={c.option.store + (c.option.subscription?.id ?? '')} className="cart">
                  <strong>{STORE_NAMES[c.option.store]}{c.option.subscription ? ` con ${c.option.subscription.name}` : ''}</strong>
                  : {c.lineIds.length} productos, {clp(c.subtotal)} + despacho {clp(c.shipping)}
                  <ul>
                    {c.lineIds.map((id) => <li key={id}>{quote.rows[Number(id)]!.item.name}</li>)}
                  </ul>
                </div>
              ))}
              <button className="primary" onClick={recordPurchase} disabled={!!busy || recorded}>
                {recorded ? '✓ Compra registrada' : 'Registrar esta compra'}
              </button>
              {quote.best.missing.length > 0 && (
                <p className="error">Sin equivalente: {quote.best.missing.map((id) => quote.rows[Number(id)]!.item.name).join(', ')}</p>
              )}
              {quote.subscriptions.map((a) => (
                <div key={a.subscription.id} className="cart">
                  <strong>{a.subscription.name}</strong>
                  {a.subscription.owned && <small> (la tienes)</small>}
                  <div>Con {a.subscription.name}: {clp(a.totalWith)} · Sin: {clp(a.totalWithout)}</div>
                  {a.breakEvenOrdersPerMonth !== undefined ? (
                    <div className="muted small">
                      Ahorras {clp(a.savingPerOrder)} por pedido. Cuesta {clp(a.subscription.monthlyCost)}/mes: vale la pena si haces{' '}
                      {a.breakEvenOrdersPerMonth} o más pedidos así al mes.
                    </div>
                  ) : (
                    <div className="muted small">Con este carrito no te ahorra nada.</div>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {history && history.summary.count > 0 && (
        <details>
          <summary>Historial: ahorro acumulado {clp(history.summary.totalSaving)} en {history.summary.count} compras</summary>
          <p className="muted small">Ahorro = comprar todo en la tienda donde armaste el carrito − lo que pagaste con la opción recomendada. Promedio {clp(history.summary.averageSaving)} por compra.</p>
          <div className="months">
            {history.summary.byMonth.map((m) => {
              const max = Math.max(...history.summary.byMonth.map((x) => x.saving), 1);
              return (
                <div key={m.month} className="month">
                  <span>{m.month}</span>
                  <span className="bar" style={{ width: `${(m.saving / max) * 100}%` }} />
                  <span>{clp(m.saving)}</span>
                </div>
              );
            })}
          </div>
          <ul className="items">
            {history.records.map((r) => (
              <li key={r.id}>
                <span className="name">
                  {new Date(r.at).toLocaleDateString('es-CL')} · {r.products} productos ·{' '}
                  {r.carts.map((c) => STORE_NAMES[c.store] + (c.subscription ? ` (${c.subscription})` : '')).join(' + ')}
                </span>
                <span className="saving">{clp(r.saving)}</span>
                <button className="link" onClick={() => deletePurchase(r.id)} title="Borrar registro">✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {settings && (
        <details>
          <summary>Despacho y opciones</summary>
          <p className="muted small">Tarifas sin verificar: ajústalas a lo que ves en el checkout de tu comuna.</p>
          {ENABLED_STORES.map((s) => {
            const rule = settings.shipping[s] ?? { cost: 0 };
            const set = (patch: Partial<typeof rule>) =>
              updateSettings({ ...settings, shipping: { ...settings.shipping, [s]: { ...rule, ...patch } } });
            return (
              <div key={s} className="row">
                <label>{STORE_NAMES[s]}</label>
                <input type="number" value={rule.cost} onChange={(e) => set({ cost: Number(e.target.value) })} title="Costo de despacho" />
                <input
                  type="number"
                  placeholder="gratis desde"
                  value={rule.freeFrom ?? ''}
                  onChange={(e) => set({ freeFrom: e.target.value ? Number(e.target.value) : undefined })}
                  title="Envío gratis desde"
                />
              </div>
            );
          })}
          {settings.subscriptions.map((sub) => (
            <div key={sub.id} className="row">
              <label>
                <input
                  type="checkbox"
                  checked={sub.owned}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      subscriptions: settings.subscriptions.map((x) => (x.id === sub.id ? { ...x, owned: e.target.checked } : x)),
                    })
                  }
                />{' '}
                Ya tengo {sub.name}
              </label>
            </div>
          ))}
          <div className="row">
            <label>Máx. carritos</label>
            <input type="number" min={1} max={3} value={settings.maxCarts} onChange={(e) => updateSettings({ ...settings, maxCarts: Number(e.target.value) })} />
          </div>
          <div className="row">
            <label>Costo por carrito extra</label>
            <input type="number" min={0} value={settings.extraCartPenalty} onChange={(e) => updateSettings({ ...settings, extraCartPenalty: Number(e.target.value) })} />
          </div>
        </details>
      )}
    </main>
  );
}
