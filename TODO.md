# TODO Roadmap

## 🚀 v1.0 - MVP (In Progress)

### Core Architecture ✅
- [x] Type definitions for all domain models
- [x] SQLite schema with migrations
- [x] Database client with typed queries
- [x] Configuration loader with validation
- [x] Pack registry system

### Agent Modules ✅
- [x] Agent Orchestrator
- [x] Gmail Connector
- [x] Calendar Writer
- [x] Event Extractor (ICS)
- [x] Discovery Engine
- [x] Pack Registry
- [x] Logging & Audit

### Packs ✅
- [x] School Pack (reference implementation)
- [ ] Sports Pack (deferred to v1.1)
- [ ] Medical Pack (deferred to v1.2)

### Infrastructure ✅
- [x] OAuth setup
- [x] Environment config
- [x] Migration runner
- [x] Structured logging

### User Experience 🚧
- [ ] **OAuth flow UI** (currently manual)
  - Create simple Express server for OAuth callback
  - Auto-open browser for authorization
  - Store token securely
- [ ] **Digest builder** (generate user-facing summaries)
  - Daily/weekly digest emails
  - Pending approval notifications
  - Error summaries
- [ ] **Manual approval UI** (for Copilot mode)
  - CLI interface for approving operations
  - Web interface (stretch goal)
  - Batch approval support

### Testing
- [ ] Unit tests for core modules
- [ ] Integration tests for Gmail/Calendar
- [ ] Test fixtures (sample emails)
- [ ] End-to-end test with mock data

### Documentation
- [x] README with setup instructions
- [x] Configuration examples
- [ ] API documentation
- [ ] Pack creation guide
- [ ] Troubleshooting guide

---

## 📦 v1.1 - Enhanced Extraction

### Text Extraction
- [ ] Basic date/time regex extraction
- [ ] NLP-based event extraction
- [ ] LLM integration (GPT-4, Claude)
- [ ] Confidence scoring for text events

### Event Handling
- [ ] Multi-child event splitting
- [ ] Event series detection
- [ ] Recurring event support
- [ ] Event updates from follow-up emails

### UI Improvements
- [ ] Web dashboard (React/Next.js)
  - View pending events
  - Approve/reject operations
  - Configure packs
  - View discovery results
- [ ] Desktop notifications
- [ ] Email digest formatting

### New Packs
- [ ] **Sports Pack**
  - TeamSnap integration
  - Game schedules
  - Practice notifications
- [ ] **Activities Pack**
  - Music lessons
  - Art classes
  - Tutoring sessions

---

## 🔧 v1.2 - Advanced Features

### Extraction
- [ ] PDF parsing (text extraction)
- [ ] Image OCR (Google Vision API)
- [ ] Table extraction from PDFs
- [ ] Attachment download & parsing

### Conflict Resolution
- [ ] Detect calendar conflicts
- [ ] Propose alternatives
- [ ] Priority-based resolution
- [ ] User preference learning

### New Packs
- [ ] **Medical Pack**
  - Doctor appointments
  - Vaccination reminders
  - Prescription refills
- [ ] **Travel Pack**
  - Flight confirmations
  - Hotel bookings
  - Itineraries

### Platform Integrations
- [ ] SignupGenius deep integration
- [ ] ParentSquare API
- [ ] SchoolLoop API
- [ ] Remind API

---

## 🌐 v2.0 - Commercial Scale

### Multi-Tenancy
- [ ] Family/household isolation
- [ ] Shared agent instances
- [ ] Role-based access control
- [ ] Usage quotas & billing

### Infrastructure
- [ ] PostgreSQL migration
- [ ] Docker deployment
- [ ] Kubernetes orchestration
- [ ] Redis caching
- [ ] Webhook support

### Collaboration
- [ ] Multiple family members
- [ ] Shared calendar permissions
- [ ] Comment/note system
- [ ] Activity feed

### Mobile
- [ ] React Native app
- [ ] Push notifications
- [ ] Mobile approval flow
- [ ] Quick actions (approve/reject)

### Machine Learning
- [ ] Confidence model training
- [ ] User feedback loop
- [ ] Pack auto-tuning
- [ ] Anomaly detection

### Pack Marketplace
- [ ] Community pack sharing
- [ ] Pack versioning
- [ ] Pack dependencies
- [ ] Pack analytics

---

## 🐛 Known Issues

### High Priority
- [ ] OAuth refresh token handling needs testing
- [ ] Duplicate detection across pack boundaries
- [ ] Manual edit detection not fully implemented
- [ ] Error recovery for partial failures

### Medium Priority
- [ ] Text extraction placeholder (returns null)
- [ ] No rollback mechanism for calendar writes
- [ ] Discovery evidence linking incomplete
- [ ] No rate limiting for API calls

### Low Priority
- [ ] No automated cleanup of old data
- [ ] Log rotation not configured
- [ ] No performance metrics
- [ ] Database vacuum not scheduled

---

## 💡 Future Ideas (Backlog)

- Smart suggestions based on past events
- Natural language config ("Watch emails from Colin's teacher")
- Voice interface (Alexa/Google Home)
- Calendar sharing with grandparents
- Export to other formats (CSV, iCal)
- Integration with task managers (Todoist, Things)
- Budget tracking for school expenses
- Carpool coordination
- Meal planning from school lunch menus
- Homework deadline tracking
- Report card notifications
- Volunteer hour tracking

---

## 🎯 Success Metrics

### v1.0 Goals
- [ ] Extract 95%+ of ICS events correctly
- [ ] Zero duplicate events created
- [ ] < 5% false positives requiring rejection
- [ ] Full audit trail for debugging
- [ ] Setup time < 15 minutes

### v1.1 Goals
- [ ] Text extraction accuracy > 80%
- [ ] Web UI completion rate > 90%
- [ ] User onboarding < 10 minutes

### v2.0 Goals
- [ ] Support 1000+ families
- [ ] 99.9% uptime
- [ ] < 5s p95 processing latency
- [ ] Mobile app 4.5+ star rating

---

## 🚦 Current Sprint

**Focus**: Complete v1.0 MVP

### This Week
1. ✅ Complete core architecture
2. ✅ Implement School Pack
3. ✅ Build discovery engine
4. 🚧 OAuth flow UI
5. 🚧 Digest builder

### Next Week
1. Manual approval CLI
2. Test fixtures & unit tests
3. Integration testing
4. Documentation polish
5. v1.0 release

---

**Last Updated**: 2025-12-27
