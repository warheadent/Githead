import type { GitCommitGraphRow } from "../shared/types";

export const COMMIT_GRAPH_ROW_HEIGHT = 28;
export const COMMIT_GRAPH_LANE_WIDTH = 18;
export const COMMIT_GRAPH_PADDING_X = 14;
export const COMMIT_GRAPH_MIN_WIDTH = 82;
export const COMMIT_GRAPH_COLOR_COUNT = 8;

export interface CommitGraphNode {
  hash: string;
  row: number;
  lane: number;
  x: number;
  y: number;
  isMerge: boolean;
}

export interface CommitGraphEdge {
  id: string;
  fromHash: string;
  toHash: string;
  fromRow: number;
  toRow: number;
  fromLane: number;
  toLane: number;
  colorLane: number;
  continues: boolean;
  path: string;
}

export interface CommitGraphLayout {
  width: number;
  height: number;
  rowHeight: number;
  nodes: CommitGraphNode[];
  edges: CommitGraphEdge[];
}

interface PendingEdge {
  from: CommitGraphNode;
  parent: string;
  lane: number;
}

// Input is newest-first topological order, as returned by git log --topo-order.
export function buildCommitGraphLayout(
  commits: GitCommitGraphRow[],
  mainBranchRefs: readonly string[] = ["main", "master", "origin/main", "origin/master"]
): CommitGraphLayout {
  const rowHeight = COMMIT_GRAPH_ROW_HEIGHT;
  // Reserve the main branch before visiting newer feature tips. Its first-parent
  // history then owns lane zero both before and after a feature is merged.
  const mainTip = mainBranchRefs.map((name) => commits.find((commit) => commit.refs.some((ref) => (
    (ref.kind === "branch" || ref.kind === "remote") && ref.name === name
  )))).find((commit) => commit !== undefined);
  const activeLanes: Array<string | null> = mainTip ? [mainTip.hash] : [];
  const nodes: CommitGraphNode[] = [];
  const pendingEdges: PendingEdge[] = [];
  const nodeByHash = new Map<string, CommitGraphNode>();
  let maxLane = 0;

  commits.forEach((commit, row) => {
    const existingLane = activeLanes.indexOf(commit.hash);
    const lane = existingLane === -1 ? getFirstEmptyLane(activeLanes) : existingLane;
    const parents = [...new Set(commit.parents)];
    const node: CommitGraphNode = {
      hash: commit.hash,
      row,
      lane,
      x: getLaneX(lane),
      y: row * rowHeight + rowHeight / 2,
      isMerge: parents.length > 1
    };
    nodes.push(node);
    nodeByHash.set(commit.hash, node);
    maxLane = Math.max(maxLane, lane);

    // Keep incoming tracks reserved until their common ancestor is reached.
    // Joining earlier hides the branch's color and makes crossings ambiguous.
    for (let index = 0; index < activeLanes.length; index += 1) {
      if (activeLanes[index] === commit.hash) activeLanes[index] = null;
    }

    parents.forEach((parent, index) => {
      const existingParentLane = activeLanes.indexOf(parent);
      const parentLane = index === 0
        ? lane
        : existingParentLane === -1 ? getFirstEmptyLane(activeLanes) : existingParentLane;
      activeLanes[parentLane] = parent;
      maxLane = Math.max(maxLane, parentLane);
      pendingEdges.push({ from: node, parent, lane: parentLane });
    });

    while (activeLanes.length > 0 && activeLanes.at(-1) == null) activeLanes.pop();
  });

  const height = commits.length * rowHeight;
  const edges = pendingEdges.map(({ from, parent, lane }): CommitGraphEdge => {
    const target = nodeByHash.get(parent);
    // Missing parents continue to the boundary, including from the final row.
    const toRow = target?.row ?? commits.length;
    const toLane = target?.lane ?? lane;
    return {
      id: `${from.hash}:${parent}`,
      fromHash: from.hash,
      toHash: parent,
      fromRow: from.row,
      toRow,
      fromLane: from.lane,
      toLane,
      colorLane: lane,
      continues: !target,
      path: createEdgePath(from, lane, getLaneX(toLane), target?.y ?? height)
    };
  });

  return {
    width: Math.max(COMMIT_GRAPH_MIN_WIDTH, COMMIT_GRAPH_PADDING_X * 2 + maxLane * COMMIT_GRAPH_LANE_WIDTH),
    height,
    rowHeight,
    nodes,
    edges
  };
}

function createEdgePath(from: CommitGraphNode, lane: number, endX: number, endY: number): string {
  const trackX = getLaneX(lane);
  const bendHeight = COMMIT_GRAPH_ROW_HEIGHT / 2;
  const controlOffset = bendHeight / 2;
  let path = `M ${from.x} ${from.y}`;

  // Change tracks between row centers so wide merges never run through a node.
  if (from.x !== trackX) {
    path += ` C ${from.x} ${from.y + controlOffset}, ${trackX} ${from.y + controlOffset}, ${trackX} ${from.y + bendHeight}`;
  }
  if (trackX !== endX) {
    path += ` L ${trackX} ${endY - bendHeight}`;
    path += ` C ${trackX} ${endY - controlOffset}, ${endX} ${endY - controlOffset}, ${endX} ${endY}`;
  } else {
    path += ` L ${endX} ${endY}`;
  }
  return path;
}

function getFirstEmptyLane(activeLanes: Array<string | null>): number {
  const lane = activeLanes.findIndex((value) => value == null);
  return lane === -1 ? activeLanes.length : lane;
}

function getLaneX(lane: number): number {
  return COMMIT_GRAPH_PADDING_X + lane * COMMIT_GRAPH_LANE_WIDTH;
}
