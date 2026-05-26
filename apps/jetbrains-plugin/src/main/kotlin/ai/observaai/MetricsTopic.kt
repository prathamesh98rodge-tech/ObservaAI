package ai.observaai

import com.intellij.util.messages.Topic

fun interface MetricsListener {
    fun onMetricsUpdate(state: MetricsState)
}

val METRICS_TOPIC: Topic<MetricsListener> =
    Topic.create("ai.observaai.metrics", MetricsListener::class.java)
