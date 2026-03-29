import fs from "node:fs";
import path from "node:path";
import { sendNotification, type NotificationRecipient } from "./notificationService";

export type BountyStatus =
  | "open"
  | "reserved"
  | "submitted"
  | "released"
  | "refunded"
  | "expired";

export type BountyTransitionType = "reserve" | "submit" | "release" | "refund" | "expire";

type AuditMetadataValue = string | number | boolean | null;

export interface BountyAuditLogRecord {
  id: string;
  bountyId: string;
  fromStatus: BountyStatus;
  toStatus: BountyStatus;
  transition: BountyTransitionType;
  actor: string;
  timestamp: number;
  metadata?: Record<string, AuditMetadataValue>;
}

export interface ListBountyAuditLogOptions {
  limit?: number;
  offset?: number;
}

export interface BountyAuditLogPage {
  data: BountyAuditLogRecord[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export interface BountyRecord {
  id: string;
  repo: string;
  issueNumber: number;
  title: string;
  summary: string;
  maintainer: string;
  contributor?: string;
  tokenSymbol: string;
  amount: number;
  labels: string[];
  status: BountyStatus;
  createdAt: number;
  deadlineAt: number;
  reservedAt?: number;
  submittedAt?: number;
  releasedAt?: number;
  releasedTxHash?: string;
  refundedAt?: number;
  refundedTxHash?: string;
  submissionUrl?: string;
  notes?: string;
}

export interface CreateBountyInput {
  repo: string;
  issueNumber: number;
  title: string;
  summary: string;
  maintainer: string;
  tokenSymbol: string;
  amount: number;
  deadlineDays: number;
  labels: string[];
}

interface CreateAuditLogInput {
  bountyId: string;
  fromStatus: BountyStatus;
  toStatus: BountyStatus;
  transition: BountyTransitionType;
  actor: string;
  timestamp?: number;
  metadata?: Record<string, AuditMetadataValue | undefined>;
}

function getStorePath(): string {
  if (process.env.BOUNTY_STORE_PATH?.trim()) {
    return path.resolve(process.env.BOUNTY_STORE_PATH.trim());
  }
  return path.resolve(__dirname, "../../data/bounties.json");
}

function getAuditStorePath(): string {
  if (process.env.BOUNTY_AUDIT_STORE_PATH?.trim()) {
    return path.resolve(process.env.BOUNTY_AUDIT_STORE_PATH.trim());
  }

  const base = getStorePath();
  return base.endsWith(".json") ? base.replace(/\.json$/i, ".audit.json") : `${base}.audit.json`;
}

const sampleBounties: BountyRecord[] = [
  {
    id: "BNT-0001",
    repo: "ritik4ever/stellar-stream",
    issueNumber: 41,
    title: "Add WebSocket updates for stream lifecycle changes",
    summary:
      "Push stream creation, cancel, and completion events to the dashboard without polling so recipients see updates instantly.",
    maintainer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    contributor: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    tokenSymbol: "XLM",
    amount: 150,
    labels: ["help wanted", "realtime"],
    status: "reserved",
    createdAt: 1710000000,
    deadlineAt: 1910000000,
    reservedAt: 1710003600,
  },
  {
    id: "BNT-0002",
    repo: "ritik4ever/stellar-stream",
    issueNumber: 42,
    title: "Build a recipient earnings export screen",
    summary:
      "Create a contributor-facing export view for released payouts with CSV download and per-asset grouping.",
    maintainer: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    tokenSymbol: "USDC",
    amount: 220,
    labels: ["frontend", "analytics"],
    status: "open",
    createdAt: 1710500000,
    deadlineAt: 1910500000,
  },
];

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function ensureStore(): void {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  ensureAuditStore();

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(sampleBounties, null, 2));
    return;
  }

  const raw = fs.readFileSync(storePath, "utf8").trim();
  if (!raw) {
    fs.writeFileSync(storePath, JSON.stringify(sampleBounties, null, 2));
  }
}

function ensureAuditStore(): void {
  const storePath = getAuditStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify([], null, 2));
    return;
  }

  const raw = fs.readFileSync(storePath, "utf8").trim();
  if (!raw) {
    fs.writeFileSync(storePath, JSON.stringify([], null, 2));
  }
}

function readStore(): BountyRecord[] {
  ensureStore();
  const storePath = getStorePath();
  return JSON.parse(fs.readFileSync(storePath, "utf8")) as BountyRecord[];
}

