import java.util.Properties

plugins {
    // AGP 9 compiles Kotlin itself; the Compose plugin's version picks the Kotlin version.
    id("com.android.application") version "9.1.1"
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10"
}

// Release key: Music Bridge's own (CN=bleelblep, since 0.4.3), from the git-ignored
// signing.properties (storeFile, storePassword, keyAlias, keyPassword). The send permission is a
// signature permission, so an update must use this same key or Android refuses to install it.
val signing = Properties().apply {
    val props = file("signing.properties")
    if (props.isFile) props.inputStream().use { load(it) }
}

android {
    namespace = "com.bleelblep.musicbridge"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bleelblep.musicbridge"
        // Android 10.
        minSdk = 29
        targetSdk = 36
        versionCode = 9
        versionName = "0.4.4"
    }

    // Release key: see `signing` at the top.
    if (signing.getProperty("storeFile") != null) {
        signingConfigs.create("release") {
            storeFile = file(signing.getProperty("storeFile"))
            storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            signingConfigs.findByName("release")?.let { signingConfig = it }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    sourceSets {
        named("main") { kotlin.directories += "src/main/kotlin" }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.compose.material3:material3:1.5.0-alpha18")
    implementation("androidx.compose.material:material-icons-core:1.7.8")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
}
