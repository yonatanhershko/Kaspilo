import ExpoModulesCore

/// The app's side of purchase detection on iPhone (docs/spec.md "Purchase detected").
/// Stores what the "Kaspilo purchase" App Intent needs (switch, access end, currency, texts),
/// since the intent runs without the app's JavaScript.
public class KaspiloPurchaseModule: Module {
  static let stateKey = "kaspilo.purchase.state"
  static let lastKey = "kaspilo.purchase.lastDetectedAt"

  public func definition() -> ModuleDefinition {
    Name("KaspiloPurchase")

    Function("setState") { (json: String) in
      UserDefaults.standard.set(json, forKey: Self.stateKey)
    }

    /// When the automation last ran (ms since 1970), or nil if it never has.
    Function("lastDetectedAt") { () -> Double? in
      let value = UserDefaults.standard.double(forKey: Self.lastKey)
      return value > 0 ? value : nil
    }

    // Android only.
    Function("isListenerEnabled") { () -> Bool in false }
    Function("openListenerSettings") {}
  }
}
