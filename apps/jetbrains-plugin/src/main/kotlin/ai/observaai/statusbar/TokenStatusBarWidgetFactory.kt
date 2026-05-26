package ai.observaai.statusbar

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

class TokenStatusBarWidgetFactory : StatusBarWidgetFactory {

    override fun getId(): String = TokenStatusBarWidget.ID

    override fun getDisplayName(): String = "ObservaAI Metrics"

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = TokenStatusBarWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) = widget.dispose()

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}
