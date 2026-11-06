export type StoreId = 'jumbo' | 'lider' | 'unimarc';

export const STORES: StoreId[] = ['jumbo', 'lider', 'unimarc'];

/** Tiendas activas. Unimarc queda fuera por ahora (no hay cuenta); su búsqueda funciona sin sesión. */
export const ENABLED_STORES: StoreId[] = ['jumbo', 'lider'];

/** Producto tal como aparece en el carrito del usuario. */
export interface CartItem {
  store: StoreId;
  sku: string;
  ean?: string;
  name: string;
  brand?: string;
  /** Texto de presentación, ej. "1 L", "6x200 ml". */
  sizeText?: string;
  quantity: number;
  /** Precio unitario en CLP (entero). */
  unitPrice: number;
}

/** Oferta de un producto en una tienda, resultado de una búsqueda. */
export interface Offer {
  store: StoreId;
  sku: string;
  ean?: string;
  name: string;
  brand?: string;
  sizeText?: string;
  unitPrice: number;
  available: boolean;
  url?: string;
  imageUrl?: string;
}

export interface SearchQuery {
  ean?: string;
  name: string;
  brand?: string;
  sizeText?: string;
}

/** Regla de despacho: costo fijo, gratis desde cierto subtotal. */
export interface ShippingRule {
  cost: number;
  freeFrom?: number;
}

/** Suscripción que cambia la regla de despacho de una tienda. */
export interface Subscription {
  id: string;
  store: StoreId;
  name: string;
  /** Costo mensual (CLP). Ej. Jumbo Prime: $30.000 por 6 meses = $5.000/mes. */
  monthlyCost: number;
  shipping: ShippingRule;
  /** El usuario ya la tiene: entonces se usa en la mejor opción (su costo ya está pagado). */
  owned: boolean;
}

export interface StoreConnector {
  id: StoreId;
  /** Lee el carrito desde una pestaña de la tienda (sesión del usuario). */
  readCart(tabId: number): Promise<CartItem[]>;
  search(query: SearchQuery, tabId?: number): Promise<Offer[]>;
}
