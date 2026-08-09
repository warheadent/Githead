import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  UserRound,
  X,
  XCircle
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  GitHubCheckDetail,
  GitHubIssue,
  GitHubIssueDetail,
  GitHubPullRequest,
  GitHubPullRequestDetail,
  GitHubUserSummary
} from "../shared/types";
import { parseUnifiedDiff } from "./diffParser";
import { useGitHubDetail, type GitHubDetailSelection } from "./useGitHubQueries";

const MarkdownPreview = lazy(() => import("./MarkdownPreview.js").then((module) => ({ default: module.MarkdownPreview })));

export type ReviewConsoleSelection =
  | { itemType: "pullRequest"; item: GitHubPullRequest }
  | { itemType: "issue"; item: GitHubIssue };

interface ReviewConsoleProps {
  repoPath: string;
  githubFullName: string;
  selection: ReviewConsoleSelection;
  onClose: () => void;
  onCheckout: (pullRequest: GitHubPullRequest) => void;
  onOpenExternalUrl: (url: string) => void;
  onMerged: () => void;
}

type MutationKind = "approve" | "comment" | "merge";
type MutationState = { kind: MutationKind | null; message: string; error: string };

const IDLE_MUTATION: MutationState = { kind: null, message: "", error: "" };

export function ReviewConsole({
  repoPath,
  githubFullName,
  selection,
  onClose,
  onCheckout,
  onOpenExternalUrl,
  onMerged
}: ReviewConsoleProps): ReactNode {
  const itemSelection: GitHubDetailSelection = { itemType: selection.itemType, number: selection.item.number };
  const detail = useGitHubDetail<GitHubPullRequestDetail | GitHubIssueDetail>({ repoPath, githubFullName }, itemSelection);
  const [activeTab, setActiveTab] = useState("overview");
  const [comment, setComment] = useState("");
  const [mutation, setMutation] = useState<MutationState>(IDLE_MUTATION);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const mutationGeneration = useRef(0);
  const itemKey = `${selection.itemType}:${selection.item.number}`;
  const pullRequestDetail = selection.itemType === "pullRequest" && detail.data ? detail.data as GitHubPullRequestDetail : null;
  const issueDetail = selection.itemType === "issue" && detail.data ? detail.data as GitHubIssueDetail : null;
  const titleId = `review-console-title-${selection.itemType}-${selection.item.number}`;
  const externalUrl = detail.data?.url || selection.item.url;

  useEffect(() => {
    mutationGeneration.current += 1;
    setActiveTab("overview");
    setComment("");
    setMutation(IDLE_MUTATION);
    setConfirmMerge(false);
  }, [itemKey]);

  const runMutation = async (kind: MutationKind, operation: () => ReturnType<typeof window.githead.commentOnGitHubItem>): Promise<void> => {
    const generation = mutationGeneration.current + 1;
    mutationGeneration.current = generation;
    setMutation({ kind, message: mutationLabel(kind), error: "" });
    try {
      const result = await operation();
      if (generation !== mutationGeneration.current) return;
      if (!result.ok) {
        setMutation({ kind: null, message: "", error: result.error.message });
        return;
      }
      setMutation({ kind: null, message: result.data.message, error: "" });
      if (kind === "comment") setComment("");
      if (kind === "merge") onMerged();
      await detail.refresh().catch(() => undefined);
    } catch (error) {
      if (generation !== mutationGeneration.current) return;
      setMutation({ kind: null, message: "", error: error instanceof Error ? error.message : "The GitHub action failed." });
    }
  };

  const submitComment = (event: FormEvent): void => {
    event.preventDefault();
    if (!comment.trim() || mutation.kind) return;
    void runMutation("comment", () => window.githead.commentOnGitHubItem({
      repoPath,
      itemType: selection.itemType,
      number: selection.item.number,
      body: comment.trim(),
      operationId: createOperationId("comment")
    }));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape" || !event.currentTarget.contains(document.activeElement)) return;
    event.preventDefault();
    onClose();
  };

  const state = pullRequestDetail?.displayState ?? issueDetail?.state ?? (
    selection.itemType === "pullRequest" && selection.item.draft ? "draft" : selection.item.state
  );
  const authorLogin = detail.data?.author.login ?? selection.item.authorLogin;
  const updatedAt = detail.data?.updatedAt ?? selection.item.updatedAt;

  return (
    <aside className="review-console" role="region" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <header className="review-console-header">
        <div className="review-console-heading">
          <div className="review-console-title-line">
            <span className="review-console-number">#{selection.item.number}</span>
            <h2 id={titleId}>{detail.data?.title ?? selection.item.title}</h2>
          </div>
          <div className="review-console-meta">
            <StateBadge state={state} />
            <span>{authorLogin}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatDateTime(updatedAt)}</span>
          </div>
          {pullRequestDetail ? (
            <div className="review-console-branches" aria-label="Pull request branches">
              <span><GitBranch />{pullRequestDetail.sourceBranch || "Unknown source"}</span>
              <ArrowRight aria-hidden="true" />
              <span><GitBranch />{pullRequestDetail.targetBranch || "Unknown target"}</span>
            </div>
          ) : null}
        </div>
        <div className="review-console-header-actions">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenExternalUrl(externalUrl)}>
            Open on GitHub <ExternalLink />
          </Button>
          <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label="Close review console" tooltip="Close" onClick={onClose}>
            <X />
          </TooltipButton>
        </div>
      </header>

      {selection.itemType === "pullRequest" ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="review-console-tabs">
          <TabsList variant="line" aria-label="Pull request details" className="review-console-tab-list">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="files">Files{pullRequestDetail ? <span className="review-console-tab-count">{pullRequestDetail.files.length}</span> : null}</TabsTrigger>
            <TabsTrigger value="checks">Checks{pullRequestDetail ? <span className="review-console-tab-count">{pullRequestDetail.checks.length}</span> : null}</TabsTrigger>
            <TabsTrigger value="commits">Commits{pullRequestDetail ? <span className="review-console-tab-count">{pullRequestDetail.commitCount}</span> : null}</TabsTrigger>
          </TabsList>
          <DetailStatus detail={detail} />
          {pullRequestDetail ? (
            <>
              <TabsContent value="overview" className="review-console-tab-content">
                <PullRequestOverview detail={pullRequestDetail} comment={comment} commentRef={commentRef} mutation={mutation} onCommentChange={setComment} onSubmitComment={submitComment} />
              </TabsContent>
              <TabsContent value="files" className="review-console-tab-content"><FilesTab detail={pullRequestDetail} /></TabsContent>
              <TabsContent value="checks" className="review-console-tab-content"><ChecksTab checks={pullRequestDetail.checks} onOpenExternalUrl={onOpenExternalUrl} /></TabsContent>
              <TabsContent value="commits" className="review-console-tab-content"><CommitsTab detail={pullRequestDetail} /></TabsContent>
            </>
          ) : null}
        </Tabs>
      ) : (
        <div className="review-console-tabs">
          <div className="review-console-tab-list review-console-single-tab" role="tablist" aria-label="Issue details">
            <button type="button" role="tab" aria-selected="true">Overview</button>
          </div>
          <DetailStatus detail={detail} />
          {issueDetail ? <IssueOverview detail={issueDetail} comment={comment} commentRef={commentRef} mutation={mutation} onCommentChange={setComment} onSubmitComment={submitComment} onOpenExternalUrl={onOpenExternalUrl} /> : null}
        </div>
      )}

      <div className="review-console-mutation" aria-live="polite" aria-atomic="true">
        {mutation.error ? <p role="alert">{mutation.error}</p> : null}
        <span className="sr-only">{mutation.message}</span>
      </div>

      <footer className="review-console-footer">
        {selection.itemType === "pullRequest" ? (
          <>
            {confirmMerge ? (
              <div className="review-console-merge-confirmation" role="group" aria-label="Confirm merge">
                <span>Merge #{selection.item.number} into {pullRequestDetail?.targetBranch || "the target branch"}?</span>
                <Button type="button" variant="ghost" size="sm" disabled={Boolean(mutation.kind)} onClick={() => setConfirmMerge(false)}>Cancel</Button>
                <Button type="button" size="sm" disabled={Boolean(mutation.kind)} onClick={() => {
                  setConfirmMerge(false);
                  void runMutation("merge", () => window.githead.mergeGitHubPullRequest({ repoPath, number: selection.item.number, operationId: createOperationId("merge") }));
                }}>{mutation.kind === "merge" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <GitMerge />}Confirm merge</Button>
              </div>
            ) : (
              <>
                <Button type="button" size="sm" disabled={Boolean(mutation.kind) || !pullRequestDetail?.canMerge} title={getMergeDisabledReason(pullRequestDetail)} onClick={() => setConfirmMerge(true)}><GitMerge />Merge</Button>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(mutation.kind)} onClick={() => {
                  void runMutation("approve", () => window.githead.approveGitHubPullRequest({ repoPath, number: selection.item.number, operationId: createOperationId("approve") }));
                }}>{mutation.kind === "approve" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Check />}Approve</Button>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(mutation.kind)} onClick={() => onCheckout(selection.item)}><GitPullRequest />Checkout</Button>
              </>
            )}
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={Boolean(mutation.kind)} onClick={() => commentRef.current?.focus()}><MessageSquare />Comment</Button>
        )}
      </footer>
    </aside>
  );
}

