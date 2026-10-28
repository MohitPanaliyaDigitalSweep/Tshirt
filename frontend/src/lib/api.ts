import { useState, useEffect } from 'react';

export const API_BASE = '/api';

export const TOKEN_KEY = 'ts_token';
export const ROLE_KEY = 'ts_role';

/* ---------- typed errors ---------- */

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string[]>;
  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.slice(0, 500) || fallback;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const k of ['message', 'error', 'detail', 'msg']) {
      if (typeof b[k] === 'string' && (b[k] as string).length > 0) return (b[k] as string).slice(0, 500);
    }
    try {
      const s = JSON.stringify(body);
      return s.slice(0, 500);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/* ---------- session helpers ---------- */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRole(): string | null {
  try {
    return localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}

/** Role lives in the JWT `role` claim minted at login (backend `authz::role`).
 *  login/current JSON bodies do NOT include `role`, so decode it from the token.
 *  Missing/nullable role defaults to `customer`. */
export function roleFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded) as string) as Record<string, unknown>;
    const r = json['role'];
    return typeof r === 'string' && r.length > 0 ? r : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, role?: string | null): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (role) localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event('ts-auth-change'));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event('ts-auth-change'));
  } catch {
    /* ignore */
  }
}

export function isAdmin(): boolean {
  return getRole() === 'admin';
}

/* ---------- core request ---------- */

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const h: Record<string, string> = {};
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => {
        h[k] = v;
      });
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) h[k] = v;
    } else {
      Object.assign(h, headers as Record<string, string>);
    }
  }
  const isForm = rest.body instanceof FormData;
  if (!isForm && rest.body !== undefined && !h['Content-Type']) {
    h['Content-Type'] = 'application/json';
  }
  if (auth) {
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers: h });
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? `Network error: ${e.message}` : 'Network error');
  }
  const ct = res.headers.get('content-type') ?? '';
  let body: unknown = null;
  try {
    if (ct.includes('application/json')) {
      const text = await res.text();
      body = text.length > 0 ? (JSON.parse(text) as unknown) : null;
    } else {
      const text = await res.text();
      body = text.length > 0 ? text : null;
    }
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = extractMessage(body, `Request failed (${res.status} ${res.statusText})`);
    const fields =
      body && typeof body === 'object' && 'fields' in (body as Record<string, unknown>)
        ? ((body as Record<string, unknown>).fields as Record<string, string[]>)
        : undefined;
    throw new ApiError(res.status, msg, fields);
  }
  return body as T;
}

/* ---------- domain types ---------- */

export type Zone = 'front' | 'back' | 'sleeve_left' | 'sleeve_right';
export const ZONES: Zone[] = ['front', 'back', 'sleeve_left', 'sleeve_right'];

export type OrderStatus =
  | 'draft'
  | 'quote_requested'
  | 'quoted'
  | 'confirmed'
  | 'done'
  | 'cancelled';
export const ORDER_STATUSES: OrderStatus[] = [
  'draft',
  'quote_requested',
  'quoted',
  'confirmed',
  'done',
  'cancelled',
];

export interface LoginResponse {
  token: string;
  pid: string;
  name: string;
  is_verified: boolean;
  role?: string | null;
}

