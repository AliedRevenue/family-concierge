/**
 * Core Type Definitions for Family Concierge Agent
 * All domain models and interfaces are defined here
 */

// ========================================
// Agent Modes
// ========================================

export type AgentMode = 'copilot' | 'autopilot' | 'dry-run';

// ========================================
// Email Categories
// ========================================

export enum EmailCategory {
  SCHOOL = 'school',
  SPORTS_ACTIVITIES = 'sports_activities',
  MEDICAL_HEALTH = 'medical_health',
  FRIENDS_SOCIAL = 'friends_social',
  LOGISTICS = 'logistics',
  FORMS_ADMIN = 'forms_admin',
  FINANCIAL_BILLING = 'financial_billing',
  COMMUNITY_OPTIONAL = 'community_optional',
}

export type Sensitivity = 'conservative' | 'balanced' | 'broad' | 'off';

export const SENSITIVITY_THRESHOLDS: Record<Sensitivity, number> = {
  conservative: 0.85,
  balanced: 0.75,
  broad: 0.65,
  off: 1.0, // Effectively disabled
};

export interface CategoryPreferences {
  enabled: EmailCategory[];
  sensitivity: Record<EmailCategory, Sensitivity>;
}

export const DEFAULT_CATEGORY_PREFERENCES: CategoryPreferences = {
  enabled: [
    EmailCategory.SCHOOL,
    EmailCategory.SPORTS_ACTIVITIES,
    EmailCategory.MEDICAL_HEALTH,
    EmailCategory.LOGISTICS,
    EmailCategory.FORMS_ADMIN,
  ],
  sensitivity: {
    [EmailCategory.SCHOOL]: 'balanced',
    [EmailCategory.SPORTS_ACTIVITIES]: 'balanced',
    [EmailCategory.MEDICAL_HEALTH]: 'conservative',
    [EmailCategory.FRIENDS_SOCIAL]: 'conservative',
    [EmailCategory.LOGISTICS]: 'balanced',
    [EmailCategory.FORMS_ADMIN]: 'balanced',
    [EmailCategory.FINANCIAL_BILLING]: 'conservative',
    [EmailCategory.COMMUNITY_OPTIONAL]: 'off',
  },
};

export interface EmailCategorization {
  primaryCategory: EmailCategory;
  secondaryCategories: EmailCategory[];
  categoryScores: Record<EmailCategory, number>;
  finalConfidence: number;
  shouldSave: boolean;
  saveReasons?: string[];
}

// ========================================
// Pack System
// ========================================

export interface Pack {
  id: string;
  name: string;
  version: string;
  description: string;
  priority: number; // Higher wins conflicts (1-100)
  discoveryRules: DiscoveryRules;
  defaultConfig: PackConfig;
  categoryPreferences?: CategoryPreferences; // Category filtering config
}

export interface DiscoveryRules {
  senderPatterns: SenderPattern[];
  keywordSets: KeywordSet[];
  platformDetectors: PlatformDetector[];
  attachmentIndicators: AttachmentIndicator[];
}

export interface SenderPattern {
  type: 'domain' | 'email' | 'regex';
  pattern: string;
  confidence: number; // 0-1
  description: string;
}

export interface KeywordSet {
  category: string; // e.g., "child_names", "event_types"
  keywords: string[];
  context?: string; // Where to look: subject | body | all
  confidence: number;
}

export interface PlatformDetector {
  name: string; // e.g., "SignupGenius", "ParentSquare"
  indicators: {
    domains?: string[];
    headers?: Record<string, string>;
    bodyPatterns?: string[];
  };
  confidence: number;
}

export interface AttachmentIndicator {
  type: 'ics' | 'pdf' | 'image';
  filenamePatterns?: string[];
  mimeTypes?: string[];
  extractable: boolean; // v1: only true for 'ics'
}

export interface PackConfig {
  sources: Source[];
  extractionHints: ExtractionHints;
  eventDefaults: EventDefaults;
  forwarding?: ForwardingConfig;
}

export interface ForwardingConfig {
  enabled: boolean;
  forwardTo: string[];
  conditions: ForwardingCondition[];
  includeOriginal: boolean; // Attach original email as .eml
  subjectPrefix?: string; // e.g., "[FCA] "
}

export interface ForwardingCondition {
  type: 'no_event_found' | 'keyword_match' | 'always' | 'confidence_below';
  value?: string | string[] | number; // Keywords, confidence threshold, etc.
  excludePatterns?: string[]; // Skip forwarding if these patterns match
}

export interface Source {
  name: string;
  type: 'email';
  fromDomains?: string[];
  fromAddresses?: string[];
  keywords?: string[];
  requiredKeywords?: string[]; // All must be present
  label?: string; // Gmail label to apply/filter
  enabled: boolean;
}

export interface ExtractionHints {
  preferIcsOverText: boolean;
  dateFormats?: string[]; // Hint for ambiguous parsing
  defaultDuration: number; // minutes
  fallbackTime?: string; // HH:mm
  requireExplicitTime: boolean; // Never infer times if true
}