function DetailStatus({ detail }: { detail: ReturnType<typeof useGitHubDetail<GitHubPullRequestDetail | GitHubIssueDetail>> }): ReactNode {
  if ((detail.status === "loading" || detail.status === "idle") && !detail.data) {
    return <div className="review-console-loading" role="status" aria-live="polite"><Loader2 className="animate-spin motion-reduce:animate-none" />Loading details</div>;
  }
  if (detail.error && !detail.data) {
    return <div className="review-console-load-error" role="alert"><p>{detail.error}</p><Button type="button" variant="outline" size="sm" onClick={() => void detail.refresh()}>Retry</Button></div>;
  }
  if (detail.status === "refreshing") return <span className="sr-only" role="status" aria-live="polite">Refreshing details</span>;
  if (detail.error && detail.data) return <div className="review-console-stale-error" role="status">Showing cached details. Refresh failed: {detail.error}</div>;
  return null;
}

function PullRequestOverview({ detail, comment, commentRef, mutation, onCommentChange, onSubmitComment }: {
  detail: GitHubPullRequestDetail;
  comment: string;
  commentRef: React.RefObject<HTMLTextAreaElement | null>;
  mutation: MutationState;
  onCommentChange: (value: string) => void;
  onSubmitComment: (event: FormEvent) => void;
}): ReactNode {
  const timeline = useMemo(() => [
    ...detail.comments.map((commentEntry) => ({ type: "comment" as const, at: commentEntry.createdAt, value: commentEntry })),
    ...detail.reviews.map((review) => ({ type: "review" as const, at: review.submittedAt, value: review }))
  ].sort((a, b) => a.at.localeCompare(b.at)), [detail.comments, detail.reviews]);
  return (
    <div className="review-console-overview">
      <main className="review-console-thread">
        <article className="review-console-description">
          <PersonHeader user={detail.author} date={detail.createdAt} />
          <Markdown text={detail.body || "No description provided."} />
        </article>
        {timeline.map((entry) => entry.type === "comment" ? (
          <article className="review-console-timeline-entry" key={`comment-${entry.value.id}`}>
            <PersonHeader user={entry.value.author} date={entry.value.createdAt} />
            {entry.value.kind === "review" && entry.value.path ? <p className="review-console-context"><FileCode2 />{entry.value.path}{entry.value.line ? ` · line ${entry.value.line}` : ""}</p> : null}
            <Markdown text={entry.value.body || "No comment body."} />
          </article>
        ) : (
          <article className={`review-console-review-event is-${entry.value.state}`} key={`review-${entry.value.id}`}>
            {entry.value.state === "approved" ? <CheckCircle2 /> : entry.value.state === "changes_requested" ? <XCircle /> : <MessageSquare />}
            <div><strong>{entry.value.author.login}</strong> {formatReviewState(entry.value.state)}<span>{formatDateTime(entry.value.submittedAt)}</span>{entry.value.body ? <Markdown text={entry.value.body} /> : null}</div>
          </article>
        ))}
        <CommentComposer value={comment} inputRef={commentRef} busy={mutation.kind === "comment"} onChange={onCommentChange} onSubmit={onSubmitComment} />
      </main>
      <MergeReadiness detail={detail} />
    </div>
  );
}

