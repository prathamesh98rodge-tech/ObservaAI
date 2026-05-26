package ai.observaai

data class ProviderUsage(
    val provider: String,
    val model: String,
    val totalInputTokens: Long = 0L,
    val totalOutputTokens: Long = 0L,
    val totalCachedTokens: Long = 0L,
    val totalCost: Double = 0.0,
    val requestCount: Int = 0,
    val avgLatencyMs: Double = 0.0,
)

data class BudgetAlert(
    val budgetId: String,
    val label: String,
    val level: String,       // "warning" | "exceeded"
    val spendUsd: Double,
    val limitUsd: Double,
    val spendPct: Double,
    val provider: String?,
    val period: String,
)

data class MetricsState(
    val gatewayOnline: Boolean = false,
    val sessionTokens: Long = 0L,
    val sessionCost: Double = 0.0,
    val avgLatencyMs: Double = 0.0,
    val requestsInFlight: Int = 0,
    val usageByProvider: List<ProviderUsage> = emptyList(),
    val budgetAlerts: List<BudgetAlert> = emptyList(),
)
