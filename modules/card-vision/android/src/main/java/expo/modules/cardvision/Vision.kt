package expo.modules.cardvision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt

// Lecture du texte : un lecteur par écriture (japonais, chinois et coréen lisent aussi l'alphabet latin).
object Ocr {
  private val latin: TextRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
  private val japanese: TextRecognizer by lazy { TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build()) }
  private val chinese: TextRecognizer by lazy { TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build()) }
  private val korean: TextRecognizer by lazy { TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build()) }

  private fun client(script: String) = when (script) {
    "ja" -> japanese
    "zh" -> chinese
    "ko" -> korean
    else -> latin
  }

  // Bloquant : à appeler hors du fil principal.
  fun read(bitmap: Bitmap, script: String): Text = Tasks.await(client(script).process(InputImage.fromBitmap(bitmap, 0)))

  fun text(bitmap: Bitmap, script: String): String = read(bitmap, script).text
}

object Images {
  // Image d'un fichier, remise à l'endroit (EXIF) et réduite à ~maxSide pixels.
  fun load(context: Context, uri: String, maxSide: Int = 1600): Bitmap? {
    val parsed = Uri.parse(uri)
    val open = { context.contentResolver.openInputStream(if (parsed.scheme == null) Uri.fromFile(java.io.File(uri)) else parsed) }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open()?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val bitmap = open()?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
    val rotation = try {
      open()?.use { ExifInterface(it).rotationDegrees } ?: 0
    } catch (_: Exception) {
      0
    }
    return if (rotation == 0) bitmap else rotate(bitmap, rotation)
  }

  fun rotate(bitmap: Bitmap, degrees: Int): Bitmap =
    Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)

  // Agrandit (ou réduit) à la largeur voulue : un petit texte se lit mieux agrandi.
  fun toWidth(bitmap: Bitmap, width: Int): Bitmap =
    if (bitmap.width == width) bitmap else Bitmap.createScaledBitmap(bitmap, width, max(1, (bitmap.height * width.toFloat() / bitmap.width).roundToInt()), true)
}

// Empreinte visuelle : la carte réduite à une grille de 12 × 16 cases (luminosité + deux couleurs), chaque canal
// ramené à moyenne 0 / écart 1 pour ne pas dépendre de l'éclairage. Deux empreintes se comparent par corrélation
// (lib/imageMatch.js) : proche de 1 pour la même illustration, bien plus bas pour une autre.
object Fingerprint {
  const val W = 12
  const val H = 16
  private const val INSET = 0.05f // bords ignorés (bordure, fond autour de la carte, coins arrondis)

  fun of(bitmap: Bitmap): List<Double> {
    val ix = (bitmap.width * INSET).toInt()
    val iy = (bitmap.height * INSET).toInt()
    val inner = Bitmap.createBitmap(bitmap, ix, iy, max(1, bitmap.width - 2 * ix), max(1, bitmap.height - 2 * iy))
    // Réduction en deux temps : chaque case est une vraie moyenne (pas un pixel isolé).
    val small = Bitmap.createScaledBitmap(Bitmap.createScaledBitmap(inner, W * 4, H * 4, true), W, H, true)
    val px = IntArray(W * H)
    small.getPixels(px, 0, W, 0, 0, W, H)
    val y = DoubleArray(px.size)
    val cb = DoubleArray(px.size)
    val cr = DoubleArray(px.size)
    for (i in px.indices) {
      val r = (px[i] shr 16 and 0xFF).toDouble()
      val g = (px[i] shr 8 and 0xFF).toDouble()
      val b = (px[i] and 0xFF).toDouble()
      y[i] = 0.299 * r + 0.587 * g + 0.114 * b
      cb[i] = b - y[i]
      cr[i] = r - y[i]
    }
    return normalize(y) + normalize(cb) + normalize(cr)
  }

  private fun normalize(v: DoubleArray): List<Double> {
    val mean = v.average()
    val sd = sqrt(v.sumOf { (it - mean) * (it - mean) } / v.size).coerceAtLeast(4.0) // canal presque uni : pas d'amplification du bruit
    return v.map { ((it - mean) / sd * 1000).roundToInt() / 1000.0 }
  }
}

// Repérage de la carte dans l'image, sans cadre à viser.
object Cards {
  // Carte repérée par son texte : les lignes d'une carte (nom, effet, code) forment un bloc serré ; on garde le
  // groupe de lignes le plus fourni (lignes voisines), puis on l'agrandit à la forme d'une carte (63 × 88).
  fun fromText(read: Text, width: Int, height: Int): Rect? {
    val lines = read.textBlocks.flatMap { it.lines }.mapNotNull { it.boundingBox }.filter { it.width() > 0 && it.height() > 0 }
    if (lines.size < 3) return null
    // Groupe : lignes reliées de proche en proche (écart vertical < 3 hauteurs de ligne, chevauchement horizontal).
    val groups = mutableListOf<MutableList<Rect>>()
    for (line in lines.sortedBy { it.top }) {
      val g = groups.firstOrNull { grp ->
        grp.any { o ->
          val gap = max(line.top - o.bottom, o.top - line.bottom)
          gap < 3 * max(line.height(), o.height()) && line.left < o.right + o.width() && line.right > o.left - o.width()
        }
      }
      if (g != null) g.add(line) else groups.add(mutableListOf(line))
    }
    val best = groups.maxByOrNull { g -> g.sumOf { it.width() * it.height() } } ?: return null
    if (best.size < 3) return null
    val u = Rect(best[0])
    best.forEach { u.union(it) }
    // Le texte couvre ~90 % de la largeur et ~95 % de la hauteur d'une carte ; la forme est ramenée à 63 × 88.
    var w = u.width() / 0.9
    var h = u.height() / 0.95
    if (w / h > 63.0 / 88) h = w * 88 / 63 else w = h * 63 / 88
    if (w < width * 0.15) return null // texte trop petit / épars : pas une carte
    val cx = u.exactCenterX()
    val cy = u.exactCenterY()
    val r = Rect((cx - w / 2).toInt(), (cy - h / 2).toInt(), (cx + w / 2).toInt(), (cy + h / 2).toInt())
    return if (r.intersect(0, 0, width, height) && r.width() > 10 && r.height() > 10) r else null
  }


}
