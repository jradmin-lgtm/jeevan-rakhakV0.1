package com.jeevanrakshak.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings

object PriorityAlerts {
  const val SOS = "sos_alerts_v2"
  const val BOOKING = "booking_alerts_v2"
  fun attributes(): AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
  // Resource names stay stable when a later build changes numeric resource IDs.
  fun sound(context: Context, sos: Boolean): Uri = if (sos)
    Uri.parse("android.resource://${context.packageName}/raw/jr_sos_buzzer")
    else Settings.System.DEFAULT_RINGTONE_URI

  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
      ?: throw IllegalStateException("Android notification service unavailable")
    for (isSos in listOf(true, false)) {
      val channel = NotificationChannel(
        if (isSos) SOS else BOOKING,
        if (isSos) "SOS emergency requests" else "Ambulance booking requests",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = if (isSos) "Bundled SOS buzzer" else "Device ringtone for ambulance bookings"
        setSound(sound(context, isSos), attributes())
        enableVibration(true)
        vibrationPattern = if (isSos) longArrayOf(0, 400, 200, 400, 200, 400) else longArrayOf(0, 300, 200, 300)
        enableLights(true)
        lightColor = if (isSos) Color.RED else Color.WHITE
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        if (manager.isNotificationPolicyAccessGranted) setBypassDnd(true)
      }
      // Android preserves user-chosen sound, importance and interruption settings.
      manager.createNotificationChannel(channel)
    }
  }
}
