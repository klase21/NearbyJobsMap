import type { PostingStatus } from "../domain/posting-status";

export interface PostingLifecycleEvidence {
  explicitClosed?: boolean;
  explicitlyRemoved?: boolean;
  pageAccessible?: boolean;
  expiresAt?: string | null;
}

export function classifyPostingStatus(
  evidence: PostingLifecycleEvidence,
  now: Date,
  closingSoonDays = 3,
): PostingStatus {
  if (evidence.explicitlyRemoved) return "removed";
  if (evidence.explicitClosed) return "closed";
  if (evidence.pageAccessible === false) return "unknown";
  if (!evidence.expiresAt) return "unknown";
  const deadline = new Date(evidence.expiresAt);
  if (Number.isNaN(deadline.getTime())) return "unknown";
  const remaining = deadline.getTime() - now.getTime();
  if (remaining < 0) return "expired";
  if (remaining <= closingSoonDays * 86_400_000) return "closing_soon";
  return "active";
}
