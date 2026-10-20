/**
 * Shift Ghost domain model.
 *
 * Every entity has a stable string id and ISO timestamps. Demo times are
 * wall-clock times stored as UTC ("2026-10-20T22:40:00Z" means 10:40 PM at the
 * restaurant) so the demo renders identically on any viewer's machine.
 */

export type ID = string;
export type ISO = string;

export type Role =
  | "closing_manager"
  | "opening_manager"
  | "kitchen_lead"
  | "area_manager"
  | "crew";

export type Severity = "critical" | "high" | "normal" | "watch";
export type Confidence = "high" | "review" | "uncertain";
export type Channel = "push" | "sms" | "email" | "team_chat";

/** The five buckets the brief asks the transformation to land in. */
export type ItemKind = "incident" | "inventory" | "customer" | "maintenance" | "task";

export type ItemSubtype =
  | "equipment"
  | "security"
  | "safety"
  | "stock"
  | "refund"
  | "complaint"
  | "callback"
  | "training"
  | "staffing"
  | "order"
  | "general";

export type Topic =
  | "refrigeration"
  | "cooking"
  | "sanitation"
  | "security"
  | "safety"
  | "tech"
  | "fire"
  | "water"
  | "beverage"
  | "facility"
  | "customer_money"
  | "stock"
  | "people";

export interface Organization {
  id: ID;
  name: string;
  industry: string;
  timezoneLabel: string;
  createdAt: ISO;
}

export interface ParLevel {
  qty: number;
  unit: string;
}

export interface Location {
  id: ID;
  orgId: ID;
  name: string;
  code: string;
  address: string;
  doorsOpen: string; // "HH:MM"
  lunchRush: string; // "HH:MM"
  pars: Record<string, ParLevel>;
}

export interface NotificationPrefs {
  briefingReady: Channel[];
  critical: Channel[];
  mentions: Channel[];
  quietHours: { start: string; end: string } | null;
}

export interface User {
  id: ID;
  orgId: ID;
  name: string;
  firstName: string;
  initials: string;
  role: Role;
  title: string;
  locationIds: ID[];
  /** Users who exist in the roster for name detection but don't sign in. */
  appUser: boolean;
  invitedAt?: ISO;
  inviteStatus?: "active" | "invited";
  notifications: NotificationPrefs;
}

export interface ShiftTemplate {
  id: ID;
  locationId: ID;
  name: string;
  kind: "open" | "mid" | "close";
  start: string; // HH:MM
  end: string; // HH:MM
  /** For closing shifts: when the closeout is due. For opening shifts: when the briefing is delivered. */
  handoffAt: string;
}

export interface ShiftInstance {
  id: ID;
  templateId: ID;
  locationId: ID;
  date: string; // YYYY-MM-DD
  kind: "open" | "mid" | "close";
  managerId: ID | null;
  startsAt: ISO;
  endsAt: ISO;
}

export interface CloseoutQuestion {
  id: ID;
  orgId: ID;
  prompt: string;
  hint: string;
  order: number;
  active: boolean;
  /** Library questions the wizard can swap in. */
  library?: boolean;
}

export interface TranscriptAnswer {
  questionId: ID | null;
  prompt: string;
  text: string;
  start: number; // offset in joined transcript
  end: number;
  durationSec: number;
  source: "voice" | "typed" | "seeded";
}

export type HandoffStatus = "draft" | "queued" | "processing" | "review" | "published";

/** A recording + transcript for one closeout. */
export interface Handoff {
  id: ID;
  orgId: ID;
  locationId: ID;
  shiftInstanceId: ID;
  authorId: ID;
  createdAt: ISO;
  submittedAt: ISO | null;
  publishedAt: ISO | null;
  publishedById: ID | null;
  status: HandoffStatus;
  mode: "guided" | "free";
  answers: TranscriptAnswer[];
  transcript: string;
  audio: {
    durationSec: number;
    hasRecording: boolean;
    retainedUntil: ISO | null;
    deletedAt: ISO | null;
    deletedById: ID | null;
  };
  /** Sentences the engine couldn't turn into an item; never silently dropped. */
  unmapped: TextSpan[];
  crewNotes: TextSpan[];
  /** Sentences that matched two categories and were merged into one item. */
  merges: { text: string; into: string; also: ItemKind }[];
  /** Set when processing deliberately failed (demo error state). */
  error?: string | null;
}

export interface TextSpan {
  start: number;
  end: number;
  text: string;
}

export interface EvidenceSpan extends TextSpan {
  id: ID;
  handoffId: ID;
  questionId: ID | null;
  role: "primary" | "context" | "action" | "handled";
}

export interface Inference {
  field: string;
  value: string;
  reason: string;
  /** Material inferences lower confidence; minor ones (e.g. "before lunch" → 11:30) don't. */
  material: boolean;
}

