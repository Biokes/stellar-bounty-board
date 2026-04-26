import { ReactNode, useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import type { Bounty, BountyStatus } from "./types";
import CopyIcon from "./CopyIcons";

type BountyAction = "reserve" | "submit" | "release" | "refund";

type Props = {
  bounty: Bounty | null;
  loading: boolean;
  onBack: () => void;
  owner: string;
  avatarUrl: string;
  statusCopy: Record<BountyStatus, { label: string; description: string }>;
  actionCopy: Record<
    BountyStatus,
    Array<{ action: BountyAction; label: string; title: string }>
  >;
  renderActionButton: (
    bounty: Bounty,
    action: { action: BountyAction; label: string; title: string },
  ) => ReactNode;
  formatTimestamp: (value?: number) => string;
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
  const [bountyText, setBountyText] = useState("");
  const [maintainerText, setMaintainerText] = useState("");
  useEffect(() => {
    if (bounty) {
      setBountyText(bounty.id);
      setMaintainerText(bounty.maintainer);
    }
  }, [bounty]);
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
          <button
            type="button"
            className="secondary-button"
            onClick={onBack}
            disabled={loading}
          >
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
              {avatarUrl && (
                <img
                  className="repo-avatar"
                  src={avatarUrl}
                  alt={owner}
                  loading="lazy"
                />
              )}
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
                <strong>
                  {bounty.id}
                  <CopyIcon text={bountyText} />
                </strong>
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
                <strong>
                  {bounty.maintainer} <CopyIcon text={maintainerText} />
                </strong>
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
              <a
                className="submission-link"
                href={bounty.submissionUrl}
                target="_blank"
                rel="noreferrer"
              >
                Review submission <ArrowUpRight size={16} />
              </a>
            )}

            {bounty.notes && (
              <p className="status-helper">
                <strong>Notes:</strong> {bounty.notes}
              </p>
            )}

            <p className="status-helper">
              <strong>{statusCopy[bounty.status].label}:</strong>{" "}
              {statusCopy[bounty.status].description}
            </p>

            <div className="action-row action-row--detail">
              {(actionCopy[bounty.status] ?? []).map((action) =>
                renderActionButton(bounty, action),
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
