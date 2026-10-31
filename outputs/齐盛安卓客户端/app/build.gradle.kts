import java.util.Properties

plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

val webAssets = providers.gradleProperty("qisheng.webAssets").orNull
val generatedAssets = providers.gradleProperty("qisheng.generatedAssets").orNull
val bundleDigest = providers.gradleProperty("qisheng.bundleDigest").orElse("")

android {
    namespace = "com.liuframe.qishengonline"
    compileSdk = 35
    buildToolsVersion = "35.0.1"
    defaultConfig {
        applicationId = "com.liuframe.qishengonline"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "BUNDLE_MANIFEST_SHA256", "\"${bundleDigest.get()}\"")
        buildConfigField("String", "PRODUCT_ID", "\"qisheng-online-android\"")
        buildConfigField("boolean", "INTERNAL_ONLY", "true")
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    sourceSets.getByName("main") {
        assets.srcDirs(listOfNotNull(webAssets, generatedAssets))
        assets.exclude("index.html", "account/index.html", "credits/index.html", "copyright/index.html", "release-manifest.json", "licenses/dependencies.json", "_headers", "**/*.gz", "android/runtime/.vite/**")
    }
    // Keep seekable media and already-compressed formats directly addressable.
    // Raw geometry/wasm/binary fallback files may still use APK compression.
    androidResources { noCompress += listOf("qsgz", "webp", "png", "jpg", "jpeg", "mp3", "ogg", "m4a", "wav", "mp4", "ktx2") }
    lint { abortOnError = true }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.14.0")
    testImplementation("junit:junit:4.13.2")
}
dependencyLocking { lockAllConfigurations() }
tasks.register("writeNativeDependencyReport") {
    doLast {
        val rows=configurations.getByName("releaseRuntimeClasspath").resolvedConfiguration.resolvedArtifacts
            .map { it.moduleVersion.id }.distinctBy { "${it.group}:${it.name}:${it.version}" }
            .sortedBy { "${it.group}:${it.name}" }
        val text=rows.joinToString(",", "[", "]") { row ->
            require(listOf(row.group,row.name,row.version).all { value -> Regex("[A-Za-z0-9_.+:-]+").matches(value) })
            "{\"group\":\"${row.group}\",\"name\":\"${row.name}\",\"version\":\"${row.version}\"}"
        }
        file(providers.gradleProperty("qisheng.dependencyReport").get()).apply { parentFile.mkdirs(); writeText(text) }
    }
}
