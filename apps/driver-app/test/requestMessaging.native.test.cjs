const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Run the real Kotlin push handler with injected Android/FCM edges. This does not
// verify device audibility, OS notification permission, or foreground scheduling.
test('data-only offers survive a foreground-service refusal as one-shot native alerts', () => {
  const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1');
  function jar(group, module, version) {
    const dir = path.join(cache, group, module, version);
    for (const hash of fs.readdirSync(dir)) {
      const found = fs.readdirSync(path.join(dir, hash)).find(f => f.endsWith('.jar'));
      if (found) return path.join(dir, hash, found);
    }
    throw Error(`Cached ${module} ${version} jar missing`);
  }
  const stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', '1.9.24');
  const compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '1.9.24'), stdlib,
    jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '1.9.24'),
    jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
    jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
    jar('org.jetbrains', 'annotations', '13.0')].join(path.delimiter);
  const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const java = path.join(javaHome, 'bin/java');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-alert-native-test-'));
  const sources = {
    'Context.kt': `package android.content
open class Context { fun <T> getSystemService(type: Class<T>): T? = if(type == android.app.NotificationManager::class.java) android.app.NotificationManager as T else null }
class Intent(val context: Context, val target: Class<*>) { val extras=mutableMapOf<String,String>(); fun addFlags(value:Int)=this; fun putExtra(key:String,value:String):Intent { extras[key]=value; return this }; companion object { const val FLAG_ACTIVITY_SINGLE_TOP=1 } }`,
    'App.kt': `package android.app
class Notification { var channel=""; var title=""; var body=""; var sound=""; var alarm=false; var tap:PendingIntent?=null; companion object { const val CATEGORY_ALARM="alarm"; const val VISIBILITY_PRIVATE=0 } }
class PendingIntent(val intent:android.content.Intent) { companion object { const val FLAG_UPDATE_CURRENT=1; const val FLAG_IMMUTABLE=2; fun getActivity(context:android.content.Context,code:Int,intent:android.content.Intent,flags:Int)=PendingIntent(intent) } }
object NotificationManager { val posted=mutableListOf<Triple<String,Int,Notification>>(); fun notify(tag:String,id:Int,notice:Notification) { posted.add(Triple(tag,id,notice)) } }`,
    'Build.kt': `package android.os
object Build { object VERSION { var SDK_INT=33 } }`,
    'Audio.kt': `package android.media
object AudioManager { const val STREAM_ALARM=4 }`,
    'Log.kt': `package android.util
object Log { fun e(tag:String,text:String,error:Exception)=0; fun w(tag:String,text:String)=0 }`,
    'Compat.kt': `package androidx.core.app
class NotificationCompat { class Builder(context:android.content.Context,channel:String) { private val n=android.app.Notification().apply { this.channel=channel }; fun setSmallIcon(x:Int)=this; fun setContentTitle(x:String)=apply {n.title=x}; fun setContentText(x:String)=apply {n.body=x}; fun setContentIntent(x:android.app.PendingIntent)=apply {n.tap=x}; fun setAutoCancel(x:Boolean)=this; fun setOnlyAlertOnce(x:Boolean)=this; fun setTimeoutAfter(x:Long)=this; fun setCategory(x:String)=apply {n.alarm=x=="alarm"}; fun setVisibility(x:Int)=this; fun setPriority(x:Int)=this; fun setSound(x:String,stream:Int)=apply {check(stream==4);n.sound=x}; fun setVibrate(x:LongArray)=this; fun build()=n }; companion object { const val PRIORITY_HIGH=1 } }`,
    'Firebase.kt': `package com.google.firebase.messaging
class RemoteMessage(val data:Map<String,String>)`,
    'Expo.kt': `package expo.modules.notifications.service
open class ExpoFirebaseMessagingService:android.content.Context() { var delegated=0; open fun onMessageReceived(message:com.google.firebase.messaging.RemoteMessage) {delegated++} }`,
    'Driver.kt': `package com.jeevanrakshak.driver
class MainActivity
object R { object drawable { const val notification_icon=1 } }
object PriorityAlerts { const val SOS="sos_alerts_v2"; const val BOOKING="booking_alerts_v2"; fun ensure(context:android.content.Context){}; fun sound(context:android.content.Context,sos:Boolean)=if(sos)"buzzer" else "ringtone" }
object RequestAlertService { var fail=true; var eligible=true; var starts=0; val stopped=mutableListOf<String>(); fun start(context:android.content.Context,id:String,sos:Boolean){starts++;if(fail)throw IllegalStateException("injected foreground-service refusal")}; fun mayAlert(context:android.content.Context,id:String)=eligible; fun matchesRecipient(context:android.content.Context,recipient:String?)=RequestAlertPolicy.matchesRecipient("driver-one",recipient); fun stop(context:android.content.Context,id:String){stopped.add(id)}; fun verifyDismiss(context:android.content.Context,id:String){if(RequestAlertPolicy.shouldDismiss("session","session",1,1,false))stop(context,id)} }`,
    'Main.kt': `package com.jeevanrakshak.driver
fun main() {
 val service=RequestMessagingService(); val notifications=android.app.NotificationManager.posted
 fun offer(kind:String="sos",id:String="ride-1")=com.google.firebase.messaging.RemoteMessage(mapOf("type" to "jr_offer","driverId" to "driver-one","bookingId" to id,"kind" to kind,"title" to "Test title","body" to "Test body"))
 service.onMessageReceived(offer());check(notifications.size==1);val sos=notifications.last();check(sos.first=="ride-1"&&sos.second==0);check(sos.third.channel==PriorityAlerts.SOS);check(sos.third.title=="Test title"&&sos.third.body=="Test body");check(sos.third.alarm);check(sos.third.tap!!.intent.extras["bookingId"]=="ride-1");check(service.delegated==0)
 service.onMessageReceived(offer("booking","ride-2"));check(notifications.last().third.channel==PriorityAlerts.BOOKING)
 android.os.Build.VERSION.SDK_INT=25;service.onMessageReceived(offer());check(notifications.last().third.sound=="buzzer");service.onMessageReceived(offer("booking"));check(notifications.last().third.sound=="ringtone")
 RequestAlertService.eligible=false;val count=notifications.size;service.onMessageReceived(offer());check(notifications.size==count)
 RequestAlertService.eligible=true;RequestAlertService.fail=false;service.onMessageReceived(offer());check(notifications.size==count)
 service.onMessageReceived(com.google.firebase.messaging.RemoteMessage(mapOf("type" to "dismiss","driverId" to "driver-one","bookingId" to "ride-1")));check(RequestAlertService.stopped==listOf("ride-1"));check(service.delegated==0)
 service.onMessageReceived(com.google.firebase.messaging.RemoteMessage(mapOf("type" to "other")));check(service.delegated==1)
 check(!RequestAlertPolicy.mayStart(true,2000,1000,false));check(RequestAlertPolicy.mayStart(true,2000,1000,true));check(!RequestAlertPolicy.mayStart(false,2000,1000,true))
 val prior=service.delegated;service.onMessageReceived(com.google.firebase.messaging.RemoteMessage(mapOf("type" to "dismiss","driverId" to "another-driver","bookingId" to "ride-2")));check(RequestAlertService.stopped==listOf("ride-1"));check(service.delegated==prior)
 val before=notifications.size;RequestAlertService.fail=true;service.onMessageReceived(com.google.firebase.messaging.RemoteMessage(mapOf("type" to "jr_offer","driverId" to "another-driver","bookingId" to "ride-2")));check(notifications.size==before);check(!RequestAlertPolicy.matchesRecipient(null,"driver-one"));check(!RequestAlertPolicy.matchesRecipient("driver-one",null))
 check(!RequestAlertPolicy.shouldDismiss("A","A",2,2,true))
 check(!RequestAlertPolicy.shouldDismiss("A","A",2,3,false))
 check(!RequestAlertPolicy.shouldDismiss("A","B",2,2,false))
 check(RequestAlertPolicy.shouldDismiss("A","A",2,2,false))
 println("native push fallback: 15 scenarios passed")
}`
  };
  try {
    for (const [name, content] of Object.entries(sources)) fs.writeFileSync(path.join(dir, name), content);
    const real = path.resolve(__dirname, '../android/app/src/main/java/com/jeevanrakshak/driver/RequestMessagingService.kt');
    const policy = path.resolve(__dirname, '../android/app/src/main/java/com/jeevanrakshak/driver/RequestAlertPolicy.kt');
    const out = path.join(dir, 'classes');
    execFileSync(java, ['-cp', compiler, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-nowarn', '-no-stdlib', '-no-reflect', '-classpath', stdlib, '-d', out, ...Object.keys(sources).map(name => path.join(dir,name)), real, policy], { encoding:'utf8', timeout:90000 });
    const output = execFileSync(java, ['-cp', out + path.delimiter + stdlib, 'com.jeevanrakshak.driver.MainKt'], { encoding:'utf8', timeout:10000 });
    assert.match(output, /15 scenarios passed/);
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});
