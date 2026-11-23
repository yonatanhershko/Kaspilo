import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { useOnboarding } from '@/onboarding/store';

/** Entry point and fallback: sends each user to the one area they may see. */
export default function Index() {
  const { session, access, termsAccepted } = useAuth();
  const { done } = useOnboarding();
  // First launch on this phone: onboarding (docs/spec.md "Onboarding"), afterwards sign-in.
  if (!session) return <Redirect href={done ? '/sign-in' : '/welcome'} />;
  if (!termsAccepted) return <Redirect href="/accept-terms" />;
  if (!access) return <Redirect href="/locked" />;
  return <Redirect href="/today" />;
}
