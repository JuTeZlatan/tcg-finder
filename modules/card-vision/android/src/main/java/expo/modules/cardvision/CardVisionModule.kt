package expo.modules.cardvision

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class CardVisionModule : Module() {
  // Lecture et empreintes hors du fil principal, une à la fois.
  private val worker = Executors.newSingleThreadExecutor()

  private fun run(promise: Promise, block: () -> Any?) {
    worker.execute {
      try {
        promise.resolve(block())
      } catch (e: Exception) {
        promise.reject(CodedException("CardVision: ${e.message}", e))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CardVision")

    AsyncFunction("recognize") { uri: String, script: String, promise: Promise ->
      run(promise) {
        val bitmap = Images.load(appContext.reactContext!!, uri) ?: throw IllegalArgumentException("image illisible")
        Ocr.text(bitmap, script)
      }
    }

    AsyncFunction("fingerprint") { uri: String, promise: Promise ->
      run(promise) {
        val bitmap = Images.load(appContext.reactContext!!, uri, 600) ?: throw IllegalArgumentException("image illisible")
        Fingerprint.of(bitmap)
      }
    }

    View(CardScannerView::class) {
      Events("onFrame")
      Prop("active") { view: CardScannerView, value: Boolean -> view.active = value }
      Prop("torch") { view: CardScannerView, value: Boolean -> view.torch = value }
      Prop("scripts") { view: CardScannerView, value: List<String> -> view.scripts = value }
      Prop("analyzing") { view: CardScannerView, value: Boolean -> view.analyzing = value }
      Prop("interval") { view: CardScannerView, value: Int -> view.interval = value.toLong() }
      AsyncFunction("capture") { view: CardScannerView, promise: Promise -> view.capture(promise) }
      OnViewDestroys { view: CardScannerView -> view.release() }
    }
  }
}
