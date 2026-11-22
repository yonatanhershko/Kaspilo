import type { Profile } from './database.types';

/**
 * Mirror of the database function public.has_access(), for deciding what the
 * UI shows. The database enforces the real rule; this only avoids a round trip.
 */
export function hasAccess(profile: Pick<Profile, 'role' | 'status' | 'expires_at'>, now = new Date()): boolean {
  if (profile.role === 'admin') return true;
  if (profile.status !== 'active') return false;
  return profile.expires_at === null || new Date(profile.expires_at).getTime() > now.getTime();
}

/** Whole days until expiry, rounded up. null when the plan never expires. */
export function daysUntilExpiry(profile: Pick<Profile, 'expires_at'>, now = new Date()): number | null {
  if (profile.expires_at === null) return null;
  return Math.ceil((new Date(profile.expires_at).getTime() - now.getTime()) / 86_400_000);
}

/** Kaspilo team WhatsApp contact for the locked screen (international format, no plus sign). */
export const ADVISOR_WHATSAPP_NUMBER = '972523203902';

export function advisorWhatsAppUrl(message: string): string {
  return `https://wa.me/${ADVISOR_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/**
 * True for an address from Apple's "Hide My Email" (sign in with Apple). It forwards to
 * the user's real inbox, but means nothing to read, so screens show a label instead.
 */
export function isAppleHiddenEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith('@privaterelay.appleid.com');
}
