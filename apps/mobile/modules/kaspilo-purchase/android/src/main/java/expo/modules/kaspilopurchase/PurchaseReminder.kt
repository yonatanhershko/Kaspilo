package expo.modules.kaspilopurchase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Turns a Google Wallet payment notification into Kaspilo's reminder (docs/spec.md
 * "Purchase detected"). Same rules as the iPhone App Intent:
 *  - amount + merchant in the user's currency -> "₪ 45 at Shufersal. Add it?"
 *  - another currency -> merchant only, amount left empty (no conversion)
 *  - amount or merchant unreadable -> a generic reminder
 * A Wallet notification with no amount in it (card added, pass, offer) is not a purchase,
 * and a refund is not either: no reminder.
 */
object PurchaseReminder {
  const val STATE_KEY = "state"
  const val LAST_KEY = "lastDetectedAt"
  private const val PREFS = "kaspilo.purchase"
  private const val CHANNEL_ID = "kaspilo_purchase"

  /** Google Wallet (tap to pay). */
  val WALLET_PACKAGES = setOf("com.google.android.apps.walletnfcrel")

  fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  data class Amount(val minor: Long, val currency: String?, val refund: Boolean)

  fun onWalletNotification(context: Context, title: String?, text: String?) {
    val inTitle = title?.let { findAmount(it) }
    val inText = text?.let { findAmount(it) }
    val amount = inText ?: inTitle ?: return
    prefs(context).edit().putLong(LAST_KEY, System.currentTimeMillis()).apply()
    if (amount.refund) return

    // Usually the title is the merchant and the text holds the amount ("₪45.90 with Visa").
    val merchant = if (inText != null && inTitle == null) title?.let { cleanMerchant(it) }?.takeIf { it.isNotEmpty() } else null
    post(context, amount, merchant)
  }

  private fun post(context: Context, amount: Amount, merchant: String?) {
    val state = runCatching { JSONObject(prefs(context).getString(STATE_KEY, null) ?: return) }.getOrNull() ?: return
    if (!state.optBoolean("enabled", false)) return
    // Access ended since the last open: the app is locked, so no reminder.
    if (!state.isNull("accessUntil") && state.optDouble("accessUntil", 0.0) <= System.currentTimeMillis()) return
    val currency = state.optString("currency", "ILS")
    val scheme = state.optString("scheme", "").ifEmpty { return }
    val texts = state.optJSONObject("texts") ?: return
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return

    val link = Uri.Builder().scheme(scheme).authority("add")
      .appendQueryParameter("type", "expense")
      .appendQueryParameter("purchase", "1")
    val title: String
    val body: String
    if (merchant != null && amount.currency == currency) {
      title = texts.optString("title")
      body = fill(texts.optString("withAmount"), display(amount.minor, currency), merchant)
      link.appendQueryParameter("amountMinor", amount.minor.toString())
        .appendQueryParameter("currency", currency)
        .appendQueryParameter("merchant", merchant)
    } else if (merchant != null) {
      title = texts.optString("title")
      body = fill(texts.optString("merchantOnly"), "", merchant)
      link.appendQueryParameter("merchant", merchant)
    } else {
      title = texts.optString("genericTitle")
      body = texts.optString("genericBody")
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val system = context.getSystemService(NotificationManager::class.java)
      val name = texts.optString("channel").ifEmpty { "Purchases" }
      system?.createNotificationChannel(NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_DEFAULT))
    }
    val open = Intent(Intent.ACTION_VIEW, link.build()).setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
    val pending = PendingIntent.getActivity(
      context, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    try {
      manager.notify(id, notification)
    } catch (_: SecurityException) {
      // Notifications not allowed: nothing to show.
    }
  }

  // ---- amount ------------------------------------------------------------------

  private const val SIGNS = "₪|\\$|€|£|ILS|NIS|USD|EUR|GBP|ש\"ח|ש״ח"
  private val AMOUNT = Regex(
    // A minus only counts when it touches the amount ("-₪20"), not a dash in the sentence.
    "(?:[-−]?(?:$SIGNS)\\s?[-−]?\\d[\\d.,]*)|(?:[-−]?\\d[\\d.,]*\\s?(?:$SIGNS))",
    RegexOption.IGNORE_CASE,
  )
  private val MARKS = Regex("[‎‏‪-‮  ]")

  /** The first amount with a currency sign in a sentence (card digits have none). */
  fun findAmount(sentence: String): Amount? {
    val clean = MARKS.replace(sentence, " ")
    val match = AMOUNT.find(clean) ?: return null
    // Letters stuck to the sign belong to it: "CA$12" is not US dollars.
    var start = match.range.first
    while (start > 0 && match.range.first - start < 3 && clean[start - 1].isLetter()) start--
    val amount = parseAmount(match.value) ?: return null
    return amount.copy(currency = currency(clean.substring(start, match.range.last + 1)))
  }

  /** "₪45.90", "45,90 ₪", "$1,234.56" -> minor units, without floating point. */
  fun parseAmount(text: String): Amount? {
    val s = MARKS.replace(text, "")
    val refund = s.contains('-') || s.contains('−')
    // A full stop that ends the sentence is not a decimal point.
    val kept = s.filter { it in '0'..'9' || it == ',' || it == '.' }.trimEnd(',', '.')
    if (kept.none { it in '0'..'9' }) return null
    var whole = kept
    var fraction = ""
    val last = kept.indexOfLast { it == ',' || it == '.' }
    if (last >= 0) {
      val after = kept.substring(last + 1)
      when (after.length) {
        1, 2 -> { whole = kept.substring(0, last); fraction = after }
        3 -> {}
        else -> return null
      }
    }
    whole = whole.filter { it in '0'..'9' }.ifEmpty { "0" }
    if (whole.length > 9 || fraction.any { it !in '0'..'9' }) return null
    fraction = fraction.padEnd(2, '0')
    val minor = whole.toLong() * 100 + fraction.toLong()
    if (minor <= 0) return null
    return Amount(minor, currency(s), refund)
  }

  fun currency(text: String): String? {
    val upper = text.uppercase()
    return when {
      "₪" in upper || "ILS" in upper || "NIS" in upper || "ש\"ח" in text || "ש״ח" in text -> "ILS"
      "€" in upper || "EUR" in upper -> "EUR"
      "£" in upper || "GBP" in upper -> "GBP"
      "USD" in upper -> "USD"
      "$" in upper -> {
        val index = upper.indexOf('$')
        if (index > 0 && upper[index - 1].isLetter()) "OTHER" else "USD"
      }
      else -> null
    }
  }

  /** Same as the app's formatMoney: "₪ 1,850" or "$ 12.50", kept left-to-right in Hebrew text. */
  fun display(minor: Long, currency: String): String {
    val symbol = if (currency == "USD") "$" else "₪"
    val digits = (minor / 100).toString()
    val grouped = StringBuilder()
    digits.forEachIndexed { index, char ->
      if (index > 0 && (digits.length - index) % 3 == 0) grouped.append(',')
      grouped.append(char)
    }
    val cents = minor % 100
    val amount = if (cents == 0L) grouped.toString() else "$grouped.${cents.toString().padStart(2, '0')}"
    return "‎$symbol $amount‎"
  }

  fun cleanMerchant(text: String): String =
    text.map { if (it.isISOControl()) ' ' else it }.joinToString("")
      .trim().split(Regex("\\s+")).joinToString(" ").take(100)

  private fun fill(template: String, amount: String, merchant: String): String =
    template.replace("{{amount}}", amount).replace("{{merchant}}", merchant)
}
