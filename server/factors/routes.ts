import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import { pool } from '../db/index.js';
import { AppError } from '../shared/errors.js';
export const factorsRouter = Router();
factorsRouter.use(authenticate);
factorsRouter.get('/', async (_req, res) => {
  res.json((await pool.query(`SELECT f.*,(SELECT count(*)::int FROM research_records r WHERE r.factor_type_id=f.id) AS research_count,(SELECT count(*)::int FROM file_mappings m WHERE m.factor_type_id=f.id AND m.is_current) AS file_count FROM factor_types f ORDER BY f.created_at,f.name`)).rows);
});
factorsRouter.post('/', requireAdmin, async (req, res) => {
  const { name } = z.object({name: z.string().trim().min(1).max(80)}).strict().parse(req.body);
  res.status(201).json((await pool.query('INSERT INTO factor_types(name) VALUES ($1) RETURNING *', [name])).rows[0]);
});
factorsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = z.uuid().parse(req.params.id); const data = z.object({name: z.string().trim().min(1).max(80),active: z.boolean()}).strict().parse(req.body);
  const result = await pool.query('UPDATE factor_types SET name=$2,active=$3,updated_at=now() WHERE id=$1 RETURNING *', [id,data.name,data.active]);
  if (!result.rowCount) throw new AppError(404,'要素类型不存在'); res.json(result.rows[0]);
});
factorsRouter.get('/:id/files', async (req, res) => {
  const id=z.uuid().parse(req.params.id); const query=z.object({page:z.coerce.number().int().min(1).default(1),history:z.enum(['true','false']).default('false')}).parse(req.query);
  const where="factor_type_id=$1"+(query.history==='true'?'':' AND is_current');
  const total=Number((await pool.query(`SELECT count(*) FROM file_mappings WHERE ${where}`,[id])).rows[0].count);
  const items=(await pool.query(`SELECT id,research_id,factor_type_id,role,original_name,mime_type,size_bytes,is_current,created_at FROM file_mappings WHERE ${where} ORDER BY created_at DESC,id LIMIT 50 OFFSET $2`,[id,(query.page-1)*50])).rows;
  res.json({items,total,page:query.page,page_size:50});
});