export interface CurrentUser {
  pid: string;
  name: string;
  email: string;
  role?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface ZoneArtworkRef {
  url?: string | null;
  preview?: string | null;
  name?: string | null;
  file_type?: string | null;
  asset_id?: number | null;
  transform?: unknown;
}

export interface DesignSnapshot {
  version?: number;
  color?: string | null;
  material_id?: number | null;
  zones?: Partial<Record<Zone, ZoneArtworkRef[]>>;
  views?: {
    front?: { items?: any[] };
    back?: { items?: any[] };
    sleeveLeft?: { items?: any[] };
    sleeveRight?: { items?: any[] };
  };
  thumbs?: { front?: string; back?: string };
  decals?: Array<any>;
  [k: string]: unknown;
}

export interface Material {
  id: number;
  name: string | null;
  description: string | null;
  base_price: number | null;
  colors: unknown;
  sizes: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface MaterialInput {
  name: string;
  description?: string | null;
  base_price?: number | null;
  colors?: string[] | string | null;
  sizes?: string[] | string | null;
}

export interface SizeBreakdown {
  S: number;
  M: number;
  L: number;
  XL: number;
}

export interface Order {
  id: number;
  customer_id?: number | null;
  material_id?: number | null;
  material_name?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_company?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_postal_code?: string | null;
  customer_country?: string | null;
  color?: string | null;
  sizes?: string | SizeBreakdown | Record<string, number> | null;
  qty_total?: number | null;
  status?: string | null;
  customer_note?: string | null;
  quote_price?: number | null;
  admin_note?: string | null;
  design_snapshot?: DesignSnapshot | string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderInput {
  material_id?: number | null;
  color?: string | null;
  sizes?: SizeBreakdown | Record<string, number> | string | null;
  qty_total?: number | null;
  status?: string | null;
  customer_note?: string | null;
  quote_price?: number | null;
  admin_note?: string | null;
  design_snapshot?: DesignSnapshot | string | null;
  customer_id?: number | null;
}

export interface Asset {
  id: number;
  order_id?: number | null;
  zone?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  transform?: unknown;
  created_at?: string;
}

export interface UploadResponse {
  url: string;
  file_type?: string | null;
  id?: number;
}

/* ---------- helpers to normalize loose backend shapes ---------- */

export function parseSizesToBreakdown(sizes: Order['sizes']): SizeBreakdown {
  const base: SizeBreakdown = { S: 0, M: 0, L: 0, XL: 0 };
  if (!sizes) return base;
  if (typeof sizes === 'string') {
    try {
      const p = JSON.parse(sizes) as Record<string, unknown>;
      for (const k of ['S', 'M', 'L', 'XL'] as const) {
        const v = Number(p[k] ?? 0);
        base[k] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
      }
    } catch {
      /* keep zeros */
    }
    return base;
  }
  if (typeof sizes === 'object') {
    const p = sizes as Record<string, unknown>;
    for (const k of ['S', 'M', 'L', 'XL'] as const) {
      const v = Number(p[k] ?? 0);
      base[k] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    }
  }
  return base;
}

export function parseDesignSnapshot(ds: Order['design_snapshot']): DesignSnapshot {
  let parsed: any = ds;
  if (!parsed) return { zones: {}, views: { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } }, version: 2 };
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as any;
    } catch {
      return { zones: {}, views: { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } }, version: 2 };
    }
  }
  const base: any = { zones: {}, views: { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } }, ...parsed };
  if (base.version !== 2 && parsed && (parsed.zones || parsed.decals)) {
    // migrate v1
    const views: any = { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } };
    const decals = parsed.decals || [];
    if (Array.isArray(decals) && decals.length > 0) {
      for (const d of decals) {
        const zone = (d.zone || 'front') as string;
        const url = d.url;
        if (!url) continue;
        const item: any = {
          id: `m-${Date.now()}-${Math.random()}`,
          kind: 'image',
          url,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotationDeg: 0,
          opacity: 1,
        };
        if (zone === 'front') views.front.items.push(item);
        if (zone === 'back') views.back.items.push(item);
        if (zone === 'sleeve_left') views.sleeveLeft.items.push(item);
        if (zone === 'sleeve_right') views.sleeveRight.items.push(item);
      }
    } else {
      for (const z of ['front', 'back', 'sleeve_left', 'sleeve_right'] as const) {
        const arr = parsed.zones?.[z] || [];
        for (const a of arr) {
          const url = a.url || a.preview;
          if (!url) continue;
          const item: any = { id: `m-${Date.now()}-${Math.random()}`, kind: 'image', url, x: 0.5, y: 0.5, scale: 1, rotationDeg: 0, opacity: 1 };
          if (z === 'front') views.front.items.push(item);
          if (z === 'sleeve_left') views.sleeveLeft.items.push(item);
          if (z === 'sleeve_right') views.sleeveRight.items.push(item);
          if (z === 'back') views.back.items.push(item);
        }
      }
    }
    base.views = views;
    base.version = 2;
  }
  if (!base.views) base.views = { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } };
  return base;
}

export function parseStringArray(v: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v) as unknown;
      if (Array.isArray(p)) return p.map((x) => String(x));
    } catch {
      /* fall through */
    }
    if (v.trim() === '') return fallback;
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return fallback;
}

