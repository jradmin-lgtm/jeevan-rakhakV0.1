package com.jeevanrakshak.driver

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** Audible requests belong to this process-owned service, not a React screen. */
class RequestAlertService : Service() {
  companion object {
    private const val PREFS = "jr_request_alerts"
    private const val NOTICE = 91003
    @Volatile private var instance: RequestAlertService? = null
    private val offerVersions = ConcurrentHashMap<String, Long>()
    private val nextVersion = AtomicLong()
    private val dismissExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    fun configure(context: Context, token: String, api: String) {
      require(api.startsWith("https://") || api.startsWith("http://127.0.0.1:") || api.startsWith("http://10.0.2.2:")) { "Invalid alert API URL" }
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getString("token", "") != token) { instance?.let { service -> service.handler.post { service.stopAll() } }; prefs.edit().clear().apply() }
      val expired=prefs.all.filter { it.key.startsWith("stopped:") && (it.value as? Long ?: 0)<System.currentTimeMillis() }.keys
      val cleanup=prefs.edit();expired.forEach { cleanup.remove(it) };cleanup.apply()
      prefs.edit().putString("token",token).putString("api",api).apply()
    }
    fun start(context: Context, id: String, sos: Boolean, verifiedOffer: Boolean = false) {
      require(id.matches(Regex("[0-9a-fA-F-]{36}"))) { "Invalid request ID" }
      val prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
      val signedIn = !prefs.getString("token", "").isNullOrEmpty()
      check(signedIn) { "Sign in before receiving continuous alerts" }
      if (!RequestAlertPolicy.mayStart(signedIn, prefs.getLong("stopped:$id", 0), System.currentTimeMillis(), verifiedOffer)) return
      if (verifiedOffer) prefs.edit().remove("stopped:$id").apply()
      offerVersions[id] = nextVersion.incrementAndGet()
      val intent=Intent(context,RequestAlertService::class.java).putExtra("bookingId",id).putExtra("sos",sos)
      if(Build.VERSION.SDK_INT>=26) context.startForegroundService(intent) else context.startService(intent)
    }
    fun matchesRecipient(context: Context, recipient: String?): Boolean {
      val token = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null)
      val owner = try {
        val encoded = token?.split('.')?.getOrNull(1)
        if (encoded == null) null else JSONObject(String(Base64.decode(encoded, Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8)).optString("sub").takeIf { it.isNotBlank() }
      } catch (error: Exception) { Log.e("JRAlerts", "Stored alert session is invalid", error); null }
      return RequestAlertPolicy.matchesRecipient(owner, recipient)
    }
    fun mayAlert(context: Context, id: String): Boolean {
      if (!id.matches(Regex("[0-9a-fA-F-]{36}"))) return false
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      return !prefs.getString("token", "").isNullOrEmpty() && prefs.getLong("stopped:$id", 0) <= System.currentTimeMillis()
    }
    fun verifyDismiss(context: Context, id: String) {
      val app = context.applicationContext
      val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val token = prefs.getString("token", null) ?: return
      val api = prefs.getString("api", null) ?: throw IllegalStateException("Alert API missing")
      val version = offerVersions[id]
      dismissExecutor.execute {
        var connection: HttpURLConnection? = null
        try {
          connection = URL("$api/api/v1/driver/incoming").openConnection() as HttpURLConnection
          connection!!.instanceFollowRedirects = false; connection!!.connectTimeout = 8000; connection!!.readTimeout = 8000
          connection!!.setRequestProperty("Authorization", "Bearer $token")
          val status = connection!!.responseCode
          val offered = if (status == 401 || status == 403) false else {
            check(status == 200) { "Dismiss validation HTTP $status" }
            val rows = JSONObject(connection!!.inputStream.bufferedReader().use { it.readText() }).getJSONArray("requests")
            (0 until rows.length()).any { rows.getJSONObject(it).getString("id") == id }
          }
          mainHandler.post {
            if (RequestAlertPolicy.shouldDismiss(token, prefs.getString("token", null), version, offerVersions[id], offered)) stop(app, id)
          }
        } catch (error: Exception) {
          Log.w("JRAlerts", "Dismiss validation unavailable; retaining recent request until normal validation expires", error)
        } finally { connection?.disconnect() }
      }
    }
    fun stop(context: Context, id: String) {
      offerVersions.remove(id)
      context.getSystemService(NotificationManager::class.java)?.cancel(id, 0)
      context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putLong("stopped:$id",System.currentTimeMillis()+86_400_000).apply()
      instance?.let { service -> service.handler.post { service.remove(id) } }
    }
    fun stopRequests() { instance?.let { service -> service.handler.post { service.stopAll() } } }
    fun clear(context: Context) {
      instance?.let { service -> service.handler.post { service.stopAll() } }
      offerVersions.clear()
      context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().clear().apply()
    }
  }
  private data class Offer(val sos:Boolean, var verifiedAt:Long)
  private val handler=Handler(Looper.getMainLooper())
  private val executor=Executors.newSingleThreadExecutor()
  private val offers=linkedMapOf<String,Offer>()
  private var player:MediaPlayer?=null
  private var playing:String?=null
  private var checking=false
  private var stopped=false
  private val poll=object:Runnable {
    override fun run() {
      if(stopped)return
      val now=System.currentTimeMillis()
      offers.filterValues { now-it.verifiedAt>300_000 }.keys.toList().forEach { offers.remove(it); offerVersions.remove(it) }
      playNext()
      if(!checking && offers.isNotEmpty()) verifyOffers()
      if(!stopped)handler.postDelayed(this,15_000)
    }
  }
  override fun onCreate() { super.onCreate();instance=this;PriorityAlerts.ensure(this) }
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
    val id=intent?.getStringExtra("bookingId")
    if(id.isNullOrEmpty()) { stopAll();return START_NOT_STICKY }
    val prefs=getSharedPreferences(PREFS,MODE_PRIVATE)
    if(prefs.getLong("stopped:$id",0)>System.currentTimeMillis()){ if(offers.isEmpty())stopAll();return START_NOT_STICKY }
    stopped=false
    val sos=intent.getBooleanExtra("sos",false)
    val wasEmpty=offers.isEmpty()
    offers[id]=offers[id] ?: Offer(sos,System.currentTimeMillis())
    showNotification(offers.values.any { it.sos })
    playNext()
    if(wasEmpty){handler.removeCallbacks(poll);handler.post(poll)}
    return START_NOT_STICKY
  }
  private fun showNotification(sos:Boolean) {
    val launch=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder=NotificationCompat.Builder(this,if(sos)PriorityAlerts.SOS else PriorityAlerts.BOOKING)
    val notification=builder.setSmallIcon(R.drawable.notification_icon).setContentTitle(if(sos)"SOS ambulance request" else "Ambulance booking request")
      .setContentText("Open the app to accept or reject").setContentIntent(launch).setOngoing(true).setCategory(Notification.CATEGORY_CALL)
      .setVisibility(Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true).setSilent(true).build()
    startForeground(NOTICE,notification)
  }
  private fun playNext() {
    val next=offers.entries.firstOrNull { it.value.sos } ?: offers.entries.firstOrNull()
    if(next==null){stopAll();return}
    if(playing==next.key && player!=null)return
    stopPlayer()
    try {
      val manager=getSystemService(NotificationManager::class.java)
      val channel=if(Build.VERSION.SDK_INT>=26)manager.getNotificationChannel(if(next.value.sos)PriorityAlerts.SOS else PriorityAlerts.BOOKING) else null
      if(!NotificationManagerCompat.from(this).areNotificationsEnabled() || (Build.VERSION.SDK_INT>=26 && (channel==null || channel.importance==0 || channel.sound==null))) {
        Log.w("JRAlerts","Request sound disabled by notification settings");return
      }
      val sound=channel?.sound ?: PriorityAlerts.sound(this,next.value.sos)
      val media=MediaPlayer();player=media;playing=next.key
      media.setAudioAttributes(PriorityAlerts.attributes());media.setDataSource(this,sound);media.isLooping=true
      media.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK)
      media.setOnErrorListener { _,what,extra -> Log.e("JRAlerts","Playback failed: $what/$extra");stopPlayer();true }
      media.setOnPreparedListener { ready -> if(player===ready && offers.containsKey(next.key))ready.start() }
      media.prepareAsync();showNotification(next.value.sos)
    } catch(error:Exception){Log.e("JRAlerts","Request audio unavailable",error);stopPlayer()}
  }
  private fun verifyOffers() {
    checking=true
    val checkedOffers = offers.keys.associateWith { offerVersions[it] }
    val checkedToken = getSharedPreferences(PREFS, MODE_PRIVATE).getString("token", null)
    executor.execute {
      var connection:HttpURLConnection?=null
      try {
        val prefs=getSharedPreferences(PREFS,MODE_PRIVATE)
        val token=prefs.getString("token",null) ?: throw IllegalStateException("Alert session missing")
        val api=prefs.getString("api",null) ?: throw IllegalStateException("Alert API missing")
        connection=URL("$api/api/v1/driver/incoming").openConnection() as HttpURLConnection
        connection!!.instanceFollowRedirects=false;connection!!.connectTimeout=8000;connection!!.readTimeout=8000
        connection!!.setRequestProperty("Authorization","Bearer $token")
        val status=connection!!.responseCode
        if(status==401 || status==403)handler.post { if (getSharedPreferences(PREFS, MODE_PRIVATE).getString("token", null) == checkedToken) stopAll() }
        else {
          check(status==200){"Request validation HTTP $status"}
          val json=JSONObject(connection!!.inputStream.bufferedReader().use{it.readText()})
          val rows=json.getJSONArray("requests");val pending=mutableSetOf<String>()
          for(i in 0 until rows.length())pending.add(rows.getJSONObject(i).getString("id"))
          handler.post {
            if(!stopped && getSharedPreferences(PREFS, MODE_PRIVATE).getString("token", null) == checkedToken){
              val unchanged = checkedOffers.filter { (id, version) -> offerVersions[id] == version }.keys
              unchanged.filter { !pending.contains(it) }.forEach { offers.remove(it); offerVersions.remove(it) }
              unchanged.filter { pending.contains(it) }.forEach { offers[it]?.verifiedAt=System.currentTimeMillis() }
              playNext()
            }
          }
        }
      }catch(error:Exception){Log.w("JRAlerts","Offer validation unavailable; retaining recent offer temporarily",error)}
      finally{connection?.disconnect();handler.post { checking=false }}
    }
  }
  private fun remove(id:String){offers.remove(id);if(playing==id)stopPlayer();playNext()}
  private fun stopPlayer(){player?.release();player=null;playing=null}
  private fun stopAll(){if(stopped)return;stopped=true;offers.keys.forEach { offerVersions.remove(it) };offers.clear();stopPlayer();handler.removeCallbacks(poll);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
  override fun onDestroy(){stopAll();executor.shutdownNow();if(instance===this)instance=null;super.onDestroy()}
  override fun onBind(intent:Intent?):IBinder?=null
}
