package com.jeevanrakshak.driver

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PriorityAlertsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "JRPriorityAlerts"
  private fun manager(): NotificationManager = context.getSystemService(NotificationManager::class.java)
    ?: throw IllegalStateException("Android notification service unavailable")

  @ReactMethod fun status(promise: Promise) {
    try {
      PriorityAlerts.ensure(context)
      val manager = manager()
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val result = Arguments.createMap().apply {
        putBoolean("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled())
        putBoolean("policyAccess", manager.isNotificationPolicyAccessGranted)
        putInt("alarmVolume", audio.getStreamVolume(AudioManager.STREAM_ALARM))
        putInt("interruptionFilter", manager.currentInterruptionFilter)
        for ((key, id) in listOf("sos" to PriorityAlerts.SOS, "booking" to PriorityAlerts.BOOKING)) {
          val channel = if (Build.VERSION.SDK_INT >= 26) manager.getNotificationChannel(id) else null
          putBoolean(key + "Enabled", if (Build.VERSION.SDK_INT >= 26) channel != null && channel.importance > 0 && channel.sound != null else true)
          putBoolean(key + "Bypass", if (Build.VERSION.SDK_INT >= 26) channel?.canBypassDnd() == true else manager.isNotificationPolicyAccessGranted)
        }
      }
      promise.resolve(result)
    } catch (error: Exception) { promise.reject("ALERT_STATUS_UNAVAILABLE", error) }
  }

  @ReactMethod fun openSettings(kind: String, promise: Promise) {
    try {
      val intent = when {
        kind == "priority" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
        kind == "volume" -> Intent(Settings.ACTION_SOUND_SETTINGS)
        Build.VERSION.SDK_INT >= 26 && (kind == "sos" || kind == "booking") -> Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          putExtra(Settings.EXTRA_CHANNEL_ID, if (kind == "sos") PriorityAlerts.SOS else PriorityAlerts.BOOKING)
        }
        Build.VERSION.SDK_INT >= 26 -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply { putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName) }
        else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      }
      if (intent.resolveActivity(context.packageManager) == null) throw IllegalStateException("This phone does not expose the requested alert settings")
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("ALERT_SETTINGS_UNAVAILABLE", error) }
  }

  @ReactMethod fun test(kind: String, title: String, body: String, promise: Promise) {
    try {
      require(kind == "sos" || kind == "booking") { "Unknown alert type" }
      PriorityAlerts.ensure(context)
      if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) throw IllegalStateException("Allow notifications before testing an alert")
      val sos = kind == "sos"
      val manager = manager()
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, if (sos) PriorityAlerts.SOS else PriorityAlerts.BOOKING) else Notification.Builder(context)
      builder.setSmallIcon(R.drawable.notification_icon).setContentTitle(title).setContentText(body)
        .setCategory(Notification.CATEGORY_ALARM).setAutoCancel(true)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
      if (Build.VERSION.SDK_INT < 26) builder.setSound(PriorityAlerts.sound(context, sos), PriorityAlerts.attributes()).setPriority(Notification.PRIORITY_HIGH)
      val id = if (sos) 91001 else 91002
      manager.notify(id, builder.build())
      Handler(Looper.getMainLooper()).postDelayed({ manager.cancel(id) }, 10_000)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("ALERT_TEST_FAILED", error) }
  }
}
