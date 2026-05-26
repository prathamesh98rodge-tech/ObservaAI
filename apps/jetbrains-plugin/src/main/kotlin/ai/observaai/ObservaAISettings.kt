package ai.observaai

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(name = "ObservaAISettings", storages = [Storage("observaai.xml")])
@Service(Service.Level.APP)
class ObservaAISettings : PersistentStateComponent<ObservaAISettings.State> {

    data class State(
        var gatewayUrl: String = "http://localhost:8000",
        var teamApiKey: String = "",
        var enabled: Boolean = true,
    )

    private var _state = State()

    override fun getState(): State = _state

    override fun loadState(state: State) {
        _state = state
    }

    companion object {
        fun getInstance(): ObservaAISettings =
            ApplicationManager.getApplication().getService(ObservaAISettings::class.java)
    }
}
