package expo.modules.dirarycapture

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The JavaScript side of capture mode: check access, open the settings page, read and clear captures. */
class DiraryCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DiraryCapture")

    // True once the user has turned on Notification access for this app.
    Function("isEnabled") {
      // Android lists the enabled listener services as "package/class" entries separated by colons.
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      enabled.split(":").any { it.substringBefore("/") == context.packageName }
    }

    // Opens Android's Notification access page, where the user turns it on.
    Function("openSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("getKeywords") {
      CaptureStore.keywords(context).toList().sorted()
    }

    Function("setKeywords") { keywords: List<String> ->
      CaptureStore.setKeywords(context, keywords)
    }

    Function("getCaptures") { afterId: Double, limit: Int ->
      CaptureStore.get(context).after(afterId.toLong(), limit.coerceIn(1, 500))
    }

    Function("count") {
      CaptureStore.get(context).count()
    }

    Function("clear") {
      CaptureStore.get(context).clear()
    }
  }
}
