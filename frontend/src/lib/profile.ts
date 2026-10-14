import type { CurrentUser } from './api';

export type ProfileLike = Pick<
  CurrentUser,
  'name' | 'phone' | 'address' | 'city'
> & Partial<Pick<CurrentUser, 'email' | 'role' | 'company' | 'postal_code' | 'country' | 'pid'>>;

/** Required profile for ordering: name (≥2 chars), phone, address, city.
 *  Country/postal optional. Frontend gate only (no backend validation). */
export function profileComplete(user: ProfileLike | null | undefined): boolean {
  if (!user) return false;
  const name = (user.name ?? '').trim();
  const phone = (user.phone ?? '').trim();
  const address = (user.address ?? '').trim();
  const city = (user.city ?? '').trim();
  return name.length >= 2 && phone.length > 0 && address.length > 0 && city.length > 0;
}

/** Missing required fields, for the completion checklist UI. */
export function missingProfileFields(user: ProfileLike | null | undefined): string[] {
  if (!user) return ['name', 'phone', 'address', 'city'];
  const missing: string[] = [];
  if ((user.name ?? '').trim().length < 2) missing.push('name');
  if ((user.phone ?? '').trim().length === 0) missing.push('phone');
  if ((user.address ?? '').trim().length === 0) missing.push('address');
  if ((user.city ?? '').trim().length === 0) missing.push('city');
  return missing;
}

export const PROFILE_REQUIRED_MSG =
  'Complete your profile (name, phone, address, city) to place orders';
