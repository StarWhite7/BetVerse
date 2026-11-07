package fr.betverse.mobile.ui

import android.content.res.AssetManager
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.IOException
import org.json.JSONObject

internal object ClubBadgeArtwork {
    private val images = LruCache<String, ImageBitmap>(32)
    private var paths: Map<String, String>? = null

    @Synchronized
    fun image(assets: AssetManager, team: String): ImageBitmap? {
        val catalog = paths ?: readCatalog(assets).also { paths = it }
        val path = catalog[normalizedClub(team)] ?: return null
        images.get(path)?.let { return it }
        return try {
            assets.open(path).use { BitmapFactory.decodeStream(it) }?.asImageBitmap()?.also {
                images.put(path, it)
            }
        } catch (_: IOException) {
            null
        }
    }

    private fun readCatalog(assets: AssetManager): Map<String, String> {
        val catalog = JSONObject(assets.open("catalog.json").bufferedReader().use { it.readText() })
        return buildMap {
            for (path in catalog.keys()) {
                val names = catalog.getJSONArray(path)
                for (index in 0 until names.length()) {
                    put(normalizedClub(names.getString(index)), path)
                }
            }
        }
    }
}
