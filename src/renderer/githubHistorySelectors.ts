import type { GitHubCommitAssociation, GitHubHistoryInsights } from "../shared/types";

export function createCommitAssociationMap(insights: GitHubHistoryInsights): Map<string, GitHubCommitAssociation> {
  return new Map(insights.commits.map((association) => [association.commitSha, association]));
}
