package com.jeevanrakshak.driver

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import android.graphics.Color
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // packages.add(MyReactNativePackage())
            return packages
          }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    setupNotificationChannels()
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  // CR2 (2026-08): priority-based audio alerts. Created natively (rather than
  // via expo-notifications' JS setNotificationChannelAsync, which can only
  // point a channel at "default" or a bundled custom sound file) so SOS rings
  // with the device's own ALARM tone and normal bookings ring with the
  // device's own NOTIFICATION tone — two sounds already on every phone, no
  // custom audio assets to ship. Channel IDs are brand new ("sos_alerts" /
  // "booking_alerts", distinct from the pre-existing "default" channel), so
  // there's no stale-channel problem on upgrade — Android only lets an app
  // set a channel's sound/importance the FIRST time that channel id is
  // created, but these ids have never existed before this version.
  private fun setupNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java) ?: return

    val alarmAttrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val sos = NotificationChannel(
      "sos_alerts", "SOS emergency requests", NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Loud alert for incoming SOS ambulance requests"
      setSound(Settings.System.DEFAULT_ALARM_ALERT_URI, alarmAttrs)
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
      enableLights(true)
      lightColor = Color.RED
    }

    val notifAttrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val booking = NotificationChannel(
      "booking_alerts", "Normal ambulance requests", NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Alert for incoming Book an Ambulance requests"
      setSound(Settings.System.DEFAULT_NOTIFICATION_URI, notifAttrs)
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250)
    }

    nm.createNotificationChannel(sos)
    nm.createNotificationChannel(booking)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
