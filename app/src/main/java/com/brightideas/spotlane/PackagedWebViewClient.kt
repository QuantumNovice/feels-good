package com.brightideas.spotlane

import android.content.Intent
import android.content.res.AssetManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.IOException

/** Serves only packaged assets at the trusted bridge origin; blocks remote page navigation. */
internal class PackagedWebViewClient(private val assets: AssetManager) : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val uri = request.url
        if (uri.host != ASSET_HOST) return super.shouldInterceptRequest(view, request)
        val path = uri.path
        if (uri.scheme != "https" || path == null || !path.startsWith("/ui/") || path.contains("..")) {
            return WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(byteArrayOf()))
        }
        return try {
            WebResourceResponse(mimeType(path), "UTF-8", assets.open(path.removePrefix("/")))
        } catch (_: IOException) {
            WebResourceResponse("text/plain", "UTF-8", 404, "Not found", null, null)
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        // Source and venue links open outside the trusted bridge WebView.
        if (
            request.isForMainFrame &&
                request.hasGesture() &&
                request.url.scheme in listOf("https", "http") &&
                request.url.host != ASSET_HOST
        ) {
            runCatching { view.context.startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
        }
        return true
    }

    private fun mimeType(path: String): String =
        when (path.substringAfterLast('.')) {
            "json" -> "application/json"
            "js" -> "application/javascript"
            "css" -> "text/css"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            else -> "text/html"
        }

    companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$ASSET_HOST/ui/index.html"
    }
}
