package expo.modules.cardvision

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.util.Log
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import android.util.Size
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// Aperçu caméra analysé en direct (sans prendre de photo, donc sans éclair ni fichier) : chaque image disponible
// est analysée en entier : la carte y est repérée (pas de cadre à viser), son code et son texte sont lus, et l'empreinte visuelle
// de la carte est calculée. Résultat envoyé à JS par l'événement onFrame. Une image à la fois : si JS ou la lecture
// prennent du retard, les images intermédiaires sont simplement sautées.
@SuppressLint("ViewConstructor")
class CardScannerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onFrame by EventDispatcher()

  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE // TextureView : s'intègre mieux aux vues React Native
  }
  private val executor = Executors.newSingleThreadExecutor()
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var bound = false

  @Volatile private var lastCard: Bitmap? = null
  @Volatile private var lastRun = 0L

  var active = false
    set(value) {
      if (field == value) return
      field = value
      // Caméra branchée seulement quand la vue a sa taille (sinon l'aperçu reste noir) : voir onSizeChanged.
      if (!value) stop() else if (width > 0 && height > 0) start()
    }
  var torch = false
    set(value) {
      field = value
      camera?.cameraControl?.enableTorch(value)
    }
  // Écritures utilisées à tour de rôle, une par image (ex. latin, latin, japonais : les cartes japonaises sont lues
  // aussi sans changer de réglage).
  @Volatile var scripts: List<String> = listOf("latin")
  @Volatile var analyzing = true // aperçu seul quand faux (mode une carte avant d'appuyer)
  @Volatile var interval = 0L // délai minimum entre deux analyses (ms)
  private var frameIndex = 0

  private val relayout = Runnable {
    measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    layout(left, top, right, bottom)
  }

  init {
    // React Native ne remet pas en page les vues ajoutées par l'aperçu (sa surface d'affichage) : on le fait
    // nous-mêmes, sinon l'aperçu reste noir.
    previewView.setOnHierarchyChangeListener(object : OnHierarchyChangeListener {
      override fun onChildViewRemoved(parent: android.view.View?, child: android.view.View?) = Unit
      override fun onChildViewAdded(parent: android.view.View?, child: android.view.View?) {
        parent?.measure(MeasureSpec.makeMeasureSpec(max(measuredWidth, width), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(max(measuredHeight, height), MeasureSpec.EXACTLY))
        parent?.layout(0, 0, parent.measuredWidth, parent.measuredHeight)
      }
    })
    addView(previewView, ViewGroup.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun requestLayout() {
    super.requestLayout()
    @Suppress("SENSELESS_COMPARISON")
    if (relayout != null) post(relayout) // appelé aussi pendant la construction de la vue
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (active && w > 0 && h > 0 && (!bound || oldw == 0 || oldh == 0)) start()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val w = right - left
    val h = bottom - top
    previewView.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
    previewView.layout(0, 0, w, h)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChild(previewView, widthMeasureSpec, heightMeasureSpec)
    setMeasuredDimension(
      ViewGroup.resolveSize(previewView.measuredWidth, widthMeasureSpec),
      ViewGroup.resolveSize(previewView.measuredHeight, heightMeasureSpec)
    )
  }

  private var starting = false

  private fun start() {
    if (starting || bound) return
    starting = true
    val activity = appContext.currentActivity as? AppCompatActivity ?: run { starting = false; return }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        if (!active) { starting = false; return@addListener }
        val p = future.get()
        provider = p
        // Même format pour l'aperçu et l'analyse (16:9) : ce qui est analysé correspond à ce qui est affiché.
        val ratio = AspectRatioStrategy(androidx.camera.core.AspectRatio.RATIO_16_9, AspectRatioStrategy.FALLBACK_RULE_AUTO)
        val preview = Preview.Builder()
          .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(ratio).build())
          .build()
          .also { it.surfaceProvider = previewView.surfaceProvider }
        val analysis = ImageAnalysis.Builder()
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setAspectRatioStrategy(ratio)
              .setResolutionStrategy(ResolutionStrategy(Size(1920, 1080), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
              .build()
          )
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()
        analysis.setAnalyzer(executor) { analyze(it) }
        p.unbindAll()
        camera = p.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        camera?.cameraControl?.enableTorch(torch)
        bound = true
        starting = false
        // Une fois l'image arrivée, l'aperçu doit être remis en page (sinon il reste noir jusqu'au prochain
        // changement d'écran).
        previewView.previewStreamState.observe(activity) { state ->
          if (state == PreviewView.StreamState.STREAMING) {
            previewView.requestLayout()
            post(relayout)
            // … et la fenêtre redessinée (React Native ne propage pas toujours la demande de l'aperçu).
            post { rootView?.let { it.requestLayout(); it.invalidate() } }
          }
        }
      } catch (e: Exception) {
        starting = false
        Log.e(TAG, "Caméra indisponible", e)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun stop() {
    try {
      provider?.unbindAll()
    } catch (_: Exception) {
    }
    camera = null
    bound = false
    starting = false
  }

  fun release() {
    active = false
    stop()
    executor.shutdown()
  }

  private fun analyze(image: ImageProxy) {
    try {
      val now = SystemClock.elapsedRealtime()
      if (!active || !analyzing || now - lastRun < interval) return
      lastRun = now
      val upright = Images.rotate(image.toBitmap(), image.imageInfo.rotationDegrees)
      val visible = visiblePart(upright)
      val vw = visible.width
      val vh = visible.height
      val list = scripts.ifEmpty { listOf("latin") }
      val s = list[frameIndex++ % list.size]
      // Toute l'image est lue ; la carte y est repérée par son texte (bloc de lignes : nom, effet, code).
      // Pas de cadre à viser.
      val read = Ocr.read(visible, s)
      val box = Cards.fromText(read, vw, vh)
      var codeText = ""
      val cardText: String
      val fp: List<Double>
      if (box != null) {
        val exact = Bitmap.createBitmap(visible, box.left, box.top, box.width(), box.height())
        cardText = read.text
        // Code de la carte (petit, en bas) : relu agrandi s'il n'a pas été lu sur l'image entière.
        if (!CODE_HINT.containsMatchIn(read.text)) {
          val bottom = sub(visible, box.left.toDouble(), box.top + box.height() * 0.78, box.width().toDouble(), box.height() * 0.26)
          codeText = Ocr.text(Images.toWidth(bottom, max(bottom.width, 1200)), s)
        }
        fp = Fingerprint.of(exact)
        lastCard = exact
      } else {
        cardText = read.text
        fp = emptyList()
      }
      val where = box?.let { listOf(it.left.toDouble() / vw, it.top.toDouble() / vh, it.width().toDouble() / vw, it.height().toDouble() / vh) } ?: emptyList()
      val event = mapOf("codeText" to codeText, "cardText" to cardText, "fingerprint" to fp, "box" to where, "script" to s, "at" to now)
      post { onFrame(event) }
    } catch (e: Exception) {
      Log.w(TAG, "Image non analysée : ${e.message}")
    } finally {
      image.close()
    }
  }

  // Partie de l'image affichée à l'écran : l'aperçu remplit la vue en coupant les bords (FILL_CENTER), même format
  // d'image que l'analyse, donc même découpe au centre.
  private fun visiblePart(b: Bitmap): Bitmap {
    val viewW = width.toDouble()
    val viewH = height.toDouble()
    if (viewW <= 0 || viewH <= 0) return b
    val scale = max(viewW / b.width, viewH / b.height)
    val w = viewW / scale
    val h = viewH / scale
    return sub(b, (b.width - w) / 2, (b.height - h) / 2, w, h)
  }

  private fun sub(b: Bitmap, x: Double, y: Double, w: Double, h: Double): Bitmap {
    val left = x.roundToInt().coerceIn(0, b.width - 1)
    val top = y.roundToInt().coerceIn(0, b.height - 1)
    val width = w.roundToInt().coerceIn(1, b.width - left)
    val height = h.roundToInt().coerceIn(1, b.height - top)
    return Bitmap.createBitmap(b, left, top, width, height)
  }

  // Photo de la dernière carte analysée (ajout à la main avec photo).
  fun capture(promise: Promise) {
    val card = lastCard ?: return promise.resolve(null)
    executor.execute {
      try {
        val file = File(context.cacheDir, "card-${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { card.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        promise.resolve("file://${file.absolutePath}")
      } catch (e: Exception) {
        promise.resolve(null)
      }
    }
  }

  companion object {
    const val TAG = "CardScanner"
    // Ressemble à un code de carte (OP09-004, 004/084, SOR-010…) : pas besoin de relire le bas agrandi.
    private val CODE_HINT = Regex("[A-Z0-9]{2,5}\\s?-\\s?[A-Z]{0,2}[0-9]{2,3}|[0-9]{1,3}\\s?/\\s?[0-9]{2,3}")
  }
}
