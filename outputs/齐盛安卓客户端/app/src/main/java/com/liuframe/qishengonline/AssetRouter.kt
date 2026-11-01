package com.liuframe.qishengonline

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.security.MessageDigest

class AssetRouter(private val assets: AssetManager) {
    data class Entry(val path: String, val size: Long, val sha256: String)
    private val entries = mutableMapOf<String, Entry>()
    val bundle: JSONObject

    init {
        val raw = assets.open("android/asset-manifest.json").use { it.readBytes() }
        val actual = MessageDigest.getInstance("SHA-256").digest(raw).joinToString("") { "%02x".format(it) }
        check(BuildConfig.BUNDLE_MANIFEST_SHA256.length == 64 && actual == BuildConfig.BUNDLE_MANIFEST_SHA256) { "安装资源校验未通过，请重新安装测试包。" }
        bundle = JSONObject(String(raw, Charsets.UTF_8))
        check(bundle.getString("productId") == BuildConfig.PRODUCT_ID && bundle.getString("applicationId")==BuildConfig.APPLICATION_ID && bundle.getString("version")==BuildConfig.VERSION_NAME && bundle.getInt("versionCode")==BuildConfig.VERSION_CODE && bundle.getString("channel")==BuildConfig.RELEASE_CHANNEL && bundle.getBoolean("internalOnly")==BuildConfig.INTERNAL_ONLY)
        val rows = bundle.getJSONArray("files")
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i); val file = row.getString("path")
            check(ResourcePolicy.canonicalPath("/$file") == "/$file")
            val canonical = ResourcePolicy.canonicalPath(row.optString("url", "/$file"))
            check(canonical != null && !ResourcePolicy.onlineOnly(canonical) && !entries.containsKey(canonical))
            entries[canonical] = Entry(file, row.getLong("bytes"), row.getString("sha256"))
        }
        check(entries.containsKey("/index.html"))
        for ((url, file) in ResourcePolicy.htmlRoutes) entries["/$file"]?.let { entries[url] = it }
    }

    fun allowsDocument(uri: Uri): Boolean {
        if (uri.scheme != "https" || uri.host != ResourcePolicy.HOST || uri.port !in listOf(-1, 443) || uri.userInfo != null) return false
        val path = ResourcePolicy.canonicalPath(uri.encodedPath ?: "/") ?: return false
        if(!entries.containsKey(path))return false
        return path in ResourcePolicy.htmlRoutes.keys || path in ResourcePolicy.htmlRoutes.values.map { "/$it" }
    }

    fun respond(request: WebResourceRequest): WebResourceResponse? {
        val uri = request.url
        if (uri.scheme != "https" || uri.host != ResourcePolicy.HOST || uri.port !in listOf(-1, 443) || uri.userInfo != null) return error(403)
        val path = ResourcePolicy.canonicalPath(uri.encodedPath ?: "/") ?: return error(403)
        if (ResourcePolicy.onlineOnly(path)) return null
        if (request.method !in listOf("GET", "HEAD")) return error(405)
        val entry = entries[path] ?: return error(404)
        val range = try { ByteRange.parse(request.requestHeaders.entries.firstOrNull { it.key.equals("Range", true) }?.value, entry.size) } catch (_: IllegalArgumentException) {
            return WebResourceResponse("application/octet-stream", null, 416, "Range Not Satisfiable", mapOf("Content-Range" to "bytes */${entry.size}", "Content-Length" to "0", "Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0)))
        }
        val mime = ResourcePolicy.mime(entry.path)
        val headers = mutableMapOf("Content-Type" to mime, "Content-Length" to range.length.toString(), "Accept-Ranges" to "bytes", "X-Content-Type-Options" to "nosniff", "ETag" to "\"${entry.sha256}\"", "Cache-Control" to if (path.startsWith("/assets/")) "private, max-age=31536000, immutable" else "no-store")
        if (range.partial) headers["Content-Range"] = "bytes ${range.start}-${range.end}/${entry.size}"
        if (mime == "text/html") headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: wss://game.tianhw.top; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'"
        return try {
            val stream = if (request.method == "HEAD") ByteArrayInputStream(ByteArray(0)) else {
                val input = assets.open(entry.path, AssetManager.ACCESS_STREAMING)
                skipFully(input, range.start)
                LimitedStream(input, range.length)
            }
            WebResourceResponse(mime, if (ResourcePolicy.isText(mime)) "UTF-8" else null, if (range.partial) 206 else 200, if (range.partial) "Partial Content" else "OK", headers, stream)
        } catch (_: Exception) { error(404) }
    }

    private fun error(code: Int): WebResourceResponse = WebResourceResponse("text/plain", "UTF-8", code, when (code) { 403 -> "Forbidden"; 405 -> "Method Not Allowed"; else -> "Not Found" }, mapOf("Cache-Control" to "no-store", "Content-Length" to "0"), ByteArrayInputStream(ByteArray(0)))
    private fun skipFully(input: InputStream, bytes: Long) {
        var left = bytes
        try { while (left > 0) { val n = input.skip(left); if (n > 0) left -= n else { if (input.read() == -1) throw IllegalArgumentException("short resource"); left-- } } } catch (error: Exception) { input.close(); throw error }
    }
    private class LimitedStream(input: InputStream, private var remaining: Long) : FilterInputStream(input) {
        override fun read(): Int { if (remaining <= 0) return -1; val value = super.read(); if (value >= 0) remaining--; return value }
        override fun read(buffer: ByteArray, offset: Int, length: Int): Int { if (remaining <= 0) return -1; val count = `in`.read(buffer, offset, minOf(length.toLong(), remaining).toInt()); if (count > 0) remaining -= count; return count }
        override fun skip(count: Long): Long { val skipped = `in`.skip(minOf(count, remaining)); remaining -= skipped; return skipped }
        override fun available(): Int = minOf(`in`.available().toLong(), remaining).toInt()
    }
}
