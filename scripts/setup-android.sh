#!/usr/bin/env bash
# One-line Android setup for Kaspilo:  npm run setup:android
# Installs the Android SDK + an emulator through Homebrew, then prints what to do next.
# Safe to run again: every step checks first.
set -euo pipefail

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31mx %s\033[0m\n' "$1" >&2; exit 1; }

command -v brew >/dev/null || die "Homebrew is missing. Install it from https://brew.sh then run again."

# --- Java (the Android tools need 17 or newer) ---
java_major() { java -version 2>&1 | sed -n '1s/.*"\([0-9]*\).*/\1/p'; }
if ! command -v java >/dev/null || [ "$(java_major || echo 0)" -lt 17 ]; then
  say "Installing Java 17"
  brew install openjdk@17
  export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# --- Android command line tools ---
if [ ! -d "$(brew --prefix)/share/android-commandlinetools" ]; then
  say "Installing Android command line tools"
  brew install --cask android-commandlinetools
fi
export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

case "$(uname -m)" in
  arm64) ABI="arm64-v8a" ;;
  *) ABI="x86_64" ;;
esac
IMAGE="system-images;android-35;google_apis;$ABI"

say "Accepting licenses and installing SDK parts (a few GB, takes a while)"
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platform-tools" "emulator" "platforms;android-35" "build-tools;35.0.0" "$IMAGE"

# --- A ready emulator ---
if ! avdmanager list avd 2>/dev/null | grep -q "Name: finny_pixel"; then
  say "Creating the emulator 'finny_pixel'"
  echo no | avdmanager create avd -n finny_pixel -k "$IMAGE" -d pixel_7
fi

# --- Shell variables, added once ---
RC="$HOME/.zshrc"
if ! grep -q "# finny-android" "$RC" 2>/dev/null; then
  say "Adding ANDROID_HOME to $RC"
  {
    echo ""
    echo "# finny-android"
    echo "export ANDROID_HOME=\"$ANDROID_HOME\""
    echo 'export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"'
  } >> "$RC"
fi

cat <<'GUIDE'

Android is ready. What next:

  1. Open a NEW terminal (so the new variables load).
  2. Start the emulator:       emulator -avd finny_pixel
  3. In another tab, run Kaspilo: npm run mobile      then press  a
  4. Real Android phone, no cable: npm run build:android
     It gives a link + QR code. Open it on the phone and install the APK.

If something fails: run `adb devices` (should list the emulator or phone).
GUIDE
