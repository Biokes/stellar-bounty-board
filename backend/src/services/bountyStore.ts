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

export type EventType =
  | "created"
  | "reserved"
  | "submitted"
  | "released"
  | "refunded"
  | "expired";

export interface BountyEvent {
  type: EventType;
  timestamp: number;
  actor?: string;
  details?: Record<string, unknown>;
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
  // Race condition prevention
  version: number;
  // Event history
  events: BountyEvent[];
  // Reservation timeout (in seconds from reservation)
  reservationTimeoutSeconds?: number;
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
  reservationTimeoutSeconds?: number;
}

function getStorePath(): string {
  if (process.env.BOUNTY_STORE_PATH?.trim()) {
    return path.resolve(process.env.BOUNTY_STORE_PATH.trim());
  }
  return path.resolve(__dirname, "../../data/bounties.json");
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
    version: 1,
    events: [
      { type: "created", timestamp: 1710000000 },
      { type: "reserved", timestamp: 1710003600, actor: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" },
    ],
    reservationTimeoutSeconds: 604800,
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
    version: 1,
    events: [{ type: "created", timestamp: 1710500000 }],
    reservationTimeoutSeconds: 604800,
  },
];

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function ensureStore(): void {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(sampleBounties, null, 2));
    return;
  }

  const raw = fs.readFileSync(storePath, "utf8").trim();
  if (!raw) {
    fs.writeFileSync(storePath, JSON.stringify(sampleBounties, null, 2));
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

function normalizeRecords(records: BountyRecord[]): BountyRecord[] {
  const now = nowInSeconds();
  let changed = false;

  const next = records.map((record) => {
    // Ensure events array exists (for backward compatibility)
    const events = record.events || [{ type: "created" as const, timestamp: record.createdAt }];

    // Check for expired deadline
    if ((record.status === "open" || record.status === "reserved") && now > record.deadlineAt) {
      changed = true;
      return {
        ...record,
        status: "expired" as const,
        events: [
          ...events,
          { type: "expired", timestamp: now },
        ],
      };
    }

    // Check for expired reservation (timeout without submission)
    if (
      record.status === "reserved" &&
      record.reservedAt &&
      record.reservationTimeoutSeconds &&
      now > record.reservedAt + record.reservationTimeoutSeconds
    ) {
      changed = true;
      return {
        ...record,
        status: "open" as const,
        contributor: undefined,
        reservedAt: undefined,
        events: [
          ...events,
          { type: "expired", timestamp: now, details: { reason: "reservation_timeout" } },
        ],
      };
    }

    // Ensure version and events exist for backward compatibility
    if (!record.version || !record.events) {
      changed = true;
      return {
        ...record,
        version: record.version || 1,
        events,
        reservationTimeoutSeconds: record.reservationTimeoutSeconds || 604800,
      };
    }

    return record;
  });

  if (changed) {
    writeStore(next);
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
    version: 1,
    events: [{ type: "created", timestamp: createdAt }],
    reservationTimeoutSeconds: input.reservationTimeoutSeconds ?? 604800,
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

export function reserveBounty(id: string, contributor: string, expectedVersion?: number): BountyRecord {
  const records = listBounties();
  const bounty = findBounty(records, id);

  if (bounty.status !== "open") {
    throw new Error("Only open bounties can be reserved.");
  }

  // Race condition prevention: check version if provided
  if (expectedVersion !== undefined && bounty.version !== expectedVersion) {
    throw new Error("Bounty was just reserved by someone else. Please refresh and try again.");
  }

  const now = nowInSeconds();
  const updated: BountyRecord = {
    ...bounty,
    contributor,
    status: "reserved",
    reservedAt: now,
    version: bounty.version + 1,
    events: [
      ...bounty.events,
      { type: "reserved", timestamp: now, actor: contributor },
    ],
  };

  return persistUpdated(records, updated);
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

  const now = nowInSeconds();
  const updated: BountyRecord = {
    ...bounty,
    status: "submitted",
    submittedAt: now,
    submissionUrl,
    notes,
    version: bounty.version + 1,
    events: [
      ...bounty.events,
      { type: "submitted", timestamp: now, actor: contributor },
    ],
  };

  return persistUpdated(records, updated);
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

  const now = nowInSeconds();
  const updated: BountyRecord = {
    ...bounty,
    status: "released",
    releasedAt: now,
    releasedTxHash: transactionHash?.trim() ? transactionHash.trim() : bounty.releasedTxHash,
    version: bounty.version + 1,
    events: [
      ...bounty.events,
      { type: "released", timestamp: now, actor: maintainer },
    ],
  };

  return persistUpdated(records, updated);
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

  const now = nowInSeconds();
  const updated: BountyRecord = {
    ...bounty,
    status: "refunded",
    refundedAt: now,
    refundedTxHash: transactionHash?.trim() ? transactionHash.trim() : bounty.refundedTxHash,
    version: bounty.version + 1,
    events: [
      ...bounty.events,
      { type: "refunded", timestamp: now, actor: maintainer },
    ],
  };

  return persistUpdated(records, updated);
}



export function getBountyEvents(id: string): BountyEvent[] {
  const records = listBounties();
  const bounty = findBounty(records, id);
  return bounty.events;
}

export interface MaintainerMetrics {
  maintainer: string;
  totalBounties: number;
  openCount: number;
  reservedCount: number;
  submittedCount: number;
  releasedCount: number;
  refundedCount: number;
  expiredCount: number;
  totalFunded: number;
  totalReleased: number;
  averageRewardAmount: number;
}

export function getMaintainerMetrics(maintainerAddress: string): MaintainerMetrics {
  const records = listBounties();
  const bounties = records.filter((b) => b.maintainer === maintainerAddress);

  const metrics: MaintainerMetrics = {
    maintainer: maintainerAddress,
    totalBounties: bounties.length,
    openCount: bounties.filter((b) => b.status === "open").length,
    reservedCount: bounties.filter((b) => b.status === "reserved").length,
    submittedCount: bounties.filter((b) => b.status === "submitted").length,
    releasedCount: bounties.filter((b) => b.status === "released").length,
    refundedCount: bounties.filter((b) => b.status === "refunded").length,
    expiredCount: bounties.filter((b) => b.status === "expired").length,
    totalFunded: bounties.reduce((sum, b) => sum + b.amount, 0),
    totalReleased: bounties
      .filter((b) => b.status === "released")
      .reduce((sum, b) => sum + b.amount, 0),
    averageRewardAmount: bounties.length > 0 ? bounties.reduce((sum, b) => sum + b.amount, 0) / bounties.length : 0,
  };

  return metrics;
}

export interface GlobalMetrics {
  totalBounties: number;
  openCount: number;
  reservedCount: number;
  submittedCount: number;
  releasedCount: number;
  refundedCount: number;
  expiredCount: number;
  totalFunded: number;
  totalReleased: number;
  uniqueMaintainers: number;
  uniqueContributors: number;
}

export function getGlobalMetrics(): GlobalMetrics {
  const records = listBounties();
  const maintainers = new Set(records.map((b) => b.maintainer));
  const contributors = new Set(records.filter((b) => b.contributor).map((b) => b.contributor!));

  return {
    totalBounties: records.length,
    openCount: records.filter((b) => b.status === "open").length,
    reservedCount: records.filter((b) => b.status === "reserved").length,
    submittedCount: records.filter((b) => b.status === "submitted").length,
    releasedCount: records.filter((b) => b.status === "released").length,
    refundedCount: records.filter((b) => b.status === "refunded").length,
    expiredCount: records.filter((b) => b.status === "expired").length,
    totalFunded: records.reduce((sum, b) => sum + b.amount, 0),
    totalReleased: records
      .filter((b) => b.status === "released")
      .reduce((sum, b) => sum + b.amount, 0),
    uniqueMaintainers: maintainers.size,
    uniqueContributors: contributors.size,
  };
}