function writeStore(records: BountyRecord[]): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(records, null, 2));
}

function readAuditStore(): BountyAuditLogRecord[] {
  ensureAuditStore();
  return JSON.parse(fs.readFileSync(getAuditStorePath(), "utf8")) as BountyAuditLogRecord[];
}

function writeAuditStore(records: BountyAuditLogRecord[]): void {
  fs.writeFileSync(getAuditStorePath(), JSON.stringify(records, null, 2));
}

function nextAuditId(records: BountyAuditLogRecord[]): string {
  const highest = records.reduce((max, record) => {
    const numeric = Number(record.id.replace("AUD-", ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return `AUD-${String(highest + 1).padStart(6, "0")}`;
}

function cleanAuditMetadata(
  metadata?: Record<string, AuditMetadataValue | undefined>,
): Record<string, AuditMetadataValue> | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, AuditMetadataValue>;
}

function appendAuditLogs(inputs: CreateAuditLogInput[]): void {
  if (inputs.length === 0) {
    return;
  }

  const existing = readAuditStore();
  const next = [...existing];

  for (const input of inputs) {
    next.push({
      id: nextAuditId(next),
      bountyId: input.bountyId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      transition: input.transition,
      actor: input.actor,
      timestamp: input.timestamp ?? nowInSeconds(),
      metadata: cleanAuditMetadata(input.metadata),
    });
  }

  writeAuditStore(next);
}

function normalizeRecords(records: BountyRecord[]): BountyRecord[] {
  const now = nowInSeconds();
  let changed = false;
  const auditEntries: CreateAuditLogInput[] = [];

  const next = records.map((record) => {
    if ((record.status === "open" || record.status === "reserved") && now > record.deadlineAt) {
      changed = true;
      auditEntries.push({
        bountyId: record.id,
        fromStatus: record.status,
        toStatus: "expired",
        transition: "expire",
        actor: "system",
        timestamp: now,
        metadata: {
          reason: "deadline_passed",
          deadlineAt: record.deadlineAt,
        },
      });
      return {
        ...record,
        status: "expired" as const,
      };
    }
    return record;
  });

  if (changed) {
    writeStore(next);
    appendAuditLogs(auditEntries);
  }
  return next;
}

function nextId(records: BountyRecord[]): string {
  const max = records.reduce((highest, record) => {
    const numeric = Number(record.id.replace("BNT-", ""));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
  return `BNT-${String(max + 1).padStart(4, "0")}`;
}

function findBounty(records: BountyRecord[], id: string): BountyRecord {
  const bounty = records.find((record) => record.id === id);
  if (!bounty) {
    throw new Error("Bounty not found.");
  }
  return bounty;
}

function persistUpdated(records: BountyRecord[], updated: BountyRecord): BountyRecord {
  const next = records.map((record) => (record.id === updated.id ? updated : record));
  writeStore(next);
  return updated;
}

export function listBounties(): BountyRecord[] {
  const records = normalizeRecords(readStore());
  return [...records].sort((a, b) => b.createdAt - a.createdAt);
}

export function createBounty(input: CreateBountyInput): BountyRecord {
  const records = listBounties();
  const createdAt = nowInSeconds();
  const bounty: BountyRecord = {
    id: nextId(records),
    repo: input.repo,
    issueNumber: input.issueNumber,
    title: input.title,
    summary: input.summary,
    maintainer: input.maintainer,
    tokenSymbol: input.tokenSymbol.toUpperCase(),
    amount: Number(input.amount.toFixed(2)),
    labels: input.labels,
    status: "open",
    createdAt,
    deadlineAt: createdAt + input.deadlineDays * 24 * 60 * 60,
  };

  writeStore([bounty, ...records]);

  // Trigger notification on create
  const recipients: NotificationRecipient[] = [
    { role: 'maintainer', address: input.maintainer },
  ];
  
  // Non-blocking: notifications fire-and-forget
  sendNotification(recipients, 'bounty_created', {
    bountyId: bounty.id,
    repo: bounty.repo,
    issueNumber: bounty.issueNumber,
    title: bounty.title,
    status: bounty.status,
    maintainer: input.maintainer,
    amount: bounty.amount,
    tokenSymbol: bounty.tokenSymbol,
  }).catch(err => console.warn('[createBounty] Notification failed (non-blocking):', err));

  return bounty;
}

export function reserveBounty(id: string, contributor: string): BountyRecord {
  const records = listBounties();
  const bounty = findBounty(records, id);

  if (bounty.status !== "open") {
    throw new Error("Only open bounties can be reserved.");
  }

  const updated: BountyRecord = {
    ...bounty,
    contributor,
    status: "reserved",
    reservedAt: nowInSeconds(),
  };

  const persisted = persistUpdated(records, updated);
  appendAuditLogs([
    {
      bountyId: id,
      fromStatus: bounty.status,
      toStatus: "reserved",
      transition: "reserve",
      actor: contributor,
    },
  ]);
  return persisted;
}

export function submitBounty(
  id: string,
  contributor: string,
  submissionUrl: string,
  notes?: string,
): BountyRecord {
  const records = listBounties();
  const bounty = findBounty(records, id);

  if (bounty.status !== "reserved") {
    throw new Error("Only reserved bounties can be submitted.");
  }
  if (bounty.contributor !== contributor) {
    throw new Error("Only the reserved contributor can submit this bounty.");
  }

  const updated: BountyRecord = {
    ...bounty,
    status: "submitted",
    submittedAt: nowInSeconds(),
    submissionUrl,
    notes,
  };

  const persisted = persistUpdated(records, updated);
  appendAuditLogs([
    {
      bountyId: id,
      fromStatus: bounty.status,
      toStatus: "submitted",
      transition: "submit",
      actor: contributor,
      metadata: {
        submissionUrl,
        hasNotes: Boolean(notes?.trim()),
      },
    },
  ]);
  return persisted;
}

export function releaseBounty(id: string, maintainer: string, transactionHash?: string): BountyRecord {
  const records = listBounties();
  const bounty = findBounty(records, id);

  if (bounty.maintainer !== maintainer) {
    throw new Error("Maintainer address does not match this bounty.");
  }
  if (bounty.status !== "submitted") {
    throw new Error("Only submitted bounties can be released.");
  }

  const updated: BountyRecord = {
    ...bounty,
    status: "released",
    releasedAt: nowInSeconds(),
    releasedTxHash: transactionHash?.trim() ? transactionHash.trim() : bounty.releasedTxHash,
  };

  const persisted = persistUpdated(records, updated);
  appendAuditLogs([
    {
      bountyId: id,
      fromStatus: bounty.status,
      toStatus: "released",
      transition: "release",
      actor: maintainer,
      metadata: {
        transactionHash: updated.releasedTxHash,
      },
    },
  ]);
  return persisted;
}

export function refundBounty(id: string, maintainer: string, transactionHash?: string): BountyRecord {
  const records = listBounties();
  const bounty = findBounty(records, id);

  if (bounty.maintainer !== maintainer) {
    throw new Error("Maintainer address does not match this bounty.");
  }
  if (bounty.status === "released" || bounty.status === "refunded") {
    throw new Error("This bounty is already finalized.");
  }
  if (bounty.status === "submitted") {
    throw new Error("Submitted bounties must be reviewed before refund.");
  }

  const updated: BountyRecord = {
    ...bounty,
    status: "refunded",
    refundedAt: nowInSeconds(),
    refundedTxHash: transactionHash?.trim() ? transactionHash.trim() : bounty.refundedTxHash,
  };

  const persisted = persistUpdated(records, updated);
  appendAuditLogs([
    {
      bountyId: id,
      fromStatus: bounty.status,
      toStatus: "refunded",
      transition: "refund",
      actor: maintainer,
      metadata: {
        transactionHash: updated.refundedTxHash,
      },
    },
  ]);
  return persisted;
}

export function listBountyAuditLogs(
  id: string,
  options: ListBountyAuditLogOptions = {},
): BountyAuditLogPage {
  const records = listBounties();
  findBounty(records, id);

  const limit = Number.isFinite(options.limit) ? Math.trunc(options.limit as number) : 20;
  const offset = Number.isFinite(options.offset) ? Math.trunc(options.offset as number) : 0;
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  const all = readAuditStore()
    .filter((entry) => entry.bountyId === id)
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.id.localeCompare(b.id);
    });

  const data = all.slice(safeOffset, safeOffset + safeLimit);
  const total = all.length;
  const nextOffset = safeOffset + data.length < total ? safeOffset + data.length : null;

  return {
    data,
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total,
      hasMore: nextOffset !== null,
      nextOffset,
    },
  };
}
