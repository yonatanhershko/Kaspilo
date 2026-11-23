// App entry. Runs before any library loads, so dev-only warnings can be hidden in time.
const { LogBox } = require('react-native');

// NativeWind (react-native-css-interop) touches RN's old ImageBackground export when it loads.
// We do not use ImageBackground; the warning is dev-only noise.
LogBox.ignoreLogs(['ImageBackground is deprecated']);

require('expo-router/entry');
