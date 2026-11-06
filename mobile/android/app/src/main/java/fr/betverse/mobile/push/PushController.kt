package fr.betverse.mobile.push

import android.Manifest
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import fr.betverse.app.beta.R
import fr.betverse.mobile.BetVerseApplication
import fr.betverse.mobile.MainActivity
import kotlinx.coroutines.*
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PushController(private val application: Application) {
    private val preferences = application.getSharedPreferences("betverse_push", Application.MODE_PRIVATE)
    val owner: String? get() = preferences.getString("owner", null)
    fun consent(owner: String?) { preferences.edit().putString("owner",owner).apply() }
    suspend fun token(): String = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (continuation.isActive) {
                if (task.isSuccessful) continuation.resume(task.result)
                else continuation.resumeWithException(task.exception ?: IllegalStateException("Push indisponible"))
            }
        }
    }
    fun disconnect() {
        val wasEnabled = owner != null
        consent(null)
        NotificationManagerCompat.from(application).cancelAll()
        if(wasEnabled) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
            FirebaseMessaging.getInstance().deleteToken()
        }
    }
    fun channel() {
        if (Build.VERSION.SDK_INT >= 26) application.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel("betverse_activity","Activité BetVerse",NotificationManager.IMPORTANCE_DEFAULT))
    }
}

class BetVerseMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun onNewToken(token: String) {
        val app = application as BetVerseApplication
        val owner = app.push.owner ?: return
        scope.launch {
            runCatching {
                if (app.api.me().id == owner) app.api.mutate("/api/notifications/devices",JSONObject().put("token",token))
            }
        }
    }
    override fun onMessageReceived(message: RemoteMessage) {
        val app = application as BetVerseApplication
        if (app.push.owner == null) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        app.push.channel()
        val intent = PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this,"betverse_activity").setSmallIcon(R.drawable.ic_betverse)
            .setContentTitle("BetVerse").setContentText("Une nouvelle activité est disponible dans votre centre de notifications.")
            .setContentIntent(intent).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
        NotificationManagerCompat.from(this).notify(1,notification)
    }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
