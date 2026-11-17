package expo.modules.dirarycapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification posted on the phone, and keeps only those from the allow-listed
 * finance apps. Everything else, including one-time passwords from other apps, is ignored
 * without being read or stored.
 */
class DiraryNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    try {
      val posted = sbn ?: return
      val packageName = posted.packageName ?: return
      if (!CaptureStore.matches(this, packageName)) return

      val notification = posted.notification ?: return
      // Group summaries ("3 new notifications") repeat what the individual ones already said.
      if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

      val extras = notification.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
      if (title.isBlank() && body.isBlank()) return

      CaptureStore.get(this).insert(packageName, title, body, posted.postTime)
    } catch (_: Throwable) {
      // A listener must never crash: Android would stop delivering notifications to it.
    }
  }
}
