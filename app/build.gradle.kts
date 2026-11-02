plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.brightideas.spotlane"
    compileSdk = 36
    defaultConfig { applicationId = "com.brightideas.spotlane"; minSdk = 29; targetSdk = 35; versionCode = 2; versionName = "0.2.0" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
dependencies {
    implementation("ai.pleos.playground:NaviHelper:3.0.5")
    implementation("ai.pleos.playground:Vehicle:2.3.2")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

val kotlinFormatter by configurations.creating
dependencies { kotlinFormatter("com.facebook:ktfmt:0.64") }

val kotlinSources = fileTree("src") { include("**/*.kt") }
tasks.register<JavaExec>("formatKotlin") {
    group = "formatting"
    description = "Format Kotlin sources using the official four-space style."
    classpath = kotlinFormatter
    mainClass.set("com.facebook.ktfmt.cli.Main")
    args("--kotlinlang-style", "--enable-editorconfig")
    args(kotlinSources.files.sortedBy { it.path }.map { it.absolutePath })
}
tasks.register<JavaExec>("checkKotlinFormat") {
    group = "verification"
    description = "Check Kotlin formatting without changing files."
    classpath = kotlinFormatter
    mainClass.set("com.facebook.ktfmt.cli.Main")
    args("--kotlinlang-style", "--enable-editorconfig", "--dry-run", "--set-exit-if-changed")
    args(kotlinSources.files.sortedBy { it.path }.map { it.absolutePath })
}
