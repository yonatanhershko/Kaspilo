package expo.modules.kaspilopurchase

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Sees the phone's notifications once the user allows "Notification access", and acts only
 * on Google Wallet's. Everything else is ignored and nothing is stored or sent anywhere.
 */
class PurchaseListenerService : NotificationListenerService() {
  /** Wallet may update the same notification; one reminder per notification. */
  private val seen = ArrayDeque<String>()

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName !in PurchaseReminder.WALLET_PACKAGES) return
    val notification = sbn.notification ?: return
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

    val key = sbn.key ?: return
    if (key in seen) return
    seen.addLast(key)
    if (seen.size > 50) seen.removeFirst()

    val extras = notification.extras
    val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
    val text = (extras?.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras?.getCharSequence(Notification.EXTRA_TEXT))?.toString()
    try {
      PurchaseReminder.onWalletNotification(applicationContext, title, text)
    } catch (_: Exception) {
      // Never crash the listener over one odd notification.
    }
  }
}