export function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const k of ['data', 'items', 'materials', 'orders', 'assets', 'results']) {
      if (Array.isArray(b[k])) return b[k] as T[];
    }
  }
  return [];
}

/* ---------- auth ---------- */

export async function login(input: LoginInput): Promise<LoginResponse> {
  const res = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(input),
  });
  const role = res.role ?? roleFromToken(res.token) ?? 'customer';
  setSession(res.token, role);
  return { ...res, role };
}

export async function register(input: RegisterInput): Promise<void> {
  await request<unknown>('/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(input),
  });
}

export async function current(): Promise<CurrentUser> {
  const res = await request<CurrentUser>('/auth/current', { method: 'GET' });
  const role = res.role ?? roleFromToken(getToken()) ?? 'customer';
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* ignore */
  }
  return { ...res, role };
}

export function logout(): void {
  clearSession();
}

/* ---------- materials ---------- */

export async function listMaterials(): Promise<Material[]> {
  const body = await request<unknown>('/materials', { method: 'GET' });
  return unwrapList<Material>(body);
}

export async function getMaterial(id: number | string): Promise<Material> {
  return request<Material>(`/materials/${id}`, { method: 'GET' });
}

export async function createMaterial(input: MaterialInput): Promise<Material> {
  return request<Material>('/materials', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateMaterial(
  id: number | string,
  input: Partial<MaterialInput>,
): Promise<Material> {
  return request<Material>(`/materials/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteMaterial(id: number | string): Promise<void> {
  await request<unknown>(`/materials/${id}`, { method: 'DELETE' });
}

/* ---------- orders ---------- */

export interface OrderFilters {
  status?: string;
  q?: string;
}

export async function listOrders(filters: OrderFilters = {}): Promise<Order[]> {
  // Backend GET /api/orders ignores status/q query params — fetch all, filter client-side.
  const body = await request<unknown>('/orders', { method: 'GET' });
  let list = unwrapList<Order>(body);
  if (filters.status) list = list.filter((o) => (o.status ?? 'draft') === filters.status);
  if (filters.q) {
    const needle = filters.q.trim().toLowerCase();
    if (needle) {
      list = list.filter((o) =>
        [String(o.id), o.customer_name ?? '', o.customer_email ?? '', o.color ?? '', o.status ?? '', o.customer_note ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
  }
  return list;
}

/** Admin orders list: backend GET /api/admin/orders takes NO query params — fetch all, filter client-side. */
export async function listAdminOrders(filters: OrderFilters = {}): Promise<Order[]> {
  const body = await request<unknown>('/admin/orders', { method: 'GET' });
  let list = unwrapList<Order>(body);
  if (filters.status) list = list.filter((o) => (o.status ?? 'draft') === filters.status);
  if (filters.q) {
    const needle = filters.q.trim().toLowerCase();
    if (needle) {
      list = list.filter((o) =>
        [String(o.id), o.customer_name ?? '', o.customer_email ?? '', o.color ?? '', o.status ?? '', o.customer_note ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
  }
  return list;
}

export async function getOrder(id: number | string): Promise<Order> {
  return request<Order>(`/orders/${id}`, { method: 'GET' });
}

export async function createOrder(input: OrderInput): Promise<Order> {
  return request<Order>('/orders', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateOrder(
  id: number | string,
  input: Partial<OrderInput>,
): Promise<Order> {
  return request<Order>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteOrder(id: number | string): Promise<void> {
  await request<unknown>(`/orders/${id}`, { method: 'DELETE' });
}

export async function requestQuote(id: number | string): Promise<Order> {
  return request<Order>(`/orders/${id}/request-quote`, { method: 'POST', body: JSON.stringify({}) });
}

export async function quoteOrder(
  id: number | string,
  price: number,
  note?: string | null,
): Promise<Order> {
  return request<Order>(`/admin/orders/${id}/quote`, {
    method: 'PATCH',
    body: JSON.stringify({ quote_price: price, admin_note: note ?? null }),
  });
}

export async function confirmOrder(id: number | string): Promise<Order> {
  return request<Order>(`/orders/${id}/confirm`, { method: 'POST', body: JSON.stringify({}) });
}

export async function cancelOrder(id: number | string): Promise<Order> {
  return request<Order>(`/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

export async function adminDoneOrder(id: number | string): Promise<Order> {
  return request<Order>(`/admin/orders/${id}/done`, { method: 'POST', body: JSON.stringify({}) });
}

export async function adminCancelOrder(id: number | string): Promise<Order> {
  return request<Order>(`/admin/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

/* ---------- assets ---------- */

export async function listAssets(orderId: number | string): Promise<Asset[]> {
  const body = await request<unknown>(`/orders/${orderId}/assets`, { method: 'GET' });
  return unwrapList<Asset>(body);
}

export async function createAsset(
  orderId: number | string,
  input: { zone: string; file_url: string; file_type?: string | null; transform?: unknown },
): Promise<Asset> {
  return request<Asset>(`/orders/${orderId}/assets`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateAsset(
  id: number | string,
  input: Partial<{ zone: string; file_url: string; file_type: string | null; transform: unknown }>,
): Promise<Asset> {
  return request<Asset>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteAsset(id: number | string): Promise<void> {
  await request<unknown>(`/assets/${id}`, { method: 'DELETE' });
}

/* ---------- uploads (POST /api/uploads multipart `file`, then POST /api/orders/:id/assets) ---------- */

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await request<UploadResponse>('/uploads', { method: 'POST', body: form });
  if (res && typeof res.url === 'string') return res;
  const r = res as unknown as Record<string, unknown>;
  const url = typeof r['file_url'] === 'string' ? (r['file_url'] as string) : typeof r['url'] === 'string' ? (r['url'] as string) : '';
  return { url, file_type: (r['file_type'] as string | null) ?? file.type, id: r['id'] as number | undefined };
}

/* ---------- viewer settings (GET /api/settings is public; admin writes) ---------- */

export interface ViewerSettings {
  fabric_wind?: number | null;
  swing_strength?: number | null;
  autorotate_speed?: number | null;
  max_upload_mb?: number | null;
  shop_name?: string | null;
  support_email?: string | null;
  announcement?: string | null;
  [k: string]: unknown;
}

/** Keys accepted by PUT /api/admin/settings. Anything else → 400. */
export const SETTINGS_KEYS = [
  'fabric_wind',
  'swing_strength',
  'autorotate_speed',
  'max_upload_mb',
  'shop_name',
  'support_email',
  'announcement',
  'tshirt_preset_price',
  'hoodie_preset_price',
  'cap_preset_price',
] as const;

export const SETTINGS_DEFAULTS: { 
  fabric_wind: number; 
  swing_strength: number; 
  autorotate_speed: number; 
  tshirt_preset_price: number; 
  hoodie_preset_price: number; 
  cap_preset_price: number; 
} = {
  fabric_wind: 0.35,
  swing_strength: 1,
  autorotate_speed: 1.0,
  tshirt_preset_price: 25,
  hoodie_preset_price: 40,
  cap_preset_price: 15,
};

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function normalizeSettings(raw: unknown): ViewerSettings {
  if (!raw || typeof raw !== 'object') return { ...SETTINGS_DEFAULTS };
  const r = raw as Record<string, unknown>;
  // Accept both flat {fabric_wind,...} and wrapped {data:{...}} / {settings:{...}} shapes.
  const src = (r['data'] && typeof r['data'] === 'object' ? r['data'] : r['settings'] && typeof r['settings'] === 'object' ? r['settings'] : r) as Record<string, unknown>;
  const out: ViewerSettings = { ...src };
  const fw = numOrNull(src['fabric_wind']);
  out.fabric_wind = fw == null ? SETTINGS_DEFAULTS.fabric_wind : Math.min(1, Math.max(0, fw));
  const sw = numOrNull(src['swing_strength']);
  out.swing_strength = sw == null ? SETTINGS_DEFAULTS.swing_strength : Math.max(0, sw);
  const ar = numOrNull(src['autorotate_speed']);
  out.autorotate_speed = ar == null ? SETTINGS_DEFAULTS.autorotate_speed : ar;
  return out;
}

/** Public viewer defaults. Returns local defaults when the backend has no settings route yet. */
export async function getPublicSettings(): Promise<ViewerSettings> {
  try {
    const body = await request<unknown>('/settings', { method: 'GET', auth: false });
    return normalizeSettings(body);
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/** Admin read: prefers /api/admin/settings, falls back to public GET /api/settings. */
export async function getSettings(): Promise<ViewerSettings> {
  try {
    const body = await request<unknown>('/admin/settings', { method: 'GET' });
    return normalizeSettings(body);
  } catch {
    return getPublicSettings();
  }
}

/** Admin write: one PUT /api/admin/settings {key,value} per allowlisted key.
 *  The backend rejects any other shape with 400, so never PUT the whole
 *  object. Per-key 422s are collected into one message (shown verbatim by
 *  the Admin UI); other errors throw immediately. Returns a fresh read
 *  (admin GET with public GET fallback). */
export async function updateSettings(input: ViewerSettings): Promise<ViewerSettings> {
  const failures: string[] = [];
  let saved = 0;
  for (const key of SETTINGS_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    try {
      await request<unknown>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key, value }),
      });
      saved += 1;
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        failures.push(`${key}: ${e.message}`);
      } else {
        throw e;
      }
    }
  }
  if (failures.length > 0) {
    throw new ApiError(422, failures.join('; '));
  }
  if (saved === 0) {
    throw new ApiError(400, 'No known settings keys to save');
  }
  return getSettings();
}

/* ---------- profile completeness gate (frontend only; no backend validation) ---------- */

/** Required profile for ordering: name (≥2), phone, address, city (country/postal optional). */
export function profileComplete(
  user: Pick<CurrentUser, 'name' | 'phone' | 'address' | 'city'> | null | undefined,
): boolean {
  if (!user) return false;
  const name = (user.name ?? '').trim();
  const phone = (user.phone ?? '').trim();
  const address = (user.address ?? '').trim();
  const city = (user.city ?? '').trim();
  return name.length >= 2 && phone.length > 0 && address.length > 0 && city.length > 0;
}

export const PROFILE_REQUIRED_MSG =
  'Complete your profile (name, phone, address, city) to place orders';

export interface ProfileInput {
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function profileFrom(v: unknown): CurrentUser | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r['email'] !== 'string' && typeof r['name'] !== 'string') return null;
  return {
    pid: typeof r['pid'] === 'string' ? r['pid'] : '',
    name: typeof r['name'] === 'string' ? r['name'] : '',
    email: typeof r['email'] === 'string' ? r['email'] : '',
    role: typeof r['role'] === 'string' ? r['role'] : (roleFromToken(getToken()) ?? 'customer'),
    phone: strOrNull(r['phone']),
    company: strOrNull(r['company']),
    address: strOrNull(r['address']),
    city: strOrNull(r['city']),
    postal_code: strOrNull(r['postal_code']),
    country: strOrNull(r['country']),
  };
}

/** Best-effort profile read: /api/users/me, else /api/auth/current (which lacks profile fields). */
export async function getProfile(): Promise<CurrentUser | null> {
  for (const path of ['/users/me', '/profile']) {
    try {
      const p = profileFrom(await request<unknown>(path, { method: 'GET' }));
      if (p) return p;
    } catch {
      /* try next */
    }
  }
  try {
    return await current();
  } catch {
    return null;
  }
}

/** Best-effort profile write: PUT /api/users/me, else PUT /api/profile. Verbatim errors. */
export async function updateProfile(input: ProfileInput): Promise<CurrentUser> {
  let last: unknown = null;
  for (const path of ['/users/me', '/profile']) {
    try {
      const p = profileFrom(await request<unknown>(path, { method: 'PUT', body: JSON.stringify(input) }));
      if (p) return p;
      const g = await getProfile();
      if (g) return g;
    } catch (e) {
      last = e;
    }
  }
  if (last instanceof ApiError) throw last;
  throw new ApiError(0, 'Profile update is not supported by the server yet');
}

/* ---------- design export ---------- */

export interface DesignExport {
  success: boolean;
  snapshot: DesignSnapshot;
  image_url?: string;
  download_url?: string;
  message?: string;
}

export async function exportDesign(id: number | string): Promise<DesignExport> {
  return request<DesignExport>(`/orders/${id}/export-design`, { method: 'POST', body: JSON.stringify({}) });
}

/* ---------- end ---------- */

export function useOrder() {
  const [order] = useState<Order | null>(null);
  useEffect(() => {
    // In a real app, this would fetch order data from the API
    // For now, return null as there's no active order context
  }, []);
  return { order };
}
