import { pool } from '../db/index.js';
import { SHOWCASE_PAGE_SIZE, type ShowcaseGroup, type ShowcaseQuery, type ShowcaseStudy } from '../../shared/showcase.js';

const columns = 'r.id,r.factor_type_id,r.title,r.research_type,r.mechanism_summary,r.impact_summary,r.risk_summary,r.policy_summary,r.updated_at';
const filter = "($1::text='' OR r.title ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR r.research_type=$2)";
export const showcaseRepo = {
  async overview(query: ShowcaseQuery): Promise<ShowcaseGroup[]> {
    const result = await pool.query(`WITH matched AS (SELECT ${columns} FROM research_records r WHERE ${filter})
      SELECT f.id,f.name,f.active,c.total,COALESCE(p.items,'[]'::jsonb) AS items
      FROM factor_types f
      CROSS JOIN LATERAL (SELECT count(*)::int AS total FROM matched m WHERE m.factor_type_id=f.id) c
      CROSS JOIN LATERAL (SELECT jsonb_agg(s ORDER BY s.updated_at DESC,s.id) AS items FROM
        (SELECT * FROM matched m WHERE m.factor_type_id=f.id ORDER BY m.updated_at DESC,m.id LIMIT $4) s) p
      WHERE ($3::uuid IS NULL OR f.id=$3)
        AND (f.active OR c.total>0)
        AND (($1='' AND $2::text IS NULL) OR c.total>0)
      ORDER BY f.created_at,f.id`, [query.q, query.type || null, query.factor || null, SHOWCASE_PAGE_SIZE]);
    return result.rows;
  },
  async page(factorId: string, query: ShowcaseQuery, page: number) {
    // One statement keeps the count and page in the same PostgreSQL snapshot.
    const result = await pool.query(`WITH matched AS (SELECT ${columns} FROM research_records r WHERE ${filter} AND r.factor_type_id=$3)
      SELECT (SELECT count(*)::int FROM matched) AS total,
        COALESCE((SELECT jsonb_agg(s ORDER BY s.updated_at DESC,s.id) FROM
          (SELECT * FROM matched ORDER BY updated_at DESC,id LIMIT $4 OFFSET $5) s),'[]'::jsonb) AS items,
        EXISTS(SELECT 1 FROM factor_types WHERE id=$3) AS factor_exists`, [query.q, query.type || null, factorId, SHOWCASE_PAGE_SIZE, (page - 1) * SHOWCASE_PAGE_SIZE]);
    return result.rows[0] as { total: number; items: ShowcaseStudy[]; factor_exists: boolean };
  },
};
