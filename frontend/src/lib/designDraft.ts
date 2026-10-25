import { type Views } from '../components/ShirtViewer';

const DESIGN_STORAGE_KEY = 'tshirt_designer_draft';

export interface DesignDraft {
  views: Views;
  color: string;
  materialId: number | null;
  sizes: Record<string, number>;
  note: string;
  wind: number;
  swingStrength: number;
  autorotateSpeed: number;
  updatedAt: number;
}

const DEFAULT_VIEWS: Views = {
  front: { items: [] },
  back: { items: [] },
  sleeveLeft: { items: [] },
  sleeveRight: { items: [] },
};

const DEFAULT_SIZES = { S: 0, M: 10, L: 0, XL: 0 };

export function saveDesignDraft(draft: Partial<DesignDraft>): void {
  try {
    const existing = loadDesignDraft();
    const merged: DesignDraft = {
      views: draft.views ?? existing.views ?? DEFAULT_VIEWS,
      color: draft.color ?? existing.color ?? '#e5e7eb',
      materialId: draft.materialId ?? existing.materialId ?? null,
      sizes: draft.sizes ?? existing.sizes ?? DEFAULT_SIZES,
      note: draft.note ?? existing.note ?? '',
      wind: draft.wind ?? existing.wind ?? 0.35,
      swingStrength: draft.swingStrength ?? existing.swingStrength ?? 1,
      autorotateSpeed: draft.autorotateSpeed ?? existing.autorotateSpeed ?? 1,
      updatedAt: Date.now(),
    };
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

export function loadDesignDraft(): DesignDraft {
  try {
    const raw = localStorage.getItem('tshirt_designer_draft');
    if (!raw) return getDefaultDraft();
    const parsed = JSON.parse(raw);
    // Validate structure
    return {
      views: parsed.views ?? DEFAULT_VIEWS,
      color: parsed.color ?? '#e5e7eb',
      materialId: parsed.materialId ?? null,
      sizes: parsed.sizes ?? DEFAULT_SIZES,
      note: parsed.note ?? '',
      wind: typeof parsed.wind === 'number' ? parsed.wind : 0.35,
      swingStrength: typeof parsed.swingStrength === 'number' ? parsed.swingStrength : 1,
      autorotateSpeed: typeof parsed.autorotateSpeed === 'number' ? parsed.autorotateSpeed : 1,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return getDefaultDraft();
  }
}

export function clearDesignDraft(): void {
  try {
    localStorage.removeItem(DESIGN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function getDefaultDraft(): DesignDraft {
  return {
    views: DEFAULT_VIEWS,
    color: '#e5e7eb',
    materialId: null,
    sizes: DEFAULT_SIZES,
    note: '',
    wind: 0.35,
    swingStrength: 1,
    autorotateSpeed: 1,
    updatedAt: 0,
  };
}

export function hasDesignDraft(): boolean {
  try {
    const raw = localStorage.getItem(DESIGN_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return (
      parsed.views &&
      (parsed.views.front?.items?.length > 0 ||
        parsed.views.back?.items?.length > 0 ||
        parsed.views.sleeveLeft?.items?.length > 0 ||
        parsed.views.sleeveRight?.items?.length > 0 ||
        (parsed.color && parsed.color !== '#e5e7eb'))
    );
  } catch {
    return false;
  }
}