import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val apiOrigin = providers.environmentVariable("BETVERSE_BETA_ORIGIN")
    .orElse("https://betverse-beta.onrender.com").get()
val uri = URI(apiOrigin)
require(uri.scheme == "https" && uri.host != null && uri.rawUserInfo == null &&
    uri.rawQuery == null && uri.rawFragment == null && uri.port == -1 &&
    uri.rawPath.isNullOrEmpty() && apiOrigin == "https://" + uri.host) {
    "BETVERSE_BETA_ORIGIN doit être une origine HTTPS exacte sans chemin, port ni identifiants."
}

android {
    namespace = "fr.betverse.app.beta"
    compileSdk = 36
    sourceSets.getByName("main").res.srcDir(rootProject.file("../../assets/competition-banners"))
    sourceSets.getByName("main").res.srcDir(rootProject.file("../../assets/sport-icons"))
    sourceSets.getByName("main").assets.srcDir(rootProject.file("../../public/club-badges"))
    defaultConfig {
        applicationId = "fr.betverse.app.beta"
        minSdk = 24
        targetSdk = 36
        versionCode = providers.environmentVariable("BETVERSE_ANDROID_VERSION_CODE").orElse("4").get().toInt()
        versionName = providers.environmentVariable("BETVERSE_ANDROID_VERSION_NAME").orElse("1.1.0-native-beta").get()
        buildConfigField("String", "API_ORIGIN", "\"" + apiOrigin + "\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        create("beta") {
            providers.environmentVariable("BETA_KEYSTORE_PATH").orNull?.let {
                storeFile = file(it)
                storePassword = System.getenv("BETA_KEYSTORE_PASSWORD")
                keyAlias = "betverse-beta"
                keyPassword = System.getenv("BETA_KEYSTORE_PASSWORD")
                storeType = "PKCS12"
            }
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("beta")
            isMinifyEnabled = true
            isShrinkResources = true
            isDebuggable = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isIncludeAndroidResources = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

gradle.taskGraph.whenReady {
    if (allTasks.any { it.name == "assembleRelease" || it.name == "bundleRelease" }) {
        require(!System.getenv("BETA_KEYSTORE_PATH").isNullOrBlank() &&
            !System.getenv("BETA_KEYSTORE_PASSWORD").isNullOrBlank()) {
            "Signature bêta requise. Voir docs/ANDROID_NATIVE.md."
        }
    }
}

dependencies {
    implementation("com.google.firebase:firebase-messaging:25.0.2")
    val composeBom = platform("androidx.compose:compose-bom:2025.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    testImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
