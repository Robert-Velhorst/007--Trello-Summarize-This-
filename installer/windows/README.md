# Windows 11 Installer

Build the installer from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\windows\build-installer.ps1
```

The installer is written to:

```text
dist\windows-installer\SummarizeThisSetup.exe
```

The installer is a self-extracting .NET Framework executable. It bundles a Node 22 backend executable, so the installed app does not require Electron, Node.js, Docker, NSIS, administrator rights, or a network download. It installs into the current user's LocalAppData folder, generates backend secrets in an ACL-protected file, creates Start Menu shortcuts, registers an uninstall entry, and starts the static UI plus backend on loopback only.

The installed payload includes the 24 allowlisted static runtime files, standalone backend, local `update.json`, Trello setup assistant, cloud launcher, and uninstall helper. The backend listens at `127.0.0.1:18787`, uses a private local JSON store by default, and starts only one process.

The popup includes a manual update check for standalone Windows mode. It fetches the GitHub update manifest only after the user presses **Check for updates**. It does not poll, auto-download, auto-install, or send Trello card data or API keys.

It also installs a `Configure Trello Power-Up` shortcut. That shortcut opens a setup assistant that prepares host-specific deployment steps, the iframe connector URL, app metadata, privacy URL, terms URL, icon URL, and capability list for Trello's Power-Up Admin Portal. The assistant can copy a deployment guide, readiness checklist, or JSON setup package with exact admin values, validation state, safety notes, manual steps, and a no-submit autofill helper.

`Share Backend with ngrok` starts the backend and then runs the user's installed ngrok client. No tunnel starts during installation or ordinary app launch. Keep the ngrok window open while a hosted Trello Power-Up or HAI source uses the HTTPS endpoint. Browser API calls to ngrok's free development domains automatically include ngrok's documented interstitial-bypass header; other backend hosts never receive that header.

This Windows launcher is for the standalone/local version of the tool. For Trello Power-Up use inside Trello, the same static files still need to be hosted on an HTTPS URL and configured in Trello's Power-Up admin page.
