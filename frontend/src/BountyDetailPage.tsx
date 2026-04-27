import { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import type { Bounty, BountyEvent, BountyStatus, EventType } from "./types";

type BountyAction = "reserve" | "submit" | "release" | "refund";

type Props = {
  bounty: Bounty | null;
  loading: boolean;
  onBack: () => void;
  owner: string;
  avatarUrl: string;
  statusCopy: Record<BountyStatus, { label: string; description: string }>;
  actionCopy: Record<BountyStatus, Array<{ action: BountyAction; label: string; title: string }>>;
  renderActionButton: (
    bounty: Bounty,
    action: { action: BountyAction; label: string; title: string },
  ) => ReactNode;
  formatTimestamp: (value?: number) => string;
};

const timelineLabels: Record<EventType, string> = {
  created: "Created",
  reserved: "Reserved",
  submitted: "Submitted",
  released: "Released",
  refunded: "Refunded",
  expired: "Expired",
};

export default function BountyDetailPage({
  bounty,
  loading,
  onBack,
  owner,
  avatarUrl,
  statusCopy,
  actionCopy,
  renderActionButton,
  formatTimestamp,
}: Props) {
  const timelineEvents = bounty ? [...(bounty.events ?? [])] : [];
  if (bounty?.createdAt && !timelineEvents.some((event) => event.type === "created")) {
    timelineEvents.push({ type: "created", timestamp: bounty.createdAt });
  }
  const sortedTimeline = timelineEvents
    .filter((event) => Number.isFinite(event.timestamp))
    .sort((first, second) => first.timestamp - second.timestamp);
  const hasTimelineActivity = sortedTimeline.some((event) => event.type !== "created");

  const renderEventDetail = (event: BountyEvent) => {
    if (!bounty) {
      return null;
    }

    switch (event.type) {
      case "reserved": {
        const reserver = event.actor ?? bounty.contributor;
        return reserver ? `Reserved by ${reserver}.` : "Reserved.";
      }
      case "submitted": {
        const submissionUrl =
          typeof event.details?.submissionUrl === "string" ? event.details.submissionUrl : bounty.submissionUrl;
        if (!submissionUrl) {
          return "Submission received.";
        }
        return (
          <>
            Submission PR: {" "}
            <a className="inline-link" href={submissionUrl} target="_blank" rel="noreferrer">
              View pull request
            </a>
          </>
        );
      }
      case "released":
        return "Funds released to contributor.";
      case "refunded":
        return "Bounty refunded to maintainer.";
      default:
        return null;
    }
  };

  return (
    <div className="page-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="panel bounty-detail">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">Bounty</span>
            <h2>{bounty ? bounty.title : "Bounty"}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onBack} disabled={loading}>
            Back
          </button>
        </div>

        {loading && !bounty ? (
          <div className="empty-state">Loading bounty...</div>
        ) : !bounty ? (
          <div className="empty-state">Bounty not found.</div>
        ) : (
          <div className="bounty-detail__content">
            <div className="bounty-detail__hero">
              {avatarUrl && <img className="repo-avatar" src={avatarUrl} alt={owner} loading="lazy" />}
              <div>
                <span
                  className={`status-pill status-pill--${bounty.status}`}
                  title={statusCopy[bounty.status].description}
                >
                  {statusCopy[bounty.status].label}
                </span>
                <p className="bounty-summary">{bounty.summary}</p>
              </div>
              <div className="amount-chip">
                {bounty.amount} {bounty.tokenSymbol}
              </div>
            </div>

            <div className="meta-grid meta-grid--detail">
              <div>
                <span className="meta-label">Bounty ID</span>
                <strong>{bounty.id}</strong>
              </div>
              <div>
                <span className="meta-label">Issue</span>
                <strong>
                  <a
                    className="inline-link"
                    href={`https://github.com/${bounty.repo}/issues/${bounty.issueNumber}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {bounty.repo} #{bounty.issueNumber}
                  </a>
                </strong>
              </div>
              <div>
                <span className="meta-label">Created</span>
                <strong>{formatTimestamp(bounty.createdAt)}</strong>
              </div>
              <div>
                <span className="meta-label">Deadline</span>
                <strong>{formatTimestamp(bounty.deadlineAt)}</strong>
              </div>
              <div>
                <span className="meta-label">Maintainer</span>
                <strong>{bounty.maintainer}</strong>
              </div>
              <div>
                <span className="meta-label">Contributor</span>
                <strong>{bounty.contributor ?? "Open"}</strong>
              </div>
              {bounty.reservedAt && (
                <div>
                  <span className="meta-label">Reserved</span>
                  <strong>{formatTimestamp(bounty.reservedAt)}</strong>
                </div>
              )}
              {bounty.submittedAt && (
                <div>
                  <span className="meta-label">Submitted</span>
                  <strong>{formatTimestamp(bounty.submittedAt)}</strong>
                </div>
              )}
              {bounty.releasedAt && (
                <div>
                  <span className="meta-label">Released</span>
                  <strong>{formatTimestamp(bounty.releasedAt)}</strong>
                </div>
              )}
              {bounty.refundedAt && (
                <div>
                  <span className="meta-label">Refunded</span>
                  <strong>{formatTimestamp(bounty.refundedAt)}</strong>
                </div>
              )}
              {bounty.releasedTxHash && (
                <div>
                  <span className="meta-label">Release tx</span>
                  <strong>{bounty.releasedTxHash}</strong>
                </div>
              )}
              {bounty.refundedTxHash && (
                <div>
                  <span className="meta-label">Refund tx</span>
                  <strong>{bounty.refundedTxHash}</strong>
                </div>
              )}
            </div>

            {bounty.labels.length > 0 && (
              <div className="chip-row chip-row--spaced">
                {bounty.labels.map((label) => (
                  <span className="chip" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            )}

            {bounty.submissionUrl && (
              <a className="submission-link" href={bounty.submissionUrl} target="_blank" rel="noreferrer">
                Review submission <ArrowUpRight size={16} />
              </a>
            )}

            {bounty.notes && (
              <p className="status-helper">
                <strong>Notes:</strong> {bounty.notes}
              </p>
            )}

            <p className="status-helper">
              <strong>{statusCopy[bounty.status].label}:</strong> {statusCopy[bounty.status].description}
            </p>

            <div className="action-row action-row--detail">
              {(actionCopy[bounty.status] ?? []).map((action) => renderActionButton(bounty, action))}
            </div>

            <div className="timeline-section">
              <div className="timeline-header">
                <div>
                  <span className="panel-kicker">Activity</span>
                  <h3>Timeline</h3>
                </div>
              </div>
              {hasTimelineActivity ? (
                <div className="timeline-list">
                  {sortedTimeline.map((event, index) => (
                    <div className="timeline-item" key={`${event.type}-${event.timestamp}-${index}`}>
                      <span className={`timeline-dot timeline-dot--${event.type}`} />
                      <div className="timeline-content">
                        <div className="timeline-top">
                          <strong>{timelineLabels[event.type] ?? "Update"}</strong>
                          <span className="timeline-time">{formatTimestamp(event.timestamp)}</span>
                        </div>
                        {renderEventDetail(event) && <p>{renderEventDetail(event)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state timeline-empty">No activity yet beyond creation.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
