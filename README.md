# Summarize This - Evidence-Backed Trello Card Analysis

[![Confidence](https://img.shields.io/badge/Confidence-Evidence--based-blue)](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Trello Power-Up](https://img.shields.io/badge/Trello-Power--Up-0079BF)](https://trello.com/power-ups)
[![AI Powered](https://img.shields.io/badge/AI-Powered-purple)](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-)

> Transform Trello cards into evidence-backed operational summaries with confidence signals, review controls, and safe export workflows.

> Version 1.1.0 ships an allowlisted static Power-Up, authenticated backend, local or PostgreSQL persistence, review-gated HAI JSON feed, Docker deployment, and a Windows 11 installer with a bundled loopback backend. External AI providers, Trello writes, HAI ingestion, and public tunnels remain opt-in and require explicit user approval.

---

## 🎯 What is Summarize This?

**Summarize This** is a static Trello Power-Up that adds a "Summarize This" button to Trello cards.

The current shipped product is the browser-based Power-Up flow in `connector.js`, `popup.html`, `settings-powerup.html`, `summarizer-core.js`, `attachment-processor.js`, `ai-providers.js`, `trello-integration.js`, and `card-intelligence-ledger.js`.

The active product currently provides:

- 📊 **Evidence and review signals** — source-derived evidence plus validation findings that identify missing context and review needs
- 🎯 **Deterministic local fallback** — a local summary when no provider is configured
- 🤖 **Optional AI paths** — direct-provider and proxy configurations initiated from the reviewed browser workflow
- 👥 **Private review and feedback records** — member-private ledger history, review state, and feedback
- 🧭 **Claim boundaries** — facts, inferences, uncertainty, and unsupported claims are presented separately
- 📤 **Operator-controlled exports** — copy/export flows, with Trello comment posting behind explicit approval

The backend is part of the shipped product when persistence, batch job state, or HAI export is enabled. The deterministic browser summarizer continues to work without it.

---

## ✨ Features

### 🎨 Core Features

- **One-Click Analysis** - Button on every Trello card
- **Comprehensive Summaries** - What, why, status, next steps, insights
- **Smart Context** - Analyzes descriptions, checklists, comments, activity, and attachment metadata
- **Multiple AI Providers** - Choose configured direct providers or the optional proxy
- **Export Options** - Markdown, PDF, JSON, Text, Clipboard
- **Mobile Responsive** - Works on all devices
- **Dark Mode Ready** - Professional, modern UI

### 🎯 Confidence and Review Signals

- **Confidence Scoring** - Evidence/completeness-based review signal
- **Validation Findings** - Missing context, unsupported claims, attachment limits, and review-needed cases
- **Claim Boundaries** - Facts, inferences, uncertainty, and unsupported claims shown separately
- **Human Review System** - Private review state and feedback capture
- **Quality Indicators** - Visible confidence and validation cues; not an accuracy measurement

### Current Product Limits

- **Attachment Processing** - Honest attachment metadata plus optional bounded text/CSV extraction only
- **Binary attachments remain partial** - PDF, Word, Excel, and image OCR are not fully extracted in the shipped flow
- **Batch support is manual-first** - The popup prepares and reviews queue items, but does not run unattended full-card batch analysis
- **Confidence is a review signal** - It is not a measured guarantee of correctness
- **Trello writes are gated** - Comment posting and description replacement require explicit review and confirmation; description updates also check for a changed source before writing

---

## 🎬 Demo

### Illustrative Analysis Output
```
┌────────────────────────────────────────────────┐
│ 🧠 Analysis — review required                  │
├────────────────────────────────────────────────┤
│ Confidence is a heuristic review signal        │
│ Source context: card description + checklist   │
│                                                │
│ Facts are separated from inferences            │
│ Verify the card before taking action           │
│                                                │
│ 📝 What This Card Is About                    │
│ Implementing account access and session        │
│ handling for an example card...                │
│                                                │
│ 🎯 Current Status                             │
│ 60% complete (3 of 5 checklist items done)    │
│ Timing and completeness require review         │
│                                                │
│ ✅ Next Steps                                 │
│ 1. Complete token refresh logic               │
│ 2. Add rate limiting                          │
│ 3. Write integration tests                    │
│                                                │
│ 💡 Key Insights                               │
│ • Inference: testing may be a critical path   │
│ • Uncertainty: no external status verified    │
│ • Unsupported claims are shown separately     │
│                                                │
│ 📊 Operator Check                             │
│ Do not treat this as accuracy measurement      │
│ Review needed: yes                             │
└────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Windows 11

1. Download `SummarizeThisSetup.exe` from the current GitHub release or CI artifact.
2. Run the installer. It installs for the current user and starts a bundled backend on `127.0.0.1:18787` with generated private secrets.
3. Open **Summarize This** from the Start menu for the standalone local app.
4. Open **Configure Trello Power-Up** to get the exact hosted connector URL.
5. Open **Share Backend with ngrok** only when Trello or HAI needs to reach the local backend over HTTPS.

The installer does not require Node.js, Docker, or administrator rights. ngrok is optional and is not started automatically.

### 1. Deploy the Power-Up (3 minutes)

GitHub Pages is deployed by `.github/workflows/deploy-pages.yml` from the explicit `runtime-files.json` allowlist. The production connector is:

`https://robert-velhorst.github.io/007--Trello-Summarize-This-/connector.html?v=20260809.1`

### 2. Register as Trello Power-Up (4 minutes)

1. Go to https://trello.com/power-ups/admin
2. Open the existing **Summarize This** Power-Up or create it once.
3. Fill in details:
   - **Name**: Summarize This
   - **Connector URL**: the hosted `connector.html` URL above
   - **Capabilities**: `card-buttons`, `show-settings`, `authorization-status`
4. Save

### 3. Enable on Board (1 minute)

1. Open Trello board
2. Power-Ups → Custom → Add "Summarize This"

### 4. Configure AI Access (2 minutes)

1. Choose either a direct provider key or the safer backend proxy mode.
2. Direct mode: get an OpenAI API key from https://platform.openai.com/api-keys, then Power-Up Settings -> paste the key -> Save.
3. Proxy mode: configure an HTTPS backend proxy endpoint in Settings so provider keys stay server-side.

### 5. Start Analyzing! ✨

1. Open any card
2. Click "Summarize This" button
3. Get instant AI analysis with confidence scoring!

---

## 📖 Documentation

### User Guides
- [**Quick Start Guide**](QUICK_START_GUIDE.md) - Get started in 10 minutes
- [**User Guide**](USER_GUIDE.md) - Complete feature documentation
- [**Deployment Guide**](FINAL_DEPLOYMENT_GUIDE.md) - Detailed deployment instructions

### Technical Documentation
- [**Confidence and Validation System**](999_ACCURACY_IMPLEMENTATION.md) - How confidence and review signals work
- [**Technical Audit**](docs/TECHNICAL_AUDIT.md) - Current repo truth and inactive areas
- [**Critical Path**](docs/CRITICAL_PATH.md) - Verified active user flow
- [**Acceptance Tests**](docs/ACCEPTANCE_TESTS.md) - Automated and manual verification
- [**Goal Completion Matrix**](docs/GOAL_COMPLETION_MATRIX.md) - Implemented vs partial vs missing
- [**Phase Status Ledger**](docs/PHASE_STATUS_LEDGER.md) - Phase-by-phase status from 000 to 115
- [**Final Verification Report**](docs/FINAL_VERIFICATION_REPORT.md) - Current evidence and open gaps
- [**Roadmap and Blocked Items**](docs/ROADMAP_AND_BLOCKED_ITEMS.md) - Best next steps and current blockers
- [**Improvement Roadmap**](NEXT_LEVEL_IMPROVEMENTS.md) - Future enhancements
- [**HAI Connector**](docs/HAI_CONNECTOR.md) - Review-gated private feed and HAI setup
- [**Power-Up README**](POWERUP_README.md) - Power-Up specific docs

### API Documentation
- [**AI Providers**](ai-providers.js) - AI integration details
- [**Trello Integration**](trello-integration.js) - Trello API usage
- [**Accuracy System**](accuracy-system.js) - Accuracy modules

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────┐
│                  Trello Board                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Card 1  │  │  Card 2  │  │  Card 3  │     │
│  │ [Button] │  │ [Button] │  │ [Button] │     │
│  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│            Summarize This Power-Up              │
│  ┌──────────────────────────────────────────┐  │
│  │  1. Data Collection                      │  │
│  │     • Card details, checklists, comments │  │
│  │     • Attachments, activity, context     │  │
│  └──────────────────────────────────────────┘  │
│                     ↓                           │
│  ┌──────────────────────────────────────────┐  │
│  │  2. Local or Optional AI Analysis        │  │
│  │     • Local deterministic fallback       │  │
│  │     • Optional configured provider path  │  │
│  │     • Human review before action         │  │
│  └──────────────────────────────────────────┘  │
│                     ↓                           │
│  ┌──────────────────────────────────────────┐  │
│  │  3. Evidence and Review Signals          │  │
│  │     • Evidence and completeness checks   │  │
│  │     • Facts vs. inferences               │  │
│  │     • Explicit uncertainty                │  │
│  └──────────────────────────────────────────┘  │
│                     ↓                           │
│  ┌──────────────────────────────────────────┐  │
│  │  4. Operator Review                      │  │
│  │     • Review state and feedback          │  │
│  │     • Approval-gated Trello comments     │  │
│  │     • No automatic learning claim        │  │
│  └──────────────────────────────────────────┘  │
│                     ↓                           │
│  ┌──────────────────────────────────────────┐  │
│  │  5. Results Display                      │  │
│  │     • Confidence indicator               │  │
│  │     • Analysis sections                  │  │
│  │     • Review and validation details      │  │
│  │     • Export options                     │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Connector** | `connector.js` | Trello Power-Up initialization |
| **Main UI** | `popup.html` | Card intelligence analysis interface |
| **Legacy popup redirects** | `popup-999-accuracy.html`, `popup-enhanced.html`, `popup-nextgen.html`, `popup-original.html` | Compatibility redirects to the active popup |
| **Accuracy** | `accuracy-system.js` | Legacy confidence/reference module alongside active popup evidence and ledger logic |
| **AI Integration** | `ai-providers.js` | Multi-AI provider support |
| **Trello API** | `trello-integration.js` | Card data fetching |
| **Settings** | `settings-powerup.html` | AI access configuration |

---

## 🎯 Confidence Breakdown

### How Confidence Is Calculated

| Signal | Component | Purpose | Status |
|-------|-----------|---------|--------|
| 1 | Data completeness | Checks whether title, description, comments, checklists, dates, labels, members, and attachments are available | ✅ |
| 2 | Analysis completeness | Checks whether required output sections are present | ✅ |
| 3 | Evidence coverage | Links claims to card data, comments, checklist items, attachments, and activity where available | ✅ |
| 4 | Validation findings | Flags missing context, unsupported claims, attachment limits, and review-needed cases | ✅ |
| 5 | Human review | Stores user corrections and review state separately from verified Trello evidence | ✅ |

Confidence is a review signal, not a guaranteed accuracy percentage. High-confidence output should still be checked before decisions, exports, or Trello writeback.

### Confidence Scoring Formula

```javascript
Overall Confidence = 
    (Data Completeness × 0.25) +
    (Analysis Completeness × 0.20) +
    (Factual Consistency × 0.30) +
    (Model Confidence × 0.15) +
    (Complexity Score × 0.10)
```

---

## 💻 Technology Stack

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Trello Power-Up Client Library
- Chart.js for visualizations
- Font Awesome icons

### AI Providers
- OpenAI, Anthropic, and Google paths in `ai-providers.js`, when configured by the operator
- Optional Cloudflare Worker proxy reference implementation
- Local deterministic fallback when no provider is configured

### Libraries & Tools
- Optional bounded text/CSV extraction for small HTTPS attachments
- Sensitive-card signals keep optional text extraction metadata-only until approval
- Binary document and image attachments stay metadata-only in the active Power-Up
- OCR/PDF/Office extraction libraries are not active in the shipped Power-Up

---

## 📊 Performance and Cost

No production performance benchmark, throughput target, cost guarantee, or measured accuracy result is currently verified. Provider latency and cost depend on the configured model, card contents, attachment policy, network, and external provider account. The shipped batch workflow is manual-first and must not be treated as unattended throughput.

Confidence is calculated from available evidence and completeness as a review signal. Attachment limits and validation findings are surfaced when available, and private human feedback can guide later reanalysis; none of these are a measured accuracy guarantee.

## Verification Status

- `npm test` verifies the shared summarizer, popup contract text, ledger helpers, attachment rules, and documentation truth checks.
- Manual Trello runtime verification is still required for badge refresh, Trello comment posting, and member-private storage behavior.
- Completion claims for this repository should follow the audit documents in `docs/`, not older historical summaries.

---

## 🛠️ Development

### Setup

```bash
# Clone repository
git clone https://github.com/Robert-Velhorst/007--Trello-Summarize-This-.git
cd 007--Trello-Summarize-This-

# No build step required - pure HTML/CSS/JS
# Just host the files on any web server
```

### Project Structure

```
007--Trello-Summarize-This-/
├── connector.js                    # Power-Up connector
├── popup.html                      # Main card intelligence UI
├── popup-999-accuracy.html         # Legacy redirect to popup.html
├── accuracy-system.js              # Accuracy modules
├── settings-powerup.html           # Settings UI
├── manifest.json                   # Power-Up manifest
├── ai-providers.js                 # AI integrations
├── trello-integration.js           # Trello API
├── advanced-modules.js             # Phase 2 features
├── intelligence-modules.js         # Phase 3 features
├── attachment-processor.js         # File processing
├── batch-processor.js              # Batch operations
├── custom-prompts.js               # Prompt templates
├── export.js                       # Export functionality
├── onboarding.js                   # User onboarding
├── test-suite.js                   # Automated tests
└── docs/
    ├── FINAL_DEPLOYMENT_GUIDE.md
    ├── 999_ACCURACY_IMPLEMENTATION.md
    └── USER_GUIDE.md
```

### Testing

```bash
# Run automated tests
npm test

# Test with real Trello data
# 1. Configure API keys in settings
# 2. Open any Trello card
# 3. Click "Summarize This"
# 4. Verify results and confidence scores
```

Security note: API keys are stored only through Trello member-private Power-Up storage. The standalone/local preview path saves non-key settings only and clears API key fields instead of persisting keys in `localStorage`. Settings can also use an optional HTTPS backend proxy endpoint so provider keys stay server-side; see [proxy/README.md](proxy/README.md) for the Cloudflare Worker reference proxy.

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Areas for Contribution
- 🐛 Bug fixes
- ✨ New features
- 📝 Documentation improvements
- 🌍 Translations
- 🎨 UI/UX enhancements
- 🧪 Test coverage

### Development Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Use ES6+ JavaScript
- Follow existing code structure
- Add comments for complex logic
- Update documentation for new features

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Trello** - For the excellent Power-Up platform
- **OpenAI** - For GPT models
- **Anthropic** - For Claude models
- **Google** - For Gemini models
- **Open Source Community** - For amazing libraries and tools

---

## 📞 Support

### Documentation
- [Operator Runbook](docs/OPERATOR_RUNBOOK.md)
- [Goal Completion Matrix](docs/GOAL_COMPLETION_MATRIX.md)
- [Final Verification Report](docs/FINAL_VERIFICATION_REPORT.md)

### Issues
Found a bug or have a feature request? [Open an issue](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-/issues)

### Community
- 💬 Discussions: [GitHub Discussions](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-/discussions)
- 📧 Email: Submit feedback at https://help.manus.im

---

## 🗺️ Roadmap

### ✅ Verified local scope
- Browser Power-Up card analysis and deterministic fallback
- Optional configured AI/provider paths
- Evidence/review signals, private review state, feedback, and exports
- Explicit claim-boundary display and approval-gated comment posting
- Durable reviewed local worker, reminders, workspace roles, search/pagination, backups, reconciliation, and redacted support diagnostics
- Windows 11 installer and hardened single-instance Docker backend artifacts

### 🚧 Partial or not shipped
- Binary attachment extraction (PDF, Office, and image OCR)
- Live re-verification of description replacement and public deployment
- Measured accuracy and production performance evidence

### 📋 External requirements
- Live provider credentials, public HTTPS hosting, and Trello listing approval
- Multi-instance production database/queue, offsite disaster recovery, managed secrets, and payment integration
- API for third-party integrations
- Slack/Teams integration
- Custom AI model fine-tuning
- Enterprise features

---

## 📈 Stats

![GitHub stars](https://img.shields.io/github/stars/Robert-Velhorst/007--Trello-Summarize-This-?style=social)
![GitHub forks](https://img.shields.io/github/forks/Robert-Velhorst/007--Trello-Summarize-This-?style=social)
![GitHub issues](https://img.shields.io/github/issues/Robert-Velhorst/007--Trello-Summarize-This-)
![GitHub pull requests](https://img.shields.io/github/issues-pr/Robert-Velhorst/007--Trello-Summarize-This-)

---

## Example Uses

These are illustrative uses, not customer testimonials:

- Use confidence and review signals to identify cards needing more detail before work starts.
- Separate supported facts from assumptions before acting on a summary.
- Prepare a reviewed batch-analysis plan while keeping Trello writes off by default.

---

<div align="center">

### Made with ❤️ for better project management

**[Get Started](FINAL_DEPLOYMENT_GUIDE.md)** • **[Documentation](USER_GUIDE.md)** • **[GitHub](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-)** • **[Issues](https://github.com/Robert-Velhorst/007--Trello-Summarize-This-/issues)**

---

**Star ⭐ this repository if you find it helpful!**

**Version**: 3.0 (Confidence and Validation System)
**Last Updated**: January 31, 2026  
**Status**: Verified local Power-Up scope; not production-ready

</div>
