// Lightweight client-side "inquiry list" — a quote builder, not a cart.
// Items live in localStorage so they survive across pages. Components listen
// for the 'jsdc-inquiry-change' custom event to react to additions/removals.

export type InquiryItem = {
  id: string;          // internal SKU (e.g. GTA-W-0003)
  name: string;        // brand + model for display
  category: 'wheel' | 'tire';
  image?: string;
  size?: string;       // tireSize or "DxW" for wheels
  priceNum: number;    // per-unit price in CAD
  qty: number;         // defaults to 4 (sets of 4)
  vehicle?: string;    // optional: vehicle context, e.g. "2025 Hyundai Tucson"
};

const KEY = 'jsdc_inquiry';
const EVENT = 'jsdc-inquiry-change';

function emit() {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch (e) { /* noop */ }
}

export function getItems(): InquiryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function setItems(items: InquiryItem[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* noop */ }
  emit();
}

export function addItem(item: Omit<InquiryItem, 'qty'> & { qty?: number }) {
  const items = getItems();
  if (items.some(i => i.id === item.id)) return; // idempotent — already added
  setItems([...items, { ...item, qty: item.qty || 4 }]);
}

export function removeItem(id: string) {
  setItems(getItems().filter(i => i.id !== id));
}

export function updateQty(id: string, qty: number) {
  const clamped = Math.max(1, Math.min(99, Math.floor(qty)));
  setItems(getItems().map(i => i.id === id ? { ...i, qty: clamped } : i));
}

export function hasItem(id: string): boolean {
  return getItems().some(i => i.id === id);
}

export function clearItems() {
  setItems([]);
}

export function getCount(): number {
  return getItems().length;
}

export function getTotalUnits(): number {
  return getItems().reduce((sum, i) => sum + i.qty, 0);
}

export function getTotalPrice(): number {
  return getItems().reduce((sum, i) => sum + i.priceNum * i.qty, 0);
}

export const INQUIRY_EVENT = EVENT;