export interface EventDefaults {
  durationMinutes: number;
  reminderMinutes?: number[];
  color?: string; // Calendar color ID
}

// ========================================
// Configuration System
// ========================================

export interface AgentConfig {
  version: string;
  createdAt: string;
  updatedAt: string;
  packs: EnabledPack[];
  calendar: CalendarConfig;
  invites: InvitePolicy;
  confidence: ConfidenceThresholds;
  defaults: GlobalDefaults;
  processing: ProcessingConfig;
  notifications: NotificationConfig;
  digests?: DigestConfig;
  schedule?: ScheduleConfig;
}

export interface EnabledPack {
  packId: string;
  priority: number; // User can override pack default priority
  config: PackConfig; // User-approved/edited version
}

export interface CalendarConfig {
  calendarId: string; // 'primary' or specific calendar ID
  timezone: string; // IANA timezone
}

export interface InvitePolicy {
  defaultGuests: string[];
  policy: 'always' | 'conditional' | 'manual';
  conditionalRules?: ConditionalRule[];
}

export interface ConditionalRule {
  condition: 'pack' | 'keyword' | 'confidence';
  value: string | number;
  guests: string[];
}

export interface ConfidenceThresholds {
  autoCreate: number; // 0-1
  autoUpdate: number; // 0-1
  requireReviewBelow: number; // 0-1
}

export interface GlobalDefaults {
  eventDurationMinutes: number;
  fallbackTime: string; // HH:mm
  createIfTimeUnknown: boolean;
}

export interface ProcessingConfig {
  maxEmailsPerRun: number;
  lookbackDays: number;
  deduplicationWindowDays: number;
}

export interface NotificationConfig {
  email: string;
  sendOnError: boolean;
  sendDigests: boolean;
}

export interface DigestConfig {
  frequency: 'daily' | 'weekly' | 'biweekly' | string; // Can be cron expression
  recipients?: string[]; // Multiple recipients (new)
  recipient?: string; // Single recipient (deprecated, for backward compatibility)
  includeForwarded: boolean;
  includePending: boolean;
  includeSummary?: boolean; // Whether to include kids' activity summary at top
  categoryPreferences?: CategoryPreferences; // Optional override
}

export interface ScheduleConfig {
  agentRuns?: string; // Cron expression
  cleanup?: string; // Cron expression
}

// ========================================
// Discovery System
// ========================================

export interface DiscoverySession {
  id: string;
  packId: string;
  startedAt: string;
  completedAt?: string;
  emailsScanned: number;
  status: 'running' | 'completed' | 'failed';
  output: DiscoveryOutput;
}

export interface DiscoveryOutput {
  proposedConfig: ProposedConfigPatch;
  evidence: Evidence[];
  stats: DiscoveryStats;
}

export interface ProposedConfigPatch {
  sources: ProposedSource[];
  keywords: ProposedKeyword[];
  platforms: DetectedPlatform[];
  suggestedLabels: string[];
}

export interface ProposedSource {
  suggested: boolean;
  name: string;
  type: 'email';
  fromDomains?: string[];
  fromAddresses?: string[];
  confidence: number;
  evidenceIds: string[]; // References Evidence.id
  userApproved?: boolean;
}

export interface ProposedKeyword {
  keyword: string;
  category: string;
  frequency: number;
  confidence: number;
  evidenceIds: string[];
  userApproved?: boolean;
}

export interface DetectedPlatform {
  name: string;
  confidence: number;
  exampleMessageIds: string[];
}

export interface Evidence {
  id: string;
  messageId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  relevanceScore: number;
  matchedRules: string[];
}

export interface DiscoveryStats {
  totalEmailsScanned: number;
  relevantEmailsFound: number;
  uniqueSendersFound: number;
  uniqueDomainsFound: number;
  icsAttachmentsFound: number;
  averageConfidence: number;
}

// ========================================
// Event Extraction & Management
// ========================================

export interface ExtractedEvent {
  fingerprint: string; // Computed hash
  sourceMessageId: string;
  sourcePack: string;
  extractionMethod: 'ics' | 'text';
  confidence: number;
  event: EventIntent;
  metadata: ExtractionMetadata;
  provenance: ExtractionProvenance;
}

export interface ExtractionProvenance {
  method: 'ics' | 'text' | 'manual';
  confidence: number;
  confidenceReasons: ConfidenceReason[];
  assumptions: string[];
  sourceEmailPermalink?: string; // Gmail message URL
  extractedAt: string;
}

export interface ConfidenceReason {
  factor: string; // 'explicit_time', 'ics_attachment', 'date_in_future', etc.
  weight: number; // 0-1
  value: boolean | string | number;
  description?: string;
}

export interface EventIntent {
  title: string;
  description?: string;
  location?: string;
  startDateTime: string; // ISO 8601
  endDateTime: string; // ISO 8601
  allDay: boolean;
  timezone: string;
  guests?: string[];
  reminders?: number[]; // Minutes before
  color?: string;
}

export interface ExtractionMetadata {
  extractedAt: string;
  extractorVersion: string;
  rawData?: unknown; // Original ICS or text snippet
  confidenceFactors: ConfidenceFactors;
}