function MergeReadiness({ detail }: { detail: GitHubPullRequestDetail }): ReactNode {
  const passed = detail.checks.filter(isPassedCheck).length;
  const active = detail.checks.filter(isActiveCheck).length;
  const failed = detail.checks.length - passed - active;
  return (
    <aside className="review-console-inspector" aria-label="Merge readiness">
      <h3>Merge readiness</h3>
      <InspectorRow label="Overall"><MergeStatus status={detail.mergeStatus} /></InspectorRow>
      <InspectorRow label="Mergeability"><span>{detail.mergeable === null ? "Checking" : detail.mergeable ? "Mergeable" : "Not mergeable"}</span></InspectorRow>
      <InspectorRow label="Conflicts"><span className={detail.mergeStatus === "conflicting" ? "is-bad" : "is-good"}>{detail.mergeStatus === "conflicting" ? "Conflicts found" : "None reported"}</span></InspectorRow>
      <InspectorRow label="Review"><span>{formatReviewStatus(detail.reviewStatus)}</span></InspectorRow>
      <InspectorRow label="Requested reviewers"><span>{detail.requestedReviewers.length ? detail.requestedReviewers.map((reviewer) => reviewer.login).join(", ") : "None"}</span></InspectorRow>
      <InspectorRow label="CI checks"><span>{detail.checks.length ? `${passed} passed${active ? `, ${active} active` : ""}${failed ? `, ${failed} failed` : ""}` : "No checks"}</span></InspectorRow>
      <InspectorRow label="Commits"><span>{detail.commitCount}</span></InspectorRow>
      <InspectorRow label="Relationship"><span>{detail.branchRelationship}</span></InspectorRow>
      <InspectorRow label="Source"><code>{detail.sourceBranch || "-"}</code></InspectorRow>
      <InspectorRow label="Target"><code>{detail.targetBranch || "-"}</code></InspectorRow>
      <InspectorRow label="Ahead"><span>{detail.aheadBy}</span></InspectorRow>
      <InspectorRow label="Behind"><span>{detail.behindBy}</span></InspectorRow>
    </aside>
  );
}

function InspectorRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return <div className="review-console-inspector-row"><span>{label}</span><div>{children}</div></div>;
}

function MergeStatus({ status }: { status: GitHubPullRequestDetail["mergeStatus"] }): ReactNode {
  const positive = status === "ready" || status === "merged";
  const icon = positive ? <CheckCircle2 /> : status === "checking" ? <Clock3 /> : <XCircle />;
  return <span className={`review-console-merge-status ${positive ? "is-good" : status === "checking" ? "" : "is-bad"}`}>{icon}{formatMergeStatus(status)}</span>;
}

function FilesTab({ detail }: { detail: GitHubPullRequestDetail }): ReactNode {
  const [selectedPath, setSelectedPath] = useState(detail.files[0]?.path ?? "");
  useEffect(() => {
    if (!detail.files.some((file) => file.path === selectedPath)) setSelectedPath(detail.files[0]?.path ?? "");
  }, [detail.files, selectedPath]);
  const selected = detail.files.find((file) => file.path === selectedPath) ?? detail.files[0] ?? null;
  return (
    <div className="review-console-files">
      <div className="review-console-file-list" role="listbox" aria-label="Changed files">
        {detail.files.length ? detail.files.map((file) => (
          <button type="button" role="option" aria-selected={file.path === selected?.path} key={file.path} onClick={() => setSelectedPath(file.path)}>
            <span className="review-console-file-path">{file.path}</span>
            {file.previousPath ? <span className="review-console-previous-path">from {file.previousPath}</span> : null}
            <span className="review-console-file-meta"><span>{file.status}</span><span className="is-add">+{file.additions}</span><span className="is-delete">−{file.deletions}</span></span>
          </button>
        )) : <p className="review-console-empty">No changed files were returned.</p>}
      </div>
      <section className="review-console-file-diff" aria-label={selected ? `Diff for ${selected.path}` : "File diff"}>
        {selected ? <><header><div><strong>{selected.path}</strong>{selected.previousPath ? <span>Previously {selected.previousPath}</span> : null}</div><span><span className="is-add">+{selected.additions}</span> <span className="is-delete">−{selected.deletions}</span></span></header><Patch patch={selected.patch} /></> : <p className="review-console-empty">Select a changed file.</p>}
      </section>
    </div>
  );
}

