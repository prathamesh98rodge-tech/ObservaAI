package ai.observaai

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

@Service(Service.Level.APP)
class GatewayPoller : Disposable {

    private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "observaai-poller").apply { isDaemon = true }
    }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    private val seenAlertKeys = mutableSetOf<String>()

    var currentState: MetricsState = MetricsState()
        private set

    init {
        executor.scheduleWithFixedDelay(::pollMetrics, 0L, 8L, TimeUnit.SECONDS)
        executor.scheduleWithFixedDelay(::pollBudgets, 5L, 30L, TimeUnit.SECONDS)
    }

    // ── polling ───────────────────────────────────────────────────────────────

    private fun pollMetrics() {
        val settings = ObservaAISettings.getInstance()
        if (!settings.state.enabled) return

        try {
            val url = settings.state.gatewayUrl.trimEnd('/') + "/analytics/live"
            val response = httpClient.send(buildRequest(url, settings), HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                val json = JsonParser.parseString(response.body()).asJsonObject
                val usage = parseProviderUsage(json.getAsJsonArray("usageByProvider"))
                currentState = currentState.copy(
                    gatewayOnline = true,
                    sessionTokens = json.getLong("sessionTokens"),
                    sessionCost = json.getDouble("sessionCost"),
                    avgLatencyMs = json.getDouble("avgLatencyMs"),
                    requestsInFlight = json.getInt("requestsInFlight"),
                    usageByProvider = usage,
                )
            } else {
                currentState = currentState.copy(gatewayOnline = false)
            }
        } catch (_: Exception) {
            currentState = currentState.copy(gatewayOnline = false)
        }
        publish()
    }

    private fun pollBudgets() {
        val settings = ObservaAISettings.getInstance()
        if (!settings.state.enabled) return

        try {
            val url = settings.state.gatewayUrl.trimEnd('/') + "/budgets/alerts"
            val response = httpClient.send(buildRequest(url, settings), HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() != 200) return

            val json = JsonParser.parseString(response.body()).asJsonObject
            val alerts = parseAlerts(json.getAsJsonArray("alerts"))

            // Fire notifications for newly-triggered alerts
            for (alert in alerts) {
                val key = "${alert.budgetId}:${alert.level}"
                if (seenAlertKeys.add(key)) {
                    fireNotification(alert)
                }
            }
            // Remove resolved alerts so they re-notify if threshold is crossed again
            val activeKeys = alerts.map { "${it.budgetId}:${it.level}" }.toSet()
            seenAlertKeys.retainAll(activeKeys)

            currentState = currentState.copy(budgetAlerts = alerts)
            publish()
        } catch (_: Exception) {
            // Gateway offline — keep existing alert state
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun buildRequest(url: String, settings: ObservaAISettings): HttpRequest {
        val builder = HttpRequest.newBuilder(URI.create(url))
            .GET()
            .timeout(Duration.ofSeconds(5))
        if (settings.state.teamApiKey.isNotBlank()) {
            builder.header("X-ObservaAI-Team-Key", settings.state.teamApiKey)
        }
        return builder.build()
    }

    private fun publish() {
        ApplicationManager.getApplication().messageBus
            .syncPublish(METRICS_TOPIC)
            .onMetricsUpdate(currentState)
    }

    private fun fireNotification(alert: BudgetAlert) {
        val title = if (alert.level == "exceeded") "ObservaAI: Budget Exceeded" else "ObservaAI: Budget Warning"
        val label = alert.label.ifBlank { "${alert.provider ?: "all"} · ${alert.period}" }
        val pct = (alert.spendPct * 100).toInt()
        val content = "$label at $pct% (\$%.2f / \$%.2f)".format(alert.spendUsd, alert.limitUsd)
        val type = if (alert.level == "exceeded") NotificationType.ERROR else NotificationType.WARNING

        ApplicationManager.getApplication().invokeLater {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("ObservaAI Budget Alerts")
                .createNotification(title, content, type)
                .notify(null)
        }
    }

    private fun parseProviderUsage(arr: JsonArray?): List<ProviderUsage> =
        arr?.mapNotNull { el ->
            try {
                val o = el.asJsonObject
                ProviderUsage(
                    provider = o.getString("provider") ?: return@mapNotNull null,
                    model = o.getString("model") ?: "",
                    totalInputTokens = o.getLong("totalInputTokens"),
                    totalOutputTokens = o.getLong("totalOutputTokens"),
                    totalCachedTokens = o.getLong("totalCachedTokens"),
                    totalCost = o.getDouble("totalCost"),
                    requestCount = o.getInt("requestCount"),
                    avgLatencyMs = o.getDouble("avgLatencyMs"),
                )
            } catch (_: Exception) { null }
        } ?: emptyList()

    private fun parseAlerts(arr: JsonArray?): List<BudgetAlert> =
        arr?.mapNotNull { el ->
            try {
                val o = el.asJsonObject
                BudgetAlert(
                    budgetId = o.getString("budget_id") ?: return@mapNotNull null,
                    label = o.getString("label") ?: "",
                    level = o.getString("level") ?: "warning",
                    spendUsd = o.getDouble("spend_usd"),
                    limitUsd = o.getDouble("limit_usd"),
                    spendPct = o.getDouble("spend_pct"),
                    provider = o["provider"]?.takeUnless { it.isJsonNull }?.asString,
                    period = o.getString("period") ?: "",
                )
            } catch (_: Exception) { null }
        } ?: emptyList()

    // JsonObject extension helpers
    private fun JsonObject.getString(key: String): String? = get(key)?.takeUnless { it.isJsonNull }?.asString
    private fun JsonObject.getLong(key: String): Long = get(key)?.asLong ?: 0L
    private fun JsonObject.getInt(key: String): Int = get(key)?.asInt ?: 0
    private fun JsonObject.getDouble(key: String): Double = get(key)?.asDouble ?: 0.0

    override fun dispose() {
        executor.shutdownNow()
        httpClient.close()
    }

    companion object {
        fun getInstance(): GatewayPoller =
            ApplicationManager.getApplication().getService(GatewayPoller::class.java)
    }
}
