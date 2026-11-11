package expo.modules.cardvision

import android.graphics.Bitmap
import android.graphics.Rect
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

// Reconnaissance d'une carte par son image seule : recherche de l'empreinte filmée parmi toutes les cartes d'un jeu.
// Index publié par la collecte (pipeline/fingerprints.mjs › fpi/<jeu>/<langue>.bin) : une empreinte allégée de
// 288 octets signés par image — luminosité 12 × 16, et les deux couleurs réduites à 6 × 8 (moyenne de 2 × 2 cases).
// Ressemblance : corrélation de chaque canal, la luminosité comptant plus que les couleurs (comme lib/imageMatch.js).
object CardIndex {
  const val DIM = 192 + 48 + 48
  private val CHANNELS = arrayOf(0 until 192, 192 until 240, 240 until 288)
  private val WEIGHTS = floatArrayOf(1f, 0.6f, 0.6f)
  private const val SHORTLIST = 300 // images gardées par la recherche rapide, puis comparées à tous les cadrages

  private class Index(val data: ByteArray, val n: Int, val norms: FloatArray)
  private val indexes = ConcurrentHashMap<String, Index>()

  fun load(name: String, path: String): Int {
    val data = File(path).readBytes()
    val n = data.size / DIM
    val norms = FloatArray(n * 3)
    for (i in 0 until n) {
      for (c in 0 until 3) {
        var s = 0f
        for (k in CHANNELS[c]) {
          val v = data[i * DIM + k].toFloat()
          s += v * v
        }
        norms[i * 3 + c] = max(1e-3f, sqrt(s))
      }
    }
    indexes[name] = Index(data, n, norms)
    return n
  }

  fun unload(name: String) {
    indexes.remove(name)
  }

  fun hasAny() = indexes.isNotEmpty()

  // Empreinte complète (576 valeurs, Fingerprint.of) → empreinte allégée de l'index.
  fun reduce(fp: List<Double>): FloatArray {
    val out = FloatArray(DIM)
    for (i in 0 until 192) out[i] = fp[i].toFloat()
    for (c in 1..2) {
      for (y in 0 until 8) {
        for (x in 0 until 6) {
          fun at(yy: Int, xx: Int) = fp[c * 192 + yy * 12 + xx]
          out[192 + (c - 1) * 48 + y * 6 + x] = ((at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) / 4).toFloat()
        }
      }
    }
    return out
  }

  private fun queryNorms(q: FloatArray) = FloatArray(3) { c -> max(1e-3f, sqrt(CHANNELS[c].sumOf { (q[it] * q[it]).toDouble() }.toFloat())) }

  private fun similarity(idx: Index, i: Int, q: FloatArray, qn: FloatArray): Float {
    var total = 0f
    val base = i * DIM
    for (c in 0 until 3) {
      var dot = 0f
      for (k in CHANNELS[c]) dot += q[k] * idx.data[base + k]
      total += WEIGHTS[c] * dot / (qn[c] * idx.norms[i * 3 + c])
    }
    return total / 2.2f
  }

  data class Match(val index: String, val i: Int, val score: Float)

  // queries[0] : cadrage principal (recherche rapide dans tout l'index) ; les autres cadrages départagent ensuite
  // les SHORTLIST meilleures images (carte mal cadrée, décalée ou plus ou moins grande).
  fun search(queries: List<FloatArray>, topK: Int): List<Match> {
    if (queries.isEmpty() || indexes.isEmpty()) return emptyList()
    val norms = queries.map { queryNorms(it) }
    val shortlist = ArrayList<Match>()
    for ((name, idx) in indexes) {
      for (i in 0 until idx.n) shortlist.add(Match(name, i, similarity(idx, i, queries[0], norms[0])))
      shortlist.sortByDescending { it.score }
      if (shortlist.size > SHORTLIST) shortlist.subList(SHORTLIST, shortlist.size).clear()
    }
    return shortlist.map { m ->
      val idx = indexes[m.index]!!
      Match(m.index, m.i, queries.indices.maxOf { q -> similarity(idx, m.i, queries[q], norms[q]) })
    }.sortedByDescending { it.score }.take(topK)
  }

  // Cadrages à essayer : autour de la carte repérée par son texte, sinon au centre de l'image (forme d'une carte,
  // trois tailles) ; chaque fois trois zooms et quatre décalages.
  fun crops(width: Int, height: Int, box: Rect?): List<Rect> {
    val bases = if (box != null) listOf(box) else listOf(0.86, 0.74, 0.62).map { f ->
      var h = height * f
      var w = h * 63 / 88
      if (w > width * 0.95) {
        w = width * 0.95
        h = w * 88 / 63
      }
      Rect(((width - w) / 2).roundToInt(), ((height - h) / 2).roundToInt(), ((width + w) / 2).roundToInt(), ((height + h) / 2).roundToInt())
    }
    val out = ArrayList<Rect>()
    for (b in bases) {
      for (zoom in listOf(1.0, 0.93, 1.07)) {
        for ((dx, dy) in listOf(0 to 0, -1 to 0, 1 to 0, 0 to -1, 0 to 1)) {
          if (zoom != 1.0 && (dx != 0 || dy != 0)) continue // zooms : centrés seulement
          val w = b.width() * zoom
          val h = b.height() * zoom
          val cx = b.exactCenterX() + dx * b.width() * 0.04
          val cy = b.exactCenterY() + dy * b.height() * 0.04
          val r = Rect(max(0, (cx - w / 2).roundToInt()), max(0, (cy - h / 2).roundToInt()), min(width, (cx + w / 2).roundToInt()), min(height, (cy + h / 2).roundToInt()))
          if (r.width() > 20 && r.height() > 20) out.add(r)
        }
      }
    }
    return out
  }

  fun queriesOf(bitmap: Bitmap, box: Rect?): List<FloatArray> =
    crops(bitmap.width, bitmap.height, box).map { r -> reduce(Fingerprint.of(Bitmap.createBitmap(bitmap, r.left, r.top, r.width(), r.height()))) }
}