function Patch({ patch }: { patch: string }): ReactNode {
  if (!patch) return <p className="review-console-empty">GitHub did not provide patch content for this file.</p>;
  const rows = parseUnifiedDiff(patch);
  return (
    <div className="review-console-patch diff-output text">
      {rows.map((row, index) => (
        <div className={`diff-row ${row.kind}`} key={`${index}-${row.oldLine}-${row.newLine}`}>
          <span className="diff-line-number">{row.oldLine ?? ""}</span>
          <span className="diff-line-number">{row.newLine ?? ""}</span>
          <span className="diff-marker">{row.marker}</span>
          <code className="diff-code">{row.text}</code>
        </div>
      ))}
    </div>
  );
}

function ChecksTab({ checks, onOpenExternalUrl }: { checks: GitHubCheckDetail[]; onOpenExternalUrl: (url: string) => void }): ReactNode {
  const groups = [
    { label: "Failed", checks: checks.filter((check) => !isPassedCheck(check) && !isActiveCheck(check)) },
    { label: "Active", checks: checks.filter(isActiveCheck) },
    { label: "Passed", checks: checks.filter(isPassedCheck) }
  ].filter((group) => group.checks.length);
  return <div className="review-console-checks">{groups.length ? groups.map((group) => <section key={group.label}><h3>{group.label}<span>{group.checks.length}</span></h3>{group.checks.map((check) => <div className="review-console-check-row" key={check.id || check.name}>{isActiveCheck(check) ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : isPassedCheck(check) ? <CheckCircle2 className="is-good" /> : <XCircle className="is-bad" />}<div><strong>{check.name}</strong><span>{check.status} · {check.conclusion ?? "pending"}</span></div>{check.detailsUrl ? <Button type="button" variant="ghost" size="sm" onClick={() => onOpenExternalUrl(check.detailsUrl)}>Details <ExternalLink /></Button> : null}</div>)}</section>) : <p className="review-console-empty">No CI checks were returned.</p>}</div>;
}

function CommitsTab({ detail }: { detail: GitHubPullRequestDetail }): ReactNode {
  return <div className="review-console-commits">{detail.commits.length ? detail.commits.map((commit) => <article key={commit.sha}><GitCommitHorizontal /><div><strong>{commit.message || "Untitled commit"}</strong><span>{commit.author} committed {formatDateTime(commit.authoredAt)}</span></div><code>{commit.shortSha}</code></article>) : <p className="review-console-empty">No commits were returned.</p>}</div>;
}

