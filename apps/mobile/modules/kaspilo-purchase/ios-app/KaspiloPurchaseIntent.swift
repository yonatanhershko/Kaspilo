import AppIntents
import Foundation
import UserNotifications

// Copied into the app target by plugins/withPurchaseIntent.js (App Intents must live in the
// app itself, not in a pod). Rules: docs/spec.md "Purchase detected".

/// "Kaspilo purchase": the Shortcuts action the Apple Pay (Wallet "Transaction") automation
/// runs. Shows a reminder notification. Never adds anything, never opens the app, and the
/// amount and merchant stay on the phone.
@available(iOS 16.0, *)
struct KaspiloPurchaseIntent: AppIntent {
  static var title: LocalizedStringResource = "Kaspilo purchase"
  static var description = IntentDescription("Reminds you to add an Apple Pay purchase to Kaspilo.")
  static var openAppWhenRun: Bool = false
  static var isDiscoverable: Bool = true

  @Parameter(title: "Amount")
  var amount: String?

  @Parameter(title: "Merchant")
  var merchant: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Remind me to add \(\.$amount) at \(\.$merchant)")
  }

  func perform() async throws -> some IntentResult {
    if let request = KaspiloPurchaseReminder.request(amount: amount, merchant: merchant) {
      try? await UNUserNotificationCenter.current().add(request)
    }
    return .result()
  }
}

enum KaspiloPurchaseReminder {
  /// Written by the app (KaspiloPurchaseModule.setState) on every open.
  static let stateKey = "kaspilo.purchase.state"
  /// Read by the app's setup screen: the automation has run at least once.
  static let lastKey = "kaspilo.purchase.lastDetectedAt"

  struct Texts: Decodable {
    let title: String
    let withAmount: String
    let merchantOnly: String
    let genericTitle: String
    let genericBody: String
  }

  struct State: Decodable {
    /// Switch on, signed in and access active when the app last synced.
    let enabled: Bool
    /// Access end in ms since 1970, or nil when it never ends.
    let accessUntil: Double?
    let currency: String
    let texts: Texts
  }

  static func request(amount: String?, merchant: String?, now: Date = Date()) -> UNNotificationRequest? {
    let defaults = UserDefaults.standard
    let nowMs = now.timeIntervalSince1970 * 1000
    defaults.set(nowMs, forKey: lastKey)
    guard
      let raw = defaults.string(forKey: stateKey),
      let data = raw.data(using: .utf8),
      let state = try? JSONDecoder().decode(State.self, from: data),
      state.enabled
    else { return nil }
    // Access ended since the last open: the app is locked, so no reminder.
    if let until = state.accessUntil, until <= nowMs { return nil }

    let parsed = amount.flatMap(parseAmount)
    // A refund is not a purchase.
    if parsed?.refund == true { return nil }
    let name = merchant.map(cleanMerchant).flatMap { $0.isEmpty ? nil : $0 }

    let content = UNMutableNotificationContent()
    content.sound = .default
    var info: [String: Any] = ["kind": "purchase"]
    if let parsed, let name, parsed.currency == state.currency {
      content.title = state.texts.title
      content.body = fill(state.texts.withAmount, amount: display(parsed.minor, currency: parsed.currency), merchant: name)
      info["amountMinor"] = parsed.minor
      info["currency"] = parsed.currency
      info["merchant"] = name
    } else if parsed != nil, let name {
      // Another (or unknown) currency: no conversion, so the amount stays empty.
      content.title = state.texts.title
      content.body = fill(state.texts.merchantOnly, amount: "", merchant: name)
      info["merchant"] = name
    } else {
      content.title = state.texts.genericTitle
      content.body = state.texts.genericBody
    }
    content.userInfo = info
    return UNNotificationRequest(identifier: "kaspilo.purchase.\(UUID().uuidString)", content: content, trigger: nil)
  }

  // ---- amount ----------------------------------------------------------------

  struct Amount {
    let minor: Int
    let currency: String?
    let refund: Bool
  }

  /// "₪45.90", "45,90 ₪", "$1,234.56", "ILS 12" -> minor units, without floating point.
  static func parseAmount(_ text: String) -> Amount? {
    let marks: Set<Character> = ["\u{200E}", "\u{200F}", "\u{202A}", "\u{202B}", "\u{202C}", "\u{00A0}", "\u{202F}"]
    let s = String(text.filter { !marks.contains($0) })
    let refund = s.contains("-") || s.contains("\u{2212}")
    var kept = s.filter { ("0"..."9").contains($0) || $0 == "," || $0 == "." }
    while kept.last == "," || kept.last == "." { kept.removeLast() }
    guard kept.contains(where: { ("0"..."9").contains($0) }) else { return nil }

    var whole = kept
    var fraction = ""
    if let last = kept.lastIndex(where: { $0 == "," || $0 == "." }) {
      let after = String(kept[kept.index(after: last)...])
      if after.count == 1 || after.count == 2 {
        whole = String(kept[..<last])
        fraction = after
      } else if after.count != 3 {
        return nil
      }
    }
    whole = whole.filter { ("0"..."9").contains($0) }
    if whole.isEmpty { whole = "0" }
    guard whole.count <= 9, fraction.allSatisfy({ ("0"..."9").contains($0) }) else { return nil }
    while fraction.count < 2 { fraction += "0" }
    guard let w = Int(whole), let f = Int(fraction) else { return nil }
    let minor = w * 100 + f
    guard minor > 0 else { return nil }
    return Amount(minor: minor, currency: currency(in: s), refund: refund)
  }

  static func currency(in text: String) -> String? {
    let upper = text.uppercased()
    if upper.contains("₪") || upper.contains("ILS") || upper.contains("NIS") || text.contains("ש״ח") || text.contains("ש\"ח") {
      return "ILS"
    }
    if upper.contains("€") || upper.contains("EUR") { return "EUR" }
    if upper.contains("£") || upper.contains("GBP") { return "GBP" }
    if upper.contains("USD") { return "USD" }
    // "$" alone is US dollars; "CA$", "A$", "HK$"... are not.
    if let range = upper.range(of: "$") {
      if range.lowerBound == upper.startIndex { return "USD" }
      let before = upper[upper.index(before: range.lowerBound)]
      return before.isLetter ? "OTHER" : "USD"
    }
    if let match = upper.range(of: "[A-Z]{3}", options: .regularExpression) { return String(upper[match]) }
    return nil
  }

  /// Same as the app's formatMoney: "₪ 1,850" or "$ 12.50", kept left-to-right in Hebrew text.
  static func display(_ minor: Int, currency: String?) -> String {
    let symbol = currency == "USD" ? "$" : "₪"
    let digits = String(minor / 100)
    var grouped = ""
    for (index, char) in digits.enumerated() {
      if index > 0 && (digits.count - index) % 3 == 0 { grouped += "," }
      grouped.append(char)
    }
    let cents = minor % 100
    let amount = cents == 0 ? grouped : "\(grouped).\(cents < 10 ? "0" : "")\(cents)"
    return "\u{200E}\(symbol) \(amount)\u{200E}"
  }

  static func cleanMerchant(_ text: String) -> String {
    let noControls = text.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined()
    let collapsed = noControls.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    return String(collapsed.prefix(100))
  }

  static func fill(_ template: String, amount: String, merchant: String) -> String {
    template.replacingOccurrences(of: "{{amount}}", with: amount).replacingOccurrences(of: "{{merchant}}", with: merchant)
  }
}
