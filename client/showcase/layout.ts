import type { ShowcaseGroup, ShowcaseStudy } from '../../shared/showcase';
import { sections, type Section } from '../../shared/contracts';

export const GRAPH_WIDTH = 1660;
export const NODE_WIDTH = 280;
export const CORE_X = 376, CORE_WIDTH = 144;
export const COLUMN_X: Record<Section, number> = { mechanism: 32, impact: 608, risk: 976, policy: 1344 };
type Point = { x: number; y: number };
export function roundedPath(points: Point[], radius = 12) {
  const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  if (unique.length < 2) return '';
  let path = `M ${unique[0].x} ${unique[0].y}`;
  for (let index = 1; index < unique.length - 1; index++) {
    const previous = unique[index - 1], point = unique[index], next = unique[index + 1];
    const before = Math.hypot(point.x - previous.x, point.y - previous.y), after = Math.hypot(next.x - point.x, next.y - point.y), r = Math.min(radius, before / 2, after / 2);
    path += ` L ${point.x + (previous.x - point.x) * r / before} ${point.y + (previous.y - point.y) * r / before} Q ${point.x} ${point.y} ${point.x + (next.x - point.x) * r / after} ${point.y + (next.y - point.y) * r / after}`;
  }
  return path + ` L ${unique.at(-1)!.x} ${unique.at(-1)!.y}`;
}
export type StudyRow = { study: ShowcaseStudy; y: number; height: number };
export type GraphGroup = { group: ShowcaseGroup; y: number; height: number; coreY: number; rows: StudyRow[] };
export type GraphEdge = { id: string; studyId: string; section: Section; path: string; start: Point; end: Point };
export function graphLayout(groups: ShowcaseGroup[]) {
  let y = 84;
  const edges: GraphEdge[] = [];
  const blocks: GraphGroup[] = groups.map(group => {
    const top = y;
    y += 40;
    const rows = group.items.map(study => {
      const count = Math.max(...sections.map(section => study[`${section}_summary`].length));
      const height = Math.max(224, Math.min(414, 128 + Math.ceil(count / 17) * 22));
      const row = { study, y, height }; y += height + 68; return row;
    });
    if (!rows.length) y += 192;
    // Keep the factor visible beside the first study and stable when more rows load.
    const coreY = rows.length ? rows[0].y + rows[0].height / 2 : top + 110;
    rows.forEach((row, index) => {
      const center = row.y + row.height / 2;
      const port = coreY + (index - (rows.length - 1) / 2) * Math.min(12, 44 / rows.length);
      for (const section of sections) {
        let points: Point[];
        if (section === 'mechanism') points = [{ x: COLUMN_X.mechanism + NODE_WIDTH, y: center }, { x: 344, y: center }, { x: 344, y: port }, { x: CORE_X, y: port }];
        else if (section === 'impact') points = [{ x: CORE_X + CORE_WIDTH, y: port }, { x: 582, y: port }, { x: 582, y: center }, { x: COLUMN_X.impact, y: center }];
        else {
          // Continue within this study's row instead of branching back to the factor.
          const previous = section === 'risk' ? 'impact' : 'risk';
          points = [{ x: COLUMN_X[previous] + NODE_WIDTH, y: center }, { x: COLUMN_X[section], y: center }];
        }
        edges.push({ id: `${row.study.id}-${section}`, studyId: row.study.id, section, path: roundedPath(points), start: points[0], end: points.at(-1)! });
      }
    });
    y += 36;
    return { group, y: top, height: y - top, coreY, rows };
  });
  return { blocks, edges, height: Math.max(440, y + 28) };
}
