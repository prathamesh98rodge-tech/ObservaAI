package ai.observaai

import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

class SettingsConfigurable : Configurable {

    private var gatewayUrlField: JBTextField? = null
    private var teamApiKeyField: JBPasswordField? = null
    private var enabledBox: JBCheckBox? = null

    override fun getDisplayName(): String = "ObservaAI"

    override fun createComponent(): JComponent {
        gatewayUrlField = JBTextField()
        teamApiKeyField = JBPasswordField()
        enabledBox = JBCheckBox("Enable ObservaAI telemetry collection")

        return FormBuilder.createFormBuilder()
            .addComponent(enabledBox!!)
            .addSeparator()
            .addLabeledComponent(JBLabel("Gateway URL:"), gatewayUrlField!!)
            .addLabeledComponent(JBLabel("Team API Key:"), teamApiKeyField!!)
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    override fun isModified(): Boolean {
        val s = ObservaAISettings.getInstance().state
        return gatewayUrlField?.text != s.gatewayUrl ||
            String(teamApiKeyField?.password ?: charArrayOf()) != s.teamApiKey ||
            enabledBox?.isSelected != s.enabled
    }

    override fun apply() {
        val settings = ObservaAISettings.getInstance()
        gatewayUrlField?.text?.also { settings.state.gatewayUrl = it }
        teamApiKeyField?.password?.let { settings.state.teamApiKey = String(it) }
        enabledBox?.isSelected?.also { settings.state.enabled = it }
    }

    override fun reset() {
        val s = ObservaAISettings.getInstance().state
        gatewayUrlField?.text = s.gatewayUrl
        teamApiKeyField?.text = s.teamApiKey
        enabledBox?.isSelected = s.enabled
    }

    override fun disposeUIResources() {
        gatewayUrlField = null
        teamApiKeyField = null
        enabledBox = null
    }
}