export interface ItemFields {
  assetKey?: string;
  assetLabel?: string;
  itemKey?: string;
  itemLabel?: string;
  qty?: number | null;
  unit?: string;
  par?: number | null;
  stockState?: "out" | "low" | "ok" | "order";
  transfer?: { direction: "out" | "in"; locationId: ID; qty: number | null } | null;
  ownerId?: ID | null;
  dueAt?: ISO | null;
  dueLabel?: string;
  customerRef?: string;
  topicLabel?: string;
  personName?: string;
  occurredAt?: ISO | null;
  laborMinutes?: number | null;
  handled?: boolean;
  handledNote?: string;
  recovery?: string;
  assertion?: "fault" | "ok";
  again?: boolean;
  reading?: { value: number; setpoint: number | null; unit: "°F" } | null;
  /** Set when a person resolves this mention as a false alarm; excluded from pattern counts. */
  falseAlarm?: { byId: ID; at: ISO; note: string } | null;
}

export type ItemStatus = "proposed" | "confirmed" | "corrected" | "dismissed";

export interface RuleHit {
  ruleId: ID;
  summary: string;
  matched: string;
}

export interface ExtractedItem {
  id: ID;
  handoffId: ID;
  locationId: ID;
  issueId: ID | null;
  kind: ItemKind;
  subtype: ItemSubtype;
  topic: Topic;
  subjectKey: string;
  title: string;
  facts: string[];
  severity: Severity;
  confidence: Confidence;
  confidenceReason: string;
  status: ItemStatus;
  evidenceIds: ID[];
  inferences: Inference[];
  /** Other categories the same sentence matched; merged to avoid duplicates. */
  mergedKinds: ItemKind[];
  fields: ItemFields;
  ruleHits: RuleHit[];
  ruleEffects: {
    notify: { role: Role; channel: Channel; ruleId: ID }[];
    tasks: { template: "order_prep" | "service_call" | "callback"; ruleId: ID }[];
    escalate: { role: Role; ruleId: ID }[];
    requireConfirmation: boolean;
  };
  proposedTask: {
    title: string;
    detail: string;
    kind: Task["kind"];
    ownerId: ID | null;
    dueAt: ISO | null;
    dueLabel: string | null;
  } | null;
  hedge: string | null;
  reviewedById: ID | null;
  reviewedAt: ISO | null;
  correctionNote?: string;
}

export type IssueStatus = "open" | "monitoring" | "resolved" | "false_alarm";

/** A persistent thread across shifts (e.g. "Downtown ice machine"). */
export interface Issue {
  id: ID;
  orgId: ID;
  locationId: ID;
  subjectKey: string;
  kind: ItemKind;
  topic: Topic;
  title: string;
  severity: Severity;
  status: IssueStatus;
  firstSeenAt: ISO;
  lastSeenAt: ISO;
  itemIds: ID[];
  ownerId: ID | null;
  resolvedAt: ISO | null;
  resolvedById: ID | null;
  resolutionNote: string | null;
  escalatedAt: ISO | null;
  escalatedToId: ID | null;
}

export type TaskStatus = "open" | "claimed" | "done";

export interface Task {
  id: ID;
  orgId: ID;
  locationId: ID;
  issueId: ID | null;
  itemIds: ID[];
  title: string;
  detail: string;
  kind: "call" | "service" | "order_prep" | "training" | "follow_up" | "staffing";
  ownerId: ID | null;
  claimedById: ID | null;
  claimedAt: ISO | null;
  status: TaskStatus;
  dueAt: ISO | null;
  dueLabel: string | null;
  createdAt: ISO;
  createdBy: "extraction" | "rule" | "person";
  ruleId: ID | null;
  resolvedAt: ISO | null;
  resolvedById: ID | null;
  resolutionNote: string | null;
  version: number;
  updatedAt: ISO;
  updatedById: ID | null;
}

export interface Incident {
  id: ID;
  locationId: ID;
  issueId: ID;
  itemId: ID;
  handoffId: ID;
  category: "maintenance" | "security" | "safety" | "general";
  severity: Severity;
  occurredAt: ISO | null;
  handled: boolean;
  laborMinutes: number | null;
  assertion: "fault" | "ok";
}

export interface InventoryFlag {
  id: ID;
  locationId: ID;
  itemId: ID;
  handoffId: ID;
  itemKey: string;
  label: string;
  onHand: number | null;
  unit: string;
  par: number | null;
  state: "out" | "low" | "ok" | "order";
  transfer: ItemFields["transfer"];
  raisedAt: ISO;
  clearedAt: ISO | null;
}

export type RuleTopic =
  | "refrigeration"
  | "fire"
  | "safety"
  | "security"
  | "water"
  | "customer_money"
  | "cooking";

