# Publishing ObservaAI extensions to marketplaces

## Required repository secrets

Configure these in **Settings → Secrets and variables → Actions** on GitHub.

### VS Code Marketplace

| Secret | How to get it |
|---|---|
| `VSCE_PAT` | Create a Personal Access Token at [dev.azure.com](https://dev.azure.com) with **Marketplace: Manage** scope. Publisher name must match `publisher` in `package.json` (`observaai`). |

First publish: create the publisher at https://marketplace.visualstudio.com/manage before the first automated publish.

### JetBrains Marketplace

| Secret | How to get it |
|---|---|
| `JB_PUBLISH_TOKEN` | Create a token at [plugins.jetbrains.com/author/me/tokens](https://plugins.jetbrains.com/author/me/tokens) |
| `JB_CERTIFICATE_CHAIN` | PEM certificate chain from [JetBrains signing guide](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html) |
| `JB_PRIVATE_KEY` | PEM private key (base64-encoded) |
| `JB_PRIVATE_KEY_PASSWORD` | Password for the private key (leave empty if none) |

Plugin signing is required since IntelliJ Platform 2021.2. Follow the [official guide](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html) to generate a certificate.

---

## Release flow

### VS Code extension

```bash
# Tag triggers the release workflow automatically
git tag vscode-v0.1.0
git push origin vscode-v0.1.0
```

Or use **Actions → Release — VS Code Extension → Run workflow** for a manual trigger.

### JetBrains plugin

```bash
git tag jetbrains-v0.1.0
git push origin jetbrains-v0.1.0
```

Or use **Actions → Release — JetBrains Plugin → Run workflow** for a manual trigger with channel selection (stable / eap).

---

## Local packaging (without CI)

### VS Code VSIX

```bash
cd apps/vscode-extension
pnpm build
pnpm package        # → observaai-vscode-0.1.0.vsix
```

Install locally: `code --install-extension observaai-vscode-0.1.0.vsix`

### JetBrains ZIP

```bash
cd apps/jetbrains-plugin
./gradlew buildPlugin
# → build/distributions/observaai-jetbrains-0.1.0.zip
```

Install: **Settings → Plugins → ⚙ → Install Plugin from Disk…**

> **Note:** `./gradlew buildPlugin` downloads ~600 MB of IntelliJ SDK on first run.
> It requires network access to `download.jetbrains.com` and `cache-redirector.jetbrains.com`.
