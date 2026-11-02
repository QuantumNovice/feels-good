package com.brightideas.spotlane

import java.net.URI
import java.net.URLEncoder

/** Public source normalization is independent of Android and covered by JVM tests. */
object SourceUrl {
    @JvmStatic
    @JvmOverloads
    fun normalize(input: String, repositoryPath: String = "places.json"): String {
        val uri = URI(input.trim())
        require(uri.scheme == "https" && uri.host != null && uri.userInfo == null) { "https_required" }
        val host = uri.host.lowercase()
        if (host != "github.com" && host != "www.github.com") return uri.toString().substringBefore('#')
        val parts = uri.path.split('/').filter(String::isNotEmpty)
        if (parts.size == 2) {
            val path = repositoryPath.trim().split('/')
            require(path.all { it.isNotEmpty() && it != "." && it != ".." }) { "invalid_repository_path" }
            val encoded = path.joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
            return "https://api.github.com/repos/${parts[0]}/${parts[1]}/contents/$encoded"
        }
        require(parts.size >= 5 && parts[2] in setOf("blob", "raw")) { "github_file_required" }
        return "https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.drop(3).joinToString("/")}"
    }
}
