package expo.modules.diraryfoodlens

import android.content.Context
import android.net.Uri
import com.google.mlkit.common.model.LocalModel
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeler
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.custom.CustomImageLabelerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Names the dish in a photo, on the phone. The model is Google's AIY food classifier (2,023 dishes,
 * Apache 2.0), run by ML Kit. The photo never leaves the phone.
 */
class DiraryFoodLensModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val labeler: ImageLabeler by lazy {
    val model = LocalModel.Builder().setAssetFilePath("dirary-food.tflite").build()
    ImageLabeling.getClient(CustomImageLabelerOptions.Builder(model).setConfidenceThreshold(0.02f).setMaxResultCount(6).build())
  }

  // English dish names by model output index; line 0 is "__background__" (not food).
  private val names: List<String> by lazy {
    context.assets.open("dirary-food-labels.txt").bufferedReader().use { it.readLines() }
  }

  override fun definition() = ModuleDefinition {
    Name("DiraryFoodLens")

    // A photo's file:// address → up to 6 guesses, best first: [{ name, confidence 0–1 }].
    AsyncFunction("guess") { uri: String, promise: Promise ->
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        return@AsyncFunction promise.reject("ERR_FOOD_PHOTO", "Couldn't open the photo.", e)
      }
      labeler.process(image)
        .addOnSuccessListener { labels ->
          promise.resolve(labels.filter { it.index > 0 }.map {
            mapOf("name" to (names.getOrNull(it.index) ?: it.text), "confidence" to it.confidence.toDouble())
          })
        }
        .addOnFailureListener { promise.reject("ERR_FOOD_LENS", it.message ?: "Couldn't read the photo.", it) }
    }
  }
}
