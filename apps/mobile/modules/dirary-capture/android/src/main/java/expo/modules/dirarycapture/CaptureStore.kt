package expo.modules.dirarycapture

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Where captured notifications are kept: a small database on the phone, separate from the app's own.
 * The listener service writes to it even when the app is closed; the app reads and clears it.
 * Nothing here is ever sent anywhere.
 */
class CaptureStore private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "dirary_capture.db", null, 1) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE captures (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, package_name TEXT NOT NULL, title TEXT NOT NULL, " +
        "body TEXT NOT NULL, posted_at INTEGER NOT NULL)"
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  /** Saves one notification, unless the same text from the same app was saved in the last minute. */
  @Synchronized
  fun insert(packageName: String, title: String, body: String, postedAt: Long) {
    val db = writableDatabase
    db.rawQuery(
      "SELECT 1 FROM captures WHERE package_name = ? AND title = ? AND body = ? AND posted_at > ? LIMIT 1",
      arrayOf(packageName, title, body, (postedAt - 60_000L).toString())
    ).use { if (it.moveToFirst()) return }
    val values = ContentValues().apply {
      put("package_name", packageName)
      put("title", title)
      put("body", body)
      put("posted_at", postedAt)
    }
    db.insert("captures", null, values)
    // Keep the newest 2000 so the file can't grow without limit.
    db.execSQL("DELETE FROM captures WHERE id <= (SELECT MAX(id) FROM captures) - 2000")
  }

  @Synchronized
  fun after(afterId: Long, limit: Int): List<Map<String, Any>> {
    val rows = mutableListOf<Map<String, Any>>()
    readableDatabase.rawQuery(
      "SELECT id, package_name, title, body, posted_at FROM captures WHERE id > ? ORDER BY id LIMIT ?",
      arrayOf(afterId.toString(), limit.toString())
    ).use { c ->
      while (c.moveToNext()) {
        rows.add(
          mapOf(
            "id" to c.getLong(0).toDouble(),
            "packageName" to c.getString(1),
            "title" to c.getString(2),
            "text" to c.getString(3),
            "postedAt" to c.getLong(4).toDouble()
          )
        )
      }
    }
    return rows
  }

  @Synchronized
  fun count(): Int {
    readableDatabase.rawQuery("SELECT COUNT(*) FROM captures", null).use { c ->
      return if (c.moveToFirst()) c.getInt(0) else 0
    }
  }

  @Synchronized
  fun clear() {
    writableDatabase.execSQL("DELETE FROM captures")
  }

  companion object {
    private const val PREFS = "dirary_capture"
    private const val KEY_KEYWORDS = "keywords"
    private val DEFAULT_KEYWORDS = setOf("gcash", "gotyme", "securitybank", "secbank", "sbol")

    @Volatile
    private var instance: CaptureStore? = null

    fun get(context: Context): CaptureStore =
      instance ?: synchronized(this) {
        instance ?: CaptureStore(context).also { instance = it }
      }

    /** Lower-case words; a notification is kept only if its app's package name contains one of them. */
    fun keywords(context: Context): Set<String> =
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getStringSet(KEY_KEYWORDS, null) ?: DEFAULT_KEYWORDS

    fun setKeywords(context: Context, keywords: List<String>) {
      val clean = keywords.map { it.trim().lowercase() }.filter { it.length >= 3 }.toSet()
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putStringSet(KEY_KEYWORDS, clean).apply()
    }

    fun matches(context: Context, packageName: String): Boolean {
      val name = packageName.lowercase()
      return keywords(context).any { name.contains(it) }
    }
  }
}
