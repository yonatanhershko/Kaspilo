#!/usr/bin/env bash
# One-line iPhone setup check for Kaspilo:  npm run setup:ios
# Checks Xcode, the simulator and the build tools, then prints what to do next.
# Safe to run again. Installs nothing without telling you.
set -uo pipefail

ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[1;31mx\033[0m %s\n' "$1"; FAILED=1; }
FAILED=0

echo "Checking your Mac for iPhone builds..."

if [ -d /Applications/Xcode.app ]; then
  ok "Xcode installed ($(xcodebuild -version 2>/dev/null | head -1))"
else
  bad "Xcode missing. Install it from the Mac App Store, open it once."
fi

if [ "$(xcode-select -p 2>/dev/null)" = "/Applications/Xcode.app/Contents/Developer" ]; then
  ok "Xcode is the active developer folder"
else
  bad "Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
fi

if xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  ok "Xcode first-launch setup done"
else
  bad "Run: sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"
fi

if xcrun simctl list runtimes 2>/dev/null | grep -q "iOS"; then
  ok "iOS simulator available"
else
  bad "No iOS simulator. Xcode > Settings > Components > download iOS."
fi

if command -v node >/dev/null; then ok "Node $(node -v)"; else bad "Node missing: brew install node"; fi

if [ "$FAILED" -eq 1 ]; then
  echo
  echo "Fix the x lines above, then run  npm run setup:ios  again."
  exit 1
fi

cat <<'GUIDE'

iPhone is ready. Pick one:

  A. Simulator on this Mac (free):
       npm run mobile      then press  i

  B. Your own iPhone with a cable (free Apple ID, app lasts 7 days):
       npm run ios:device
     Phone: Settings > Privacy & Security > Developer Mode on.
     Xcode: sign in with your Apple ID under Settings > Accounts.

  C. TestFlight, no cable (needs the paid Apple Developer account, $99/year):
       npm run eas:login        (once, Expo account)
       npm run eas:setup        (once, links the project and pushes env vars)
       npm run build:ios        (cloud build, asks for your Apple ID)
       npm run submit:ios       (uploads it to App Store Connect)
     Then in App Store Connect > TestFlight add yourself as a tester and
     install with the TestFlight app. Create the app there first with
     bundle id com.kaspilo.app.dev.
GUIDE
