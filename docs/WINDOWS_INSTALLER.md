# Windows 11 Installer

The repository now includes a Windows 11 `.exe` installer build path.

Build it with:

```powershell
npm run build:windows-installer
```

Output:

```text
dist\windows-installer\SummarizeThisSetup.exe
```

The installer:

- Installs the runtime files to `%LOCALAPPDATA%\SummarizeThis`.
- Creates Start Menu shortcuts for launch, Trello Power-Up configuration, and uninstall.
- Registers a per-user uninstall entry.
- Starts a lightweight local launcher at `http://127.0.0.1:17117`.
- Avoids Electron and external dependencies.
- Builds as a self-extracting .NET Framework executable using the Windows framework compiler.
- Bundles `update.json` so the installed popup can manually compare the current version with the GitHub update manifest.

The Start Menu shortcut named `Configure Trello Power-Up` opens a setup assistant with GitHub Pages, Netlify, and custom HTTPS presets. It validates the hosted URL format and can check the public HTML connector, manifest, policy pages, and icon before Trello setup. It collects a monitored developer Email and Support contact, prepares the exact iframe connector URL, app metadata, manifest URL, privacy URL, terms URL, icon URL, capabilities, and admin field map for Trello's Power-Up Admin Portal, and provides a safe admin autofill bookmarklet. Trello's current New App form requires a manual Workspace selection; the helper fills the visible text fields, then can be run again from the app edit page for matching metadata and capability checkboxes. It reports filled, missing, and manual items and never saves or submits either page.

The popup's **Installed app updates** panel checks GitHub only when the user presses **Check for updates**. It does not poll, download, install, or run updates automatically, and it does not send Trello card data or API keys.

Important:

- The installer is for easy standalone Windows use.
- Trello Power-Up use inside Trello still requires hosting the static files on an HTTPS URL and configuring that connector URL in Trello.
