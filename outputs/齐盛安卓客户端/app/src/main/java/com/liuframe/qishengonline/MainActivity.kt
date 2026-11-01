package com.liuframe.qishengonline

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class MainActivity : ComponentActivity() {
    private var web: WebView? = null
    private lateinit var router: AssetRouter
    private lateinit var vault: SessionVault
    private val io = Executors.newSingleThreadExecutor()
    private val updates = Executors.newSingleThreadExecutor()
    private val requestIds = LinkedHashSet<String>()
    private val exports = mutableMapOf<String, Export>()
    @Volatile private var pendingExport: Pair<Export, JavaScriptReplyProxy>? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var visible = false
    private var focusRequest: AudioFocusRequest? = null
    private var exitDialog: AlertDialog? = null
    @Volatile private var destroyed = false
    private var presentation=PresentationState(false,false,"auto")
    private var checkedUpdates=false
    @Volatile private var availableUpdate:NativeUpdate?=null
    private var updateOffered=false
    @Volatile private var documentGeneration=0
    private data class Export(val id: String, val file: File, val filename: String, val mime: String, val expected: Long, var written: Long = 0)

    private val selectFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }
    private val saveExport = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val pending = pendingExport ?: return@registerForActivityResult
        pendingExport = null
        val (export, reply) = pending
        val uri = if (result.resultCode == RESULT_OK) result.data?.data else null
        io.execute {
            try {
                if (uri != null) contentResolver.openOutputStream(uri, "wt")!!.use { output -> export.file.inputStream().use { it.copyTo(output) } }
                send(reply, JSONObject().put("id", export.id).put("ok", true).put("value", JSONObject().put("saved", uri != null)))
            } catch (_: Exception) { send(reply, JSONObject().put("id", export.id).put("ok", false).put("error", "文件未保存，请重试。")) }
            finally { export.file.delete() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        vault = SessionVault(this)
        try {
            if (!Build.SUPPORTED_64_BIT_ABIS.contains("arm64-v8a") && !BuildConfig.DEBUG) throw IllegalStateException("此测试包适用于64位安卓手机。")
            router = AssetRouter(assets)
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) throw IllegalStateException("请先更新手机的系统网页组件，再重新打开游戏。")
            createWebView()
        } catch (error: Exception) { val message=error.message.orEmpty();showFailure(if(message.startsWith("此测试包")||message.startsWith("请先更新")||message.startsWith("安装资源"))message else "游戏暂时无法启动，请重试或更新系统网页组件。") }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web == null) confirmExit() else notifyPage("back") }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        val view = WebView(this)
        web = view
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        view.setBackgroundColor(Color.rgb(232, 230, 223))
        view.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = false; allowContentAccess = true
            @Suppress("DEPRECATION") setAllowFileAccessFromFileURLs(false)
            @Suppress("DEPRECATION") setAllowUniversalAccessFromFileURLs(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false; setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            userAgentString += " QishengOnlineAndroid/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
        WebViewCompat.addWebMessageListener(view, "LiuFrameNative", setOf(ResourcePolicy.ORIGIN)) { source, message, origin, mainFrame, reply ->
            if (!mainFrame || origin.toString() != ResourcePolicy.ORIGIN || !router.allowsDocument(Uri.parse(source.url ?: ""))) return@addWebMessageListener
            if (message.type != WebMessageCompat.TYPE_STRING) return@addWebMessageListener
            val data = message.data ?: return@addWebMessageListener
            if (data.length > 130_000) return@addWebMessageListener
            receive(data, reply)
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = router.respond(request)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return !router.allowsDocument(request.url)
                if (router.allowsDocument(request.url)) return false
                openExternal(request.url)
                return true
            }
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) { handler.cancel() }
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                if (!router.allowsDocument(Uri.parse(url))) { view.stopLoading(); showFailure("此页面请在浏览器中打开。"); return }
                documentGeneration++
                synchronized(requestIds) { requestIds.clear() }
                if(!destroyed)io.execute { for(export in exports.values)export.file.delete();exports.clear();pendingExport?.first?.file?.delete();pendingExport=null }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showFailure("游戏页面未能打开，请重试。")
            }
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                web = null; view.destroy(); showFailure("画面已中断，请重新进入。联机可在进入后重试连接。")
                return true
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback) { callback.invoke(origin, false, false) }
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null); fileCallback = callback
                return try { selectFile.launch(params.createIntent()); true } catch (_: Exception) { fileCallback = null; callback.onReceiveValue(null); false }
            }
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message): Boolean = false
        }
        view.setDownloadListener { url, _, _, _, _ -> if (url.startsWith("https://")) openExternal(Uri.parse(url)) }
        val container=FrameLayout(this).apply { setBackgroundColor(Color.rgb(232, 230, 223)); addView(view,FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT)) }
        ViewCompat.setOnApplyWindowInsetsListener(container) { target, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            target.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            insets
        }
        setContentView(container)
        view.loadUrl(ResourcePolicy.ORIGIN + "/")
    }

    private fun receive(raw: String, reply: JavaScriptReplyProxy) {
        val request = try { JSONObject(raw) } catch (_: Exception) { return }
        val id = request.optString("id")
        if (!Regex("^[A-Za-z0-9_-]{1,80}$").matches(id)) return
        synchronized(requestIds) {
            if (!requestIds.add(id)) { send(reply, response(id, false, "请求已处理。")); return }
            while (requestIds.size > 256) requestIds.remove(requestIds.first())
        }
        val method = request.optString("method")
        val params = request.optJSONObject("params") ?: JSONObject()
        val generation=documentGeneration
        io.execute {
            if(destroyed)return@execute
            try {
                when (method) {
                    "init" -> {send(reply, response(id, JSONObject().put("productId", BuildConfig.PRODUCT_ID).put("applicationId",BuildConfig.APPLICATION_ID).put("version", BuildConfig.VERSION_NAME).put("versionCode",BuildConfig.VERSION_CODE).put("channel",BuildConfig.RELEASE_CHANNEL).put("internalOnly", BuildConfig.INTERNAL_ONLY).put("session", vault.read())));if(!checkedUpdates&&!destroyed){checkedUpdates=true;updates.execute { checkUpdates() }}}
                    "session.write" -> { vault.write(params.getString("token")); send(reply, response(id, JSONObject().put("saved", true))) }
                    "system.backUnhandled" -> { runOnUiThread { confirmExit() }; send(reply, response(id, JSONObject())) }
                    "system.presentation" -> {
                        val orientation = params.getString("orientation")
                        val next=PresentationState(params.getBoolean("inSession"),params.getBoolean("playing"),orientation)
                        runOnUiThread {
                            if(destroyed)return@runOnUiThread
                            presentation=next
                            requestedOrientation = if (orientation == "landscape") ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                            val controller = WindowInsetsControllerCompat(window, web ?: return@runOnUiThread)
                            if (orientation == "landscape") { controller.hide(WindowInsetsCompat.Type.systemBars()); controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
                            else controller.show(WindowInsetsCompat.Type.systemBars())
                            if(next.keepAwake(visible))window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            offerUpdate()
                        }
                        send(reply, response(id, JSONObject()))
                    }
                    "clipboard.write" -> {
                        val text=params.getString("text");require(text.length<=32_000)
                        runOnUiThread {
                            if(destroyed||!visible||generation!=documentGeneration){send(reply,response(id,false,"复制已取消。"));return@runOnUiThread}
                            try {getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("齐盛Online",text));send(reply,response(id,JSONObject()))}
                            catch(_:Exception){send(reply,response(id,false,"暂时无法复制，请保存文件。"))}
                        }
                    }
                    "export.begin" -> {
                        require(exports.size < 1 && pendingExport == null)
                        val size = params.getLong("bytes"); require(size in 1..(32L * 1024 * 1024))
                        val mime = params.getString("mime"); require(mime in listOf("image/jpeg", "image/png", "application/json", "text/plain"))
                        val exportId = java.util.UUID.randomUUID().toString()
                        val file = File(cacheDir, "export-$exportId.tmp"); check(file.createNewFile())
                        exports[exportId] = Export(exportId, file, ResourcePolicy.exportFilename(params.getString("filename")), mime, size)
                        send(reply, response(id, JSONObject().put("exportId", exportId)))
                    }
                    "export.chunk" -> {
                        val export = exports[params.getString("exportId")] ?: error("export")
                        val bytes = Base64.decode(params.getString("data"), Base64.NO_WRAP); require(bytes.size <= 64 * 1024 && export.written + bytes.size <= export.expected)
                        FileOutputStream(export.file, true).use { it.write(bytes) }; export.written += bytes.size
                        send(reply, response(id, JSONObject().put("bytes", export.written)))
                    }
                    "export.finish" -> {
                        val exportId=params.getString("exportId")
                        val export = exports[exportId] ?: error("export")
                        try {
                            require(export.written == export.expected && pendingExport == null && generation==documentGeneration)
                            val expectedHash = params.getString("sha256"); require(Regex("^[a-f0-9]{64}$").matches(expectedHash))
                            val actual = export.file.inputStream().use { input -> val digest = MessageDigest.getInstance("SHA-256"); val buffer = ByteArray(64 * 1024); while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) }; digest.digest().joinToString("") { "%02x".format(it) } }
                            require(actual == expectedHash)
                            exports.remove(exportId)
                            pendingExport = export.copy(id = id) to reply
                            runOnUiThread {
                                if(destroyed||generation!=documentGeneration||pendingExport?.first?.file!=export.file){export.file.delete();if(pendingExport?.first?.file==export.file)pendingExport=null;send(reply,response(id,false,"操作已取消。"));return@runOnUiThread}
                                try{saveExport.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = export.mime; putExtra(Intent.EXTRA_TITLE, export.filename) })}
                                catch(_:Exception){export.file.delete();pendingExport=null;send(reply,response(id,false,"文件未保存，请重试。"))}
                            }
                        } catch(error:Exception) {exports.remove(exportId);export.file.delete();throw error}
                    }
                    "export.cancel" -> { exports.remove(params.getString("exportId"))?.file?.delete(); send(reply, response(id, JSONObject())) }
                    else -> send(reply, response(id, false, "此操作暂不可用。"))
                }
            } catch (_: Exception) { send(reply, response(id, false, "操作未完成，请重试。")) }
        }
    }

    private fun response(id: String, value: JSONObject): JSONObject = JSONObject().put("id", id).put("ok", true).put("value", value)
    private fun response(id: String, ok: Boolean, error: String): JSONObject = JSONObject().put("id", id).put("ok", ok).put("error", error)
    private fun send(reply: JavaScriptReplyProxy, payload: JSONObject) { runOnUiThread { try { reply.postMessage(payload.toString()) } catch (_: Exception) { /* A navigation may have ended this local document. */ } } }
    private fun notifyPage(type: String) { web?.evaluateJavascript("window.__qishengNativeEvent ? (window.__qishengNativeEvent(" + JSONObject.quote(type) + "), true) : false") { handled -> if(type=="back"&&handled!="true"&&!destroyed)confirmExit() } }

    private fun openExternal(uri: Uri) {
        if (uri.scheme !in listOf("https", "http", "mailto")) return
        try { startActivity(Intent(if (uri.scheme == "mailto") Intent.ACTION_SENDTO else Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)) } catch (_: Exception) { }
    }
    private fun checkUpdates() {
        var connection:HttpsURLConnection?=null
        try {
            connection=URL(ResourcePolicy.ORIGIN+"/api/v1/native/updates").openConnection() as HttpsURLConnection
            connection.connectTimeout=3000;connection.readTimeout=3000;connection.instanceFollowRedirects=false;connection.useCaches=false
            connection.setRequestProperty("Accept","application/json")
            if(connection.responseCode!=200)return
            val text=connection.inputStream.use { input -> val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(4096);while(true){val n=input.read(buffer);if(n<0)break;if(output.size()+n>32*1024)throw IllegalArgumentException("manifest");output.write(buffer,0,n)};output.toString("UTF-8") }
            val row=JSONObject(text).optJSONObject("android")?:return
            if(!row.optBoolean("available"))return
            val notes=row.optJSONArray("notes")
            val value=NativeUpdate(row.optString("productId"),row.optString("applicationId"),row.optString("version"),row.optInt("versionCode"),row.optString("downloadUrl"),row.optLong("bytes"),row.optString("sha256"),if(notes==null)emptyList() else (0 until notes.length()).map { notes.getString(it) })
            if(!UpdatePolicy.accepted(value,BuildConfig.VERSION_CODE))return
            availableUpdate=value;runOnUiThread { offerUpdate() }
        } catch (_:Exception) { /* Offline or unpublished updates do not interrupt the game. */ }
        finally { connection?.disconnect() }
    }
    private fun offerUpdate() {
        val value=availableUpdate?:return
        if(destroyed||!presentation.mayOfferUpdate(visible)||updateOffered)return
        updateOffered=true
        AlertDialog.Builder(this).setTitle("发现新版本 ${value.version}")
            .setMessage((value.notes.take(3)+"下载约${(value.bytes/1048576.0).toInt()}MB。更新会保留本机存档和设置。").joinToString("\n"))
            .setNegativeButton("稍后",null).setPositiveButton("下载") { _,_->openExternal(Uri.parse(ResourcePolicy.ORIGIN+value.downloadUrl)) }.show()
    }
    private fun confirmExit() {
        if (exitDialog?.isShowing == true) return
        exitDialog = AlertDialog.Builder(this).setTitle("退出齐盛Online？").setMessage("本机存档和设置会保留。").setNegativeButton("留在游戏", null).setPositiveButton("退出") { _, _ -> finish() }.show()
    }
    private fun showFailure(message: String) {
        val old = web; web = null; old?.stopLoading(); old?.destroy()
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 100, 40, 40); setBackgroundColor(Color.rgb(232, 230, 223)) }
        layout.addView(TextView(this).apply { text = "齐盛Online"; textSize = 28f; setTextColor(Color.rgb(35, 42, 45)) })
        layout.addView(TextView(this).apply { text = message; textSize = 17f; setPadding(0, 28, 0, 28) })
        layout.addView(Button(this).apply { text = "重新进入"; setOnClickListener { recreate() } })
        layout.addView(Button(this).apply { text = "打开网页版"; setOnClickListener { openExternal(Uri.parse(ResourcePolicy.ORIGIN)) } })
        setContentView(layout)
    }
    override fun onResume() {
        super.onResume(); visible = true; web?.onResume(); web?.resumeTimers(); notifyPage("resume")
        offerUpdate()
        val audio = getSystemService(AudioManager::class.java)
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).setOnAudioFocusChangeListener { change -> if (change < 0) notifyPage("background") }.build()
        focusRequest = request; audio.requestAudioFocus(request)
    }
    override fun onPause() {
        visible = false; window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val pausing=web
        pausing?.evaluateJavascript("window.__qishengNativeEvent?.('background')") { if(!visible&&web===pausing){pausing.onPause();pausing.pauseTimers()} }
        focusRequest?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }; focusRequest = null
        super.onPause()
    }
    override fun onStop() {
        if(!visible){web?.onPause();web?.pauseTimers()}
        super.onStop()
    }
    override fun onDestroy() {
        destroyed=true
        fileCallback?.onReceiveValue(null); fileCallback = null
        web?.destroy(); web = null
        io.execute { for(export in exports.values)export.file.delete();exports.clear();pendingExport?.first?.file?.delete();pendingExport=null }
        io.shutdown()
        updates.shutdown()
        super.onDestroy()
    }
}
