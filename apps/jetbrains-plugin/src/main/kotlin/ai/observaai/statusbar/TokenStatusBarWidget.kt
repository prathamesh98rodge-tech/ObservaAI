package ai.observaai.statusbar

import ai.observaai.GatewayPoller
import ai.observaai.METRICS_TOPIC
import ai.observaai.MetricsListener
import ai.observaai.MetricsState
import ai.observaai.toolwindow.MetricsPanel
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.impl.status.EditorBasedWidget
import com.intellij.util.Consumer
import java.awt.event.MouseEvent

class TokenStatusBarWidget(project: Project) :
    EditorBasedWidget(project), StatusBarWidget.TextPresentation {

    private var displayText: String = "ObservaAI"

    override fun ID(): String = ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getText(): String = displayText

    override fun getTooltipText(): String =
        "ObservaAI — token usage and cost · click to open metrics panel"

    override fun getClickConsumer(): Consumer<MouseEvent> = Consumer {
        ToolWindowManager.getInstance(project).getToolWindow("ObservaAI")?.show()
    }

    override fun install(statusBar: StatusBar) {
        super.install(statusBar)
        // Subscribe on the application bus so we receive cross-project publishes
        val conn = ApplicationManager.getApplication().messageBus.connect()
        Disposer.register(this, conn)
        conn.subscribe(METRICS_TOPIC, MetricsListener { state ->
            updateText(state)
            statusBar.updateWidget(ID)
        })
        updateText(GatewayPoller.getInstance().currentState)
    }

    private fun updateText(state: MetricsState) {
        displayText = if (!state.gatewayOnline) {
            "ObservaAI ●"
        } else {
            val tokens = MetricsPanel.fmtTokens(state.sessionTokens)
            val cost = MetricsPanel.fmtCost(state.sessionCost)
            "⬡ $tokens · $cost"
        }
    }

    companion object {
        const val ID = "ai.observaai.tokenStatus"
    }
}
