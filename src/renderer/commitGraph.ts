import type { GitCommitGraphRow } from "../shared/types";

export const COMMIT_GRAPH_ROW_HEIGHT = 28;
export const COMMIT_GRAPH_LANE_WIDTH = 12;
export const COMMIT_GRAPH_PADDING_X = 10;
export const COMMIT_GRAPH_MIN_WIDTH = 82;

export interface CommitGraphNode {
  hash: string;
  row: number;
  lane: number;
  x: number;
  y: number;
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
  path: string;
}

export interface CommitGraphLayout {
  width: number;
  height: number;
  rowHeight: number;
  nodes: CommitGraphNode[];
  edges: CommitGraphEdge[];
}

export function buildCommitGraphLayout(commits: GitCommitGraphRow[]): CommitGraphLayout {
  const rowHeight = COMMIT_GRAPH_ROW_HEIGHT;
  const visibleRowByHash = new Map(commits.map((commit, row) => [commit.hash, row]));
  const activeLanes: Array<string | null> = [];
  const nodes: CommitGraphNode[] = [];
  const edges: CommitGraphEdge[] = [];
  let maxLane = 0;

  commits.forEach((commit, row) => {
    const lane = getCommitLane(activeLanes, commit.hash);
    activeLanes[lane] = commit.hash;
    maxLane = Math.max(maxLane, lane);

    const node = createNode(commit.hash, row, lane, rowHeight);
    nodes.push(node);

    const [firstParent, ...mergeParents] = commit.parents;
    if (firstParent) {
      const firstParentLane = getExistingParentLane(activeLanes, firstParent, lane);
      const targetLane = firstParentLane ?? lane;
      activeLanes[lane] = firstParentLane == null ? firstParent : null;
      edges.push(createEdge({
        fromHash: commit.hash,
        toHash: firstParent,
        fromRow: row,
        toRow: getTargetRow(visibleRowByHash, firstParent, commits.length),
        fromLane: lane,
        toLane: targetLane,
        colorLane: targetLane,
        rowHeight
      }));
    } else {
      activeLanes[lane] = null;
    }

    mergeParents.forEach((parent) => {
      const parentLane = getParentLane(activeLanes, parent, lane + 1);
      activeLanes[parentLane] = parent;
      maxLane = Math.max(maxLane, parentLane);
      edges.push(createEdge({
        fromHash: commit.hash,
        toHash: parent,
        fromRow: row,
        toRow: getTargetRow(visibleRowByHash, parent, commits.length),
        fromLane: lane,
        toLane: parentLane,
        colorLane: parentLane,
        rowHeight
      }));
    });

    trimEmptyTrailingLanes(activeLanes);
  });

  return {
    width: getGraphWidth(maxLane),
    height: commits.length * rowHeight,
    rowHeight,
    nodes,
    edges: edges.filter((edge) => edge.toRow > edge.fromRow)
  };
}

function createNode(hash: string, row: number, lane: number, rowHeight: number): CommitGraphNode {
  return {
    hash,
    row,
    lane,
    x: getLaneX(lane),
    y: getRowY(row, rowHeight)
  };
}

function createEdge(params: {
  fromHash: string;
  toHash: string;
  fromRow: number;
  toRow: number;
  fromLane: number;
  toLane: number;
  colorLane: number;
  rowHeight: number;
}): CommitGraphEdge {
  return {
    fromHash: params.fromHash,
    toHash: params.toHash,
    fromRow: params.fromRow,
    toRow: params.toRow,
    fromLane: params.fromLane,
    toLane: params.toLane,
    colorLane: params.colorLane,
    id: `${params.fromHash}:${params.toHash}:${params.fromLane}:${params.toLane}`,
    path: createEdgePath(params.fromLane, params.fromRow, params.toLane, params.toRow, params.rowHeight)
  };
}

function createEdgePath(fromLane: number, fromRow: number, toLane: number, toRow: number, rowHeight: number): string {
  const startX = getLaneX(fromLane);
  const startY = getRowY(fromRow, rowHeight);
  const endX = getLaneX(toLane);
  const endY = getRowY(toRow, rowHeight);

  if (fromLane === toLane) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const curveEndY = Math.min(endY, startY + rowHeight);
  const controlOffset = Math.round(rowHeight * 0.45);
  const controlOneY = startY + controlOffset;
  const controlTwoY = curveEndY - controlOffset;
  const verticalTail = curveEndY < endY ? ` L ${endX} ${endY}` : "";

  return `M ${startX} ${startY} C ${startX} ${controlOneY}, ${endX} ${controlTwoY}, ${endX} ${curveEndY}${verticalTail}`;
}

function getCommitLane(activeLanes: Array<string | null>, hash: string): number {
  const existingLane = activeLanes.indexOf(hash);
  if (existingLane !== -1) {
    return existingLane;
  }

  return getFirstEmptyLane(activeLanes, 0);
}

function getParentLane(activeLanes: Array<string | null>, parent: string, preferredLane: number): number {
  const existingLane = activeLanes.indexOf(parent);
  if (existingLane !== -1) {
    return existingLane;
  }

  return getFirstEmptyLane(activeLanes, preferredLane);
}

function getFirstEmptyLane(activeLanes: Array<string | null>, startLane: number): number {
  for (let lane = startLane; lane < activeLanes.length; lane += 1) {
    if (activeLanes[lane] == null) {
      return lane;
    }
  }

  return activeLanes.length;
}

function getExistingParentLane(activeLanes: Array<string | null>, parent: string, currentLane: number): number | null {
  const existingLane = activeLanes.findIndex((value, lane) => lane !== currentLane && value === parent);
  return existingLane === -1 ? null : existingLane;
}

function trimEmptyTrailingLanes(activeLanes: Array<string | null>): void {
  while (activeLanes.length > 0 && activeLanes.at(-1) == null) {
    activeLanes.pop();
  }
}

function getTargetRow(visibleRowByHash: Map<string, number>, hash: string, rowCount: number): number {
  return visibleRowByHash.get(hash) ?? Math.max(0, rowCount - 1);
}

function getGraphWidth(maxLane: number): number {
  return Math.max(
    COMMIT_GRAPH_MIN_WIDTH,
    COMMIT_GRAPH_PADDING_X * 2 + maxLane * COMMIT_GRAPH_LANE_WIDTH + COMMIT_GRAPH_LANE_WIDTH
  );
}

function getLaneX(lane: number): number {
  return COMMIT_GRAPH_PADDING_X + lane * COMMIT_GRAPH_LANE_WIDTH;
}

function getRowY(row: number, rowHeight: number): number {
  return row * rowHeight + rowHeight / 2;
}
