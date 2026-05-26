package ai.observaai.toolwindow

import ai.observaai.BudgetAlert
import ai.observaai.METRICS_TOPIC
import ai.observaai.MetricsListener
import ai.observaai.MetricsState
import ai.observaai.ProviderUsage
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.JTextPane
import javax.swing.SwingUtilities

class MetricsPanel : JPanel(BorderLayout()), Disposable {

    private val textPane = JTextPane().apply {
        contentType = "text/html"
        isEditable = false
    }

    init {
        border = JBUI.Borders.empty(4)
        add(JBScrollPane(textPane).apply { border = null }, BorderLayout.CENTER)

        val conn = ApplicationManager.getApplication().messageBus.connect()
        Disposer.register(this, conn)
        conn.subscribe(METRICS_TOPIC, MetricsListener { state ->
            SwingUtilities.invokeLater { update(state) }
        })

        update(MetricsState())
    }

    fun update(state: MetricsState) {
        val bg = UIUtil.getPanelBackground()
        textPane.background = bg
        textPane.text = buildHtml(state, bg.isDark())
        textPane.caretPosition = 0
    }

    // ── HTML builder ──────────────────────────────────────────────────────────

    private fun buildHtml(state: MetricsState, dark: Boolean): String {
        val bg = if (dark) "#0f0f1a" else "#ffffff"
        val fg = if (dark) "#e2e8f0" else "#1e293b"
        val cardBg = if (dark) "#1e293b" else "#f1f5f9"
        val mutedFg = if (dark) "#94a3b8" else "#64748b"

        val conn = buildConnBanner(state)
        val alerts = buildAlerts(state.budgetAlerts, cardBg)
        val summary = if (state.gatewayOnline) buildSummary(state, cardBg, mutedFg) else ""
        val providers = buildProviders(state, cardBg, mutedFg)

        return """
            <html><head><style>
              body{margin:0;padding:6px;background:$bg;color:$fg;font-family:Arial,sans-serif;font-size:12px;}
              *{box-sizing:border-box;}
              table{border-spacing:2px;}
              td{vertical-align:top;}
            </style></head>
            <body>$conn$alerts$summary$providers</body></html>
        """.trimIndent()
    }

    private fun buildConnBanner(state: MetricsState): String {
        val (color, text) = if (state.gatewayOnline)
            "#34d399" to "&#x25CF; Gateway online"
        else
            "#f87171" to "&#x25CF; Gateway offline"
        return """<div style="background:#1e293b;border-radius:5px;padding:5px 8px;margin-bottom:6px;
                  font-size:11px;font-weight:600;color:$color;">$text</div>"""
    }

    private fun buildSummary(state: MetricsState, cardBg: String, muted: String): String {
        return """
            <div style="margin-top:6px;">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:$muted;margin-bottom:4px;">Session</div>
              <table width="100%"><tr>
                <td width="50%"><div style="background:$cardBg;border-radius:4px;padding:5px 7px;">
                  <div style="font-size:9px;color:$muted;">TOKENS</div>
                  <div style="font-size:14px;font-weight:bold;color:#60a5fa;">${fmtTokens(state.sessionTokens)}</div>
                </div></td>
                <td width="50%"><div style="background:$cardBg;border-radius:4px;padding:5px 7px;">
                  <div style="font-size:9px;color:$muted;">COST</div>
                  <div style="font-size:14px;font-weight:bold;color:#34d399;">${fmtCost(state.sessionCost)}</div>
                </div></td>
              </tr><tr>
                <td><div style="background:$cardBg;border-radius:4px;padding:5px 7px;margin-top:2px;">
                  <div style="font-size:9px;color:$muted;">AVG LATENCY</div>
                  <div style="font-size:14px;font-weight:bold;color:#fbbf24;">${fmtMs(state.avgLatencyMs)}</div>
                </div></td>
                <td><div style="background:$cardBg;border-radius:4px;padding:5px 7px;margin-top:2px;">
                  <div style="font-size:9px;color:$muted;">IN FLIGHT</div>
                  <div style="font-size:14px;font-weight:bold;color:#a78bfa;">${state.requestsInFlight}</div>
                </div></td>
              </tr></table>
            </div>
        """.trimIndent()
    }

