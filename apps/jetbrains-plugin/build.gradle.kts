plugins {
    id("org.jetbrains.kotlin.jvm") version "2.0.20"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "ai.observaai"
version = "0.1.0"

kotlin { jvmToolchain(21) }

repositories {
    mavenCentral()
}

intellij {
    version.set("2024.1")     // IC-2024.1 — minimum supported platform version
    type.set("IC")
    downloadSources.set(false)
    updateSinceUntilBuild.set(false)
}

dependencies {
    // Bundled in plugin ZIP — avoids JVM classloader coupling with platform's own Gson
    implementation("com.google.code.gson:gson:2.10.1")
}

tasks {
    patchPluginXml {
        sinceBuild.set("241")                          // IntelliJ 2024.1+
        untilBuild.set(provider { null })              // no upper bound
    }

    // Skip heavy searchable-options indexing during dev builds
    buildSearchableOptions { enabled = false }

    withType<JavaCompile> {
        sourceCompatibility = "21"
        targetCompatibility = "21"
    }

    // Sign the plugin before publishing (env vars set by CI)
    signPlugin {
        certificateChain.set(System.getenv("JB_CERTIFICATE_CHAIN") ?: "")
        privateKey.set(System.getenv("JB_PRIVATE_KEY") ?: "")
        password.set(System.getenv("JB_PRIVATE_KEY_PASSWORD") ?: "")
    }

    // Publish to JetBrains Marketplace (env var set by CI)
    publishPlugin {
        token.set(System.getenv("JB_PUBLISH_TOKEN") ?: "")
        channels.set(listOf(System.getenv("JB_PUBLISH_CHANNEL") ?: "stable"))
    }
}
