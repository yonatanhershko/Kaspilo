import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// Web: this page loads inside the Google sign-in popup; this hands the URL back and closes it.
WebBrowser.maybeCompleteAuthSession();

/**
 * Landing route for the Google sign-in redirect (kaspilo-dev://auth-callback). The
 * sign-in code reads the session from the URL itself; if Android also opens this
 * route, it just goes back to the entry point.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