function IssueOverview({ detail, comment, commentRef, mutation, onCommentChange, onSubmitComment, onOpenExternalUrl }: {
  detail: GitHubIssueDetail;
  comment: string;
  commentRef: React.RefObject<HTMLTextAreaElement | null>;
  mutation: MutationState;
  onCommentChange: (value: string) => void;
  onSubmitComment: (event: FormEvent) => void;
  onOpenExternalUrl: (url: string) => void;
}): ReactNode {
  return (
    <div className="review-console-overview review-console-issue-overview">
      <main className="review-console-thread">
        <article className="review-console-description"><PersonHeader user={detail.author} date={detail.createdAt} /><Markdown text={detail.body || "No description provided."} /></article>
        {detail.comments.map((commentEntry) => <article className="review-console-timeline-entry" key={commentEntry.id}><PersonHeader user={commentEntry.author} date={commentEntry.createdAt} /><Markdown text={commentEntry.body || "No comment body."} /></article>)}
        <CommentComposer value={comment} inputRef={commentRef} busy={mutation.kind === "comment"} onChange={onCommentChange} onSubmit={onSubmitComment} />
      </main>
      <aside className="review-console-inspector" aria-label="Issue metadata">
        <h3>Issue details</h3>
        <InspectorRow label="Assignees"><span>{detail.assignees.length ? detail.assignees.map((assignee) => assignee.login).join(", ") : "None"}</span></InspectorRow>
        <InspectorRow label="Labels"><span>{detail.labels.length ? detail.labels.map((label) => label.name).join(", ") : "None"}</span></InspectorRow>
        <InspectorRow label="Milestone"><span>{detail.milestone?.title ?? "None"}</span></InspectorRow>
        <div className="review-console-linked-prs"><h4>Linked pull requests</h4>{detail.linkedPullRequests.length ? detail.linkedPullRequests.map((pullRequest) => <button type="button" key={pullRequest.number} onClick={() => onOpenExternalUrl(pullRequest.url)}><GitPullRequest /><span>#{pullRequest.number} {pullRequest.title}</span><small>{pullRequest.state}</small></button>) : <p>None</p>}</div>
      </aside>
    </div>
  );
}

function CommentComposer({ value, inputRef, busy, onChange, onSubmit }: {
  value: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}): ReactNode {
  return (
    <form className="review-console-composer" aria-label="Add a comment" onSubmit={onSubmit}>
      <label htmlFor="review-console-comment">Write a comment</label>
      <textarea id="review-console-comment" ref={inputRef} value={value} disabled={busy} placeholder="Leave a comment" onChange={(event) => onChange(event.target.value)} />
      <div><span>Markdown supported</span><Button type="submit" size="sm" disabled={busy || !value.trim()}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <MessageSquare />}Add comment</Button></div>
    </form>
  );
}

function PersonHeader({ user, date }: { user: GitHubUserSummary; date: string }): ReactNode {
  return <header className="review-console-person">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span aria-hidden="true"><UserRound /></span>}<div><strong>{user.login}</strong><time dateTime={date}>{formatDateTime(date)}</time></div></header>;
}

function Markdown({ text }: { text: string }): ReactNode {
  return <div className="review-console-markdown"><Suspense fallback={<p>Loading Markdown…</p>}><MarkdownPreview text={text} /></Suspense></div>;
}

function StateBadge({ state }: { state: string }): ReactNode {
  return <span className={`review-console-state is-${state.toLowerCase()}`}><CircleDot />{capitalize(state)}</span>;
}

function isPassedCheck(check: GitHubCheckDetail): boolean {
  return check.status === "completed" && check.conclusion !== null && ["success", "neutral", "skipped"].includes(check.conclusion);
}

function isActiveCheck(check: GitHubCheckDetail): boolean {
  return check.status !== "completed";
}

function formatDateTime(value: string): string {
  if (!value) return "unknown time";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatReviewState(state: string): string {
  if (state === "approved") return "approved these changes";
  if (state === "changes_requested") return "requested changes";
  if (state === "dismissed") return "had a review dismissed";
  return "reviewed these changes";
}

function formatReviewStatus(status: GitHubPullRequestDetail["reviewStatus"]): string {
  if (status === "changesRequested") return "Changes requested";
  if (status === "reviewRequired") return "Review required";
  if (status === "approved") return "Approved";
  return "No reviews";
}

function formatMergeStatus(status: GitHubPullRequestDetail["mergeStatus"]): string {
  return ({ ready: "Ready to merge", blocked: "Blocked", conflicting: "Conflicts", checking: "Checking", closed: "Closed", merged: "Merged", draft: "Draft" })[status];
}

function getMergeDisabledReason(detail: GitHubPullRequestDetail | null): string | undefined {
  if (!detail) return "Mergeability is still loading.";
  if (detail.canMerge) return undefined;
  if (detail.mergeStatus === "conflicting") return "GitHub reports merge conflicts.";
  return `Merge is unavailable while the pull request is ${formatMergeStatus(detail.mergeStatus).toLowerCase()}.`;
}

function mutationLabel(kind: MutationKind): string {
  return kind === "approve" ? "Approving pull request" : kind === "merge" ? "Merging pull request" : "Adding comment";
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : "Unknown";
}

function createOperationId(kind: MutationKind): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `github-${kind}-${suffix}`;
}
