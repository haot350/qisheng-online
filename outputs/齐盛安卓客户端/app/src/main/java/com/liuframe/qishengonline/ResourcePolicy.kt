package com.liuframe.qishengonline

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object ResourcePolicy {
    const val ORIGIN = "https://game.tianhw.top"
    const val HOST = "game.tianhw.top"
    val htmlRoutes = mapOf("/" to "index.html", "/account/" to "account/index.html", "/credits/" to "credits/index.html", "/copyright/" to "copyright/index.html")

    fun canonicalPath(encodedPath: String): String? {
        if (!encodedPath.startsWith("/") || encodedPath.startsWith("//") || Regex("%2f|%5c|%00", RegexOption.IGNORE_CASE).containsMatchIn(encodedPath)) return null
        val path = try { URLDecoder.decode(encodedPath.replace("+", "%2B"), StandardCharsets.UTF_8.name()) } catch (_: IllegalArgumentException) { return null }
        if (path.contains('\\') || path.contains('\u0000') || path.contains("//") || path.split('/').any { it == "." || it == ".." }) return null
        return path
    }

    fun onlineOnly(path: String): Boolean = path == "/api" || path.startsWith("/api/") || path == "/realtime" || path.startsWith("/realtime/")
    fun mime(path: String): String = when (path.substringAfterLast('.').lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "wasm" -> "application/wasm"
        "glb" -> "model/gltf-binary"
        "gltf" -> "model/gltf+json"
        "webp" -> "image/webp"
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "svg" -> "image/svg+xml"
        "mp3" -> "audio/mpeg"
        "m4a" -> "audio/mp4"
        "ogg" -> "audio/ogg"
        "wav" -> "audio/wav"
        "mp4" -> "video/mp4"
        "woff2" -> "font/woff2"
        "txt", "md" -> "text/plain"
        else -> "application/octet-stream"
    }

    fun isText(mime: String) = mime.startsWith("text/") || mime == "application/json" || mime == "model/gltf+json" || mime == "image/svg+xml"
    fun exportFilename(input: String): String = input.substringAfterLast('/').substringAfterLast('\\').replace(Regex("[\\u0000-\\u001f<>:\"/\\\\|?*]"), "_").take(120).ifBlank { "齐盛导出" }
}

data class ByteRange(val start: Long, val end: Long, val partial: Boolean) {
    val length: Long get() = (end - start + 1).coerceAtLeast(0)
    companion object {
        fun parse(header: String?, size: Long): ByteRange {
            require(size >= 0)
            if (header == null) return ByteRange(0, size - 1, false)
            val match = Regex("^bytes=(\\d*)-(\\d*)$").matchEntire(header.trim()) ?: throw IllegalArgumentException("range")
            require(size > 0)
            val first = match.groupValues[1]; val last = match.groupValues[2]
            if (first.isEmpty()) {
                val suffix = last.toLongOrNull() ?: throw IllegalArgumentException("range")
                require(suffix > 0)
                return ByteRange((size - suffix).coerceAtLeast(0), size - 1, true)
            }
            val start = first.toLongOrNull() ?: throw IllegalArgumentException("range")
            val end = if (last.isEmpty()) size - 1 else (last.toLongOrNull() ?: throw IllegalArgumentException("range")).coerceAtMost(size - 1)
            require(start < size && end >= start)
            return ByteRange(start, end, true)
        }
    }
}
