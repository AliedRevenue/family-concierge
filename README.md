# Family Concierge Agent

A commercial-grade, config-first family automation agent that converts unstructured family inputs (emails, attachments, schedules) into clean, reliable shared outcomes (calendar events, reminders, summaries).

## 🎯 Vision

The Family Concierge Agent (FCA) minimizes cognitive load by automatically extracting school-related events from email and syncing them to your calendar—without duplication, silent guessing, or requiring you to explain what you want in prompts.

**You configure what to watch. The agent does the rest.**

## ✨ Features

- **Config-First**: Check boxes, don't write prompts
- **Pack System**: Curated presets for School, Sports, Medical, etc.
- **Discovery Engine**: Analyzes your emails to propose configuration
- **Deterministic & Idempotent**: Same inputs always produce same outputs
- **Auditable**: Every action is logged with rationale
- **Privacy-First**: OAuth-only, no data leaves your control
- **Three Modes**: Copilot (propose→approve), Autopilot (high-confidence auto-create), Dry Run (test)

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Google account with Gmail & Calendar
- Google Cloud Project with OAuth credentials

### 1. Install

```bash
npm install
```

### 2. Configure OAuth

1. Create a Google Cloud Project: https://console.cloud.google.com/
2. Enable Gmail API and Google Calendar API
3. Create OAuth 2.0 credentials (Desktop app)
4. Copy `.env.example` to `.env` and fill in:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
```

### 3. Initialize Database

```bash
npm run migrate
```

### 4. Authorize

```bash
npm run dev
```

Follow the authorization URL, then run:

```bash
OAUTH_CODE=<your-code> npm run dev
```

### 5. Run Discovery

```bash
npm run dev discover school
```

This scans your emails and proposes configuration for the School Pack.

### 6. Configure

Edit `config/agent-config.yaml` based on discovery results:

```yaml
packs:
  - packId: school
    priority: 80
    config:
      sources:
        - name: "Elementary School"
          type: email
          fromDomains:
            - "exampleschool.edu"
          keywords:
            - "Colin"
            - "Henry"
          enabled: true
```

### 7. Run Agent

```bash
# Copilot mode (default): propose actions, require approval
npm run dev

# Autopilot mode: auto-create high-confidence events
AGENT_MODE=autopilot npm run dev

# Dry run: process but don't write to calendar
AGENT_MODE=dry-run npm run dev
```

## 📦 Architecture

```
src/
├── core/              # Agent modules
│   ├── agent-orchestrator.ts
│   ├── pack-registry.ts
│   ├── discovery-engine.ts
│   ├── config-loader.ts
│   ├── gmail-connector.ts
│   ├── calendar-writer.ts
│   └── event-extractor.ts
├── database/          # SQLite layer
│   ├── client.ts
│   └── migrate.ts
├── packs/             # Pack definitions
│   ├── school-pack.ts
│   └── index.ts
├── types/             # TypeScript types
│   └── index.ts
├── utils/             # Utilities
│   ├── logger.ts
│   └── fingerprint.ts
└── index.ts           # Main entry point
```

## 🔒 Hard-Coded Invariants

The agent enforces these rules in code:

1. **No Duplicate Events**: Never create duplicate events for the same source message
2. **Source Mapping**: Every event maps to a source artifact (email messageId)
3. **Confidence Gating**: Below threshold, events require approval
4. **Audit Trail**: All actions logged with rationale
5. **Timezone Normalization**: Timezones normalized before persistence
6. **Deterministic**: Same inputs = same outputs

## 🎛️ Configuration

### Agent Modes

- **copilot** (default): Propose → Approve → Act
- **autopilot**: High-confidence actions only
- **dry-run**: Process but never write

### Confidence Thresholds

```yaml
confidence:
  autoCreate: 0.85      # Auto-create if above this
  autoUpdate: 0.90      # Auto-update if above this
  requireReviewBelow: 0.85  # Require approval if below this
```

### Processing

```yaml
processing:
  maxEmailsPerRun: 50
  lookbackDays: 14
  deduplicationWindowDays: 14
```

## 📋 Pack System

Packs are curated presets that define:

- **What to watch**: Sender patterns, keywords
- **How to interpret**: Extraction hints, confidence rules
- **Default behaviors**: Duration, reminders, colors

### Available Packs

- **School Pack** (v1.0.0): Kid/school events, early releases, conferences

*Future packs: Sports, Medical, Camps*

## 🔍 Discovery Mode

Discovery is a **read-only** analysis that proposes configuration:

```bash
npm run dev discover school
```

**Discovery outputs:**

- Suggested sender domains
- Frequent keywords
- Detected platforms (SignupGenius, ParentSquare, etc.)
- Suggested Gmail labels
- Evidence for each suggestion

**User then:**

- ✅ Approves suggestions
- ✏️ Edits suggestions
- ❌ Rejects suggestions

Only approved config becomes active.

## 📊 Database

SQLite with migrations. Schema includes:

- `processed_messages`: Track processed emails
- `events`: Extracted events with fingerprints
- `calendar_operations`: Create/update/flag operations
- `config_versions`: Configuration history
- `discovery_sessions`: Discovery results
- `exceptions`: Errors and warnings
- `audit_logs`: Full audit trail

## 🛠️ Development

```bash
# Build
npm run build

# Run tests
npm test

# Type check
npm run type-check

# Lint
npm run lint

# Format
npm run format
```

## 🔐 Security

- OAuth tokens stored in `./oauth-tokens/token.json` (gitignored)
- No API keys in code
- Read-only Gmail access
- Calendar events write-only
- All credentials in `.env` (gitignored)

## 📖 Commands

```bash
# Run agent
npm start

# Run in dev mode
npm run dev

# Run discovery
npm run dev discover <pack-id>

# Database migrations
npm run migrate
npm run migrate version
npm run migrate rollback <version>
```

## 🚧 TODO Roadmap

### v1.0 (MVP)
- [x] Core agent architecture
- [x] School Pack
- [x] ICS extraction
- [x] Discovery engine
- [x] SQLite persistence
- [ ] OAuth flow UI
- [ ] Digest builder
- [ ] Manual approval UI

### v1.1
- [ ] Text extraction (NLP/LLM)
- [ ] Multi-child event handling
- [ ] Conflict resolution UI
- [ ] Pack marketplace

### v1.2
- [ ] Sports Pack
- [ ] Medical Pack
- [ ] PDF extraction
- [ ] Image OCR

### v2.0
- [ ] Multi-tenant architecture
- [ ] Web dashboard
- [ ] Mobile notifications
- [ ] Shared household instances

## 🤝 Contributing

This is a commercial product scaffold. Contributions welcome via:

1. Fork
2. Create feature branch
3. Run tests
4. Submit PR

## 📄 License

MIT

## 🙏 Acknowledgments

Built with:
- [Google APIs](https://github.com/googleapis/google-api-nodejs-client)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [ical.js](https://github.com/mozilla-comm/ical.js)
- [Winston](https://github.com/winstonjs/winston)
- [Zod](https://github.com/colinhacks/zod)

---

**Questions?** Open an issue or check the [TODO roadmap](#-todo-roadmap).