export type RuleCondition =
  | { type: "mentions"; topic: RuleTopic }
  | { type: "below_par"; itemKey: string | "any" }
  | { type: "open_at"; subject: "refund" | "customer" | "any_task"; time: string }
  | { type: "uncertain" };

export type RuleAction =
  | { type: "set_severity"; severity: Severity }
  | { type: "notify"; role: Role; channel: Channel }
  | { type: "create_task"; template: "order_prep" | "service_call" | "callback" }
  | { type: "escalate"; role: Role }
  | { type: "require_confirmation" };

export interface EscalationRule {
  id: ID;
  orgId: ID;
  name: string;
  enabled: boolean;
  condition: RuleCondition;
  actions: RuleAction[];
  locationIds: ID[] | "all";
  createdById: ID;
  updatedAt: ISO;
}

export interface Acknowledgment {
  id: ID;
  entityType: "briefing" | "task" | "issue";
  entityId: ID;
  userId: ID;
  at: ISO;
}

export interface Comment {
  id: ID;
  entityType: "task" | "issue" | "item";
  entityId: ID;
  authorId: ID;
  toUserId: ID | null;
  kind: "question" | "reply" | "note";
  body: string;
  at: ISO;
}

export interface AuditEvent {
  id: ID;
  at: ISO;
  actorId: ID | null;
  action: string;
  entityType: string;
  entityId: ID;
  locationId: ID | null;
  summary: string;
  detail?: string;
}

export interface Notification {
  id: ID;
  userId: ID;
  at: ISO;
  title: string;
  body: string;
  href: string;
  severity: Severity;
  channel: Channel;
  readAt: ISO | null;
}

export interface Briefing {
  id: ID;
  locationId: ID;
  date: string; // opening date YYYY-MM-DD
  handoffId: ID;
  readyAt: ISO;
}

export interface Connector {
  id: ID;
  kind: "team_chat" | "scheduling" | "inventory" | "maintenance";
  name: string;
  description: string;
  status: "connected" | "available";
  target: string;
  deliveries: { id: ID; at: ISO; summary: string; ok: boolean }[];
}

export interface OrgSettings {
  retention: { audioDays: number; transcriptDays: number };
  thresholds: {
    escalateUnackedCriticalMinutes: number;
    patternMinMentions: number;
    patternWindowDays: number;
    lowStockPercentOfPar: number;
  };
}

export interface SetupProgress {
  step: number; // 0-based, 0..4
  completedAt: ISO | null;
  skipped: boolean;
  startedAt: ISO | null;
}

export interface OutboxEntry {
  id: ID;
  at: ISO;
  label: string;
  kind: "capture" | "action";
  refId: ID | null;
}

export interface DemoState {
  /** Wall-clock anchor of the demo clock. */
  clockAnchor: ISO;
  /** Real epoch ms when the anchor was set; the clock ticks from there. */
  clockSetAtMs: number;
  /** Freeze the clock (tests, screenshots). */
  clockFrozen: boolean;
  currentUserId: ID;
  currentLocationId: ID;
  network: "online" | "offline";
  outbox: OutboxEntry[];
  simulateConflictNext: boolean;
  failNextExtraction: boolean;
  /** Time-based rule firings already applied ("ruleId:taskId"). */
  firedTimers: string[];
  /** Whether the reviewer has seen the "handoff transformation" animation for a handoff. */
  seenTransform: ID[];
  guide: Record<GuideStep, ISO | null>;
}

export type GuideStep =
  | "configure"
  | "submit"
  | "confirm"
  | "switch"
  | "claim"
  | "pattern"
  | "explainer";

export interface DemoDB {
  schemaVersion: number;
  seq: number;
  organization: Organization;
  locations: Record<ID, Location>;
  users: Record<ID, User>;
  shiftTemplates: Record<ID, ShiftTemplate>;
  shiftInstances: Record<ID, ShiftInstance>;
  questions: Record<ID, CloseoutQuestion>;
  handoffs: Record<ID, Handoff>;
  evidence: Record<ID, EvidenceSpan>;
  items: Record<ID, ExtractedItem>;
  issues: Record<ID, Issue>;
  tasks: Record<ID, Task>;
  incidents: Record<ID, Incident>;
  inventoryFlags: Record<ID, InventoryFlag>;
  rules: Record<ID, EscalationRule>;
  acknowledgments: Record<ID, Acknowledgment>;
  comments: Record<ID, Comment>;
  audit: Record<ID, AuditEvent>;
  notifications: Record<ID, Notification>;
  briefings: Record<ID, Briefing>;
  connectors: Record<ID, Connector>;
  settings: OrgSettings;
  setup: SetupProgress;
  demo: DemoState;
}

export type TableName = {
  [K in keyof DemoDB]: DemoDB[K] extends Record<ID, { id: ID }> ? K : never;
}[keyof DemoDB];
