package com.jeevanrakshak.driver

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class RequestMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    val id = data["bookingId"]
    if ((data["type"] == "jr_offer" || data["type"] == "dismiss") &&
      !RequestAlertService.matchesRecipient(this, data["driverId"])) {
      Log.w("JRAlerts", "Ignored request push for another or missing driver session")
      return
    }
    if (data["type"] == "dismiss" && id != null) {
      RequestAlertService.verifyDismiss(this, id)
      return
    }
    if (data["type"] == "jr_offer" && id != null) {
      try { RequestAlertService.start(this, id, data["kind"] == "sos") }
      catch (error: Exception) {
        Log.e("JRAlerts", "Continuous alert could not start; posting one-shot request alert", error)
        if (RequestAlertService.mayAlert(this, id)) showRequestNotification(id, data)
      }
      return
    }
    super.onMessageReceived(message)
  }

  private fun showRequestNotification(id: String, data: Map<String, String>) {
    PriorityAlerts.ensure(this)
    val sos = data["kind"] == "sos"
    val launch = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra("bookingId", id)
    }
    val tap = PendingIntent.getActivity(this, id.hashCode(), launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = NotificationCompat.Builder(this, if (sos) PriorityAlerts.SOS else PriorityAlerts.BOOKING)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(data["title"] ?: if (sos) "SOS ambulance request" else "Ambulance booking request")
      .setContentText(data["body"] ?: "Open the app to accept or reject")
      .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).setTimeoutAfter(300_000)
      .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
    if (Build.VERSION.SDK_INT < 26) builder.setSound(PriorityAlerts.sound(this, sos), AudioManager.STREAM_ALARM).setVibrate(longArrayOf(0, 400, 200, 400))
    val manager = getSystemService(NotificationManager::class.java)
      ?: throw IllegalStateException("Android notification service unavailable")
    manager.notify(id, 0, builder.build())
  }
}