    private fun buildProviders(state: MetricsState, cardBg: String, muted: String): String {
        if (!state.gatewayOnline) {
            return """<div style="text-align:center;padding:20px 8px;color:$muted;font-size:11px;">
                Connecting to gateway&hellip;<br>Check Settings &rarr; ObservaAI for gateway URL.</div>"""
        }
        if (state.usageByProvider.isEmpty()) {
            return """<div style="text-align:center;padding:20px 8px;color:$muted;font-size:11px;">
                No requests yet.<br>Route AI calls through the gateway.</div>"""
        }

        val cards = state.usageByProvider.joinToString("") { buildProviderCard(it, muted) }
        return """
            <div style="margin-top:8px;">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:$muted;margin-bottom:4px;">Providers</div>
              $cards
            </div>
        """.trimIndent()
    }

    private fun buildProviderCard(u: ProviderUsage, muted: String): String {
        val color = PROVIDER_COLORS[u.provider] ?: "#64748b"
        val total = u.totalInputTokens + u.totalOutputTokens
        return """
            <div style="border-left:3px solid $color;background:#1e293b;border-radius:4px;padding:6px 8px;margin-bottom:5px;">
              <table width="100%"><tr>
                <td><span style="font-weight:bold;color:$color;font-size:12px;">${u.provider}</span></td>
                <td align="right"><span style="color:#34d399;font-size:11px;font-weight:bold;">${fmtCost(u.totalCost)}</span></td>
              </tr></table>
              <div style="font-size:10px;color:$muted;font-family:monospace;margin-bottom:3px;">${u.model}</div>
              <table width="100%"><tr>
                <td><div style="font-size:9px;color:$muted;">IN</div><div style="font-size:11px;color:#60a5fa;">${fmtTokens(u.totalInputTokens)}</div></td>
                <td><div style="font-size:9px;color:$muted;">OUT</div><div style="font-size:11px;color:#34d399;">${fmtTokens(u.totalOutputTokens)}</div></td>
                <td><div style="font-size:9px;color:$muted;">TOTAL</div><div style="font-size:11px;color:#a78bfa;">${fmtTokens(total)}</div></td>
                <td><div style="font-size:9px;color:$muted;">P50</div><div style="font-size:11px;color:#fbbf24;">${fmtMs(u.avgLatencyMs)}</div></td>
              </tr></table>
            </div>
        """.trimIndent()
    }

    private fun buildAlerts(alerts: List<BudgetAlert>, cardBg: String): String {
        if (alerts.isEmpty()) return ""
        val cards = alerts.joinToString("") { a ->
            val color = if (a.level == "exceeded") "#f87171" else "#fbbf24"
            val icon = if (a.level == "exceeded") "&#x2717;" else "!"
            val pct = (a.spendPct * 100).toInt()
            val label = a.label.ifBlank { "${a.provider ?: "all"} &middot; ${a.period}" }
            """<div style="border-left:3px solid $color;background:#1e293b;border-radius:4px;padding:6px 8px;margin-bottom:5px;">
               <table width="100%"><tr>
                 <td><span style="font-weight:bold;color:$color;">$icon $label</span></td>
                 <td align="right"><span style="color:$color;font-size:11px;">$pct%</span></td>
               </tr></table>
               <div style="font-size:10px;color:#94a3b8;">\${"%.2f".format(a.spendUsd)} / \${"%.2f".format(a.limitUsd)}</div>
               </div>"""
        }
        return """<div style="margin-top:6px;">
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px;">Budget Alerts</div>
                  $cards</div>"""
    }

    override fun dispose() { /* bus connection cleaned up by Disposer */ }

    // ── utilities ─────────────────────────────────────────────────────────────

    private fun java.awt.Color.isDark(): Boolean = (red * 0.299 + green * 0.587 + blue * 0.114) < 128

    companion object {
        private val PROVIDER_COLORS = mapOf(
            "anthropic"  to "#f97316",
            "openai"     to "#10b981",
            "gemini"     to "#3b82f6",
            "ollama"     to "#a855f7",
            "openrouter" to "#64748b",
        )

        fun fmtTokens(n: Long): String = when {
            n >= 1_000_000L -> "%.1fM".format(n / 1_000_000.0)
            n >= 1_000L     -> "%.1fK".format(n / 1_000.0)
            else            -> n.toString()
        }

        fun fmtCost(c: Double): String = when {
            c <= 0 || c < 0.0001 -> "<\$0.0001"
            c < 0.01             -> "\$%.4f".format(c)
            else                 -> "\$%.2f".format(c)
        }

        fun fmtMs(ms: Double): String = when {
            ms <= 0    -> "—"
            ms >= 1000 -> "%.1fs".format(ms / 1000)
            else       -> "${ms.toInt()}ms"
        }
    }
}