export interface ConfidenceFactors {
  hasIcsAttachment?: number;
  knownSender?: number;
  clearDateTime?: number;
  keywordMatch?: number;
  platformRecognized?: number;
}

export interface EventFingerprint {
  messageId: string;
  titleNormalized: string; // Lowercase, trimmed, special chars removed
  dateKey: string; // YYYY-MM-DD
  timeKey: string; // HH:mm or 'allday'
}

// ========================================
// Calendar Operations
// ========================================

export interface CalendarOperation {
  id: string;
  type: 'create' | 'update' | 'flag' | 'skip';
  eventFingerprint: string;
  eventIntent: EventIntent;
  reason: string;
  requiresApproval: boolean;
  createdAt: string;
  executedAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  error?: string;
  calendarEventId?: string; // Google Calendar event ID after creation
}

export interface ManualEditFlag {
  eventFingerprint: string;
  calendarEventId: string;
  detectedAt: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  reconciliationPolicy: 'respect_manual' | 'flag_conflict';
}

// ========================================
// State & Persistence
// ========================================

export interface ProcessedMessage {
  messageId: string;
  processedAt: string;
  packId: string;
  extractionStatus: 'success' | 'failed' | 'skipped';
  eventsExtracted: number;
  fingerprints: string[];
  error?: string;
}

export interface PersistedEvent {
  id: string;
  fingerprint: string;
  sourceMessageId: string;
  packId: string;
  calendarEventId?: string;
  eventIntent: EventIntent;
  confidence: number;
  status: 'pending_approval' | 'approved' | 'created' | 'updated' | 'flagged' | 'failed';
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  manuallyEdited: boolean;
  error?: string;
  provenance?: ExtractionProvenance; // Added for Phase 2
}

export interface ConfigVersion {
  id: string;
  version: number;
  config: AgentConfig;
  createdAt: string;
  createdBy: 'system' | 'user' | 'discovery';
  previousVersionId?: string;
}

export interface Exception {
  id: string;
  timestamp: string;
  type: 'extraction_error' | 'calendar_error' | 'duplicate_detected' | 'api_error' | 'forwarding_error' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  context: {
    messageId?: string;
    eventFingerprint?: string;
    packId?: string;
    stack?: string;
    [key: string]: unknown;
  };
  resolved: boolean;
  resolvedAt?: string;
}

// ========================================
// Email Forwarding
// ========================================

export interface ForwardedMessage {
  id: string;
  sourceMessageId: string;
  forwardedAt: string;
  forwardedTo: string[];
  packId: string;
  reason: string;
  conditions: ForwardingCondition[];
  success: boolean;
  error?: string;
}

// ========================================
// Digest & User Notifications
// ========================================

export interface Digest {
  id: string;
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: DigestSummary;
  sections: DigestSection[];
  stats: DigestStats;
  metadata?: any; // For passing raw data through digest pipeline
}

export interface DigestSummary {
  totalEmailsProcessed: number;
  eventsExtracted: number;
  eventsCreated: number;
  eventsUpdated: number;
  pendingApproval: number;
  emailsForwarded: number;
  errors: number;
  approvedPending?: number;
}

export interface DigestStats {
  emailsScanned: number;
  eventsCreated: number;
  eventsPending: number;
  emailsForwarded: number;
  errors: number;
}

export interface DigestSection {
  title: string;
  type: 'pending_approval' | 'created' | 'updated' | 'errors' | 'flagged' | 'forwarded' | 'approved_pending';
  items: DigestItem[];
}

export interface DigestItem {
  // Event-related fields
  eventTitle?: string;
  eventDate?: string;
  confidence?: number;
  source?: string; // Email subject or sender
  action?: string; // "Awaiting approval", "Created", etc.
  calendarEventId?: string;
  error?: string;
  
  // Email-related fields (forwarded & approved pending)
  subject?: string;
  from?: string;
  snippet?: string;
  forwardedTo?: string[];
  approvalToken?: string; // For pending approvals
  
  // Enhanced display fields
  id?: string;
  title?: string;
  description?: string;
  date?: string;
  relevanceScore?: number;
  metadata?: any;
  
  // New enhanced presentation fields
  summaryFact?: string;        // "Class photos available to view"
  fromName?: string;           // "Andi Pieper"
  fromEmail?: string;          // "noreply@veracross.com"
  category?: string;           // "school"
  categoryGroup?: string;       // "School Updates"
  categoryIcon?: string;       // "🏫"
  excerpt?: string;            // First 300-500 chars, escaped
  gmailLink?: string;          // Deep link to email in Gmail
  messageId?: string;          // For link construction
}

// ========================================
// Approval System
// ========================================

export interface ApprovalToken {
  id: string;
  operationId: string;
  createdAt: string;
  expiresAt: string; // 2 hours from creation
  approved: boolean;
  approvedAt?: string;
  used: boolean; // Prevent double-use
}

// ========================================
// Logging & Audit
// ========================================

export interface AuditLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  action: string;
  details: Record<string, unknown>;
  messageId?: string;
  eventFingerprint?: string;
  userId?: string;
}
