package expo.modules.kaspilopurchase

import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of purchase detection on Android (docs/spec.md "Purchase detected").
 * Stores what the notification listener needs (switch, access end, currency, texts), since
 * it runs without the app's JavaScript, and opens the phone's notification-access settings.
 */
class KaspiloPurchaseModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("KaspiloPurchase")

    Function("setState") { json: String ->
      PurchaseReminder.prefs(context).edit().putString(PurchaseReminder.STATE_KEY, json).apply()
    }

    /** When a Wallet payment was last caught (ms since 1970), or null if never. */
    Function("lastDetectedAt") {
      val value = PurchaseReminder.prefs(context).getLong(PurchaseReminder.LAST_KEY, 0L)
      if (value > 0) value.toDouble() else null
    }

    /** True when the user switched Kaspilo on under "Notification access". */
    Function("isListenerEnabled") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    Function("openListenerSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
