import ExcelJS from 'exceljs';
import { suggestPanelRole, type DatasetProfile } from '../../shared/datasets.js';
import { AppError } from '../shared/errors.js';

// Read stored values only. Formula evaluation and external link fetching are never performed.
function valueOf(cell: ExcelJS.Cell): string | number | null {
  let value = cell.value;
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    if (value.result === undefined || value.result === null) {
      throw new AppError(
        400,
        `${cell.address} 的公式没有计算结果，请在 Excel 中重新计算并保存后上传`,
      );
    }
    value = value.result;
  }
  if (typeof value === 'object' && 'error' in value) {
    throw new AppError(400, `${cell.address} 包含 Excel 错误值，请修正后上传`);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AppError(400, `${cell.address} 包含无效数值`);
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  const text =
    typeof value === 'string'
      ? value
      : 'richText' in value
        ? value.richText.map((item) => item.text).join('')
        : 'text' in value
          ? value.text
          : '';
  return text.trim() ? text : null;
}

export async function parseDataset(bytes: Buffer): Promise<DatasetProfile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(new Uint8Array(bytes) as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError(400, '数据集无法解析，请上传有效的 XLSX 工作簿');
  }
  if (!workbook.worksheets.length || workbook.worksheets.length > 20) {
    throw new AppError(400, '数据集需包含 1 至 20 张工作表');
  }
  const result: DatasetProfile = { fields: [], sheets: [], row_count: 0, warnings: [] };
  let totalCells = 0;
  for (const [sheetIndex, sheet] of workbook.worksheets.entries()) {
    try {
      if (sheet.model.merges?.length) {
        throw new AppError(400, '含合并单元格，请拆分并整理为单行表头的数据表');
      }
      const rows = new Map<number, Map<number, string | number>>();
      let lastRow = 0;
      let lastColumn = 0;
      sheet.eachRow((row) => {
        const cells = new Map<number, string | number>();
        row.eachCell((cell) => {
          const value = valueOf(cell);
          if (value === null) {
            return;
          }
          if (++totalCells > 1000000 || row.number > 200001 || Number(cell.col) > 500) {
            throw new AppError(400, '数据量超过预解析上限（100 万个非空单元格、20 万行、500 列）');
          }
          cells.set(Number(cell.col), value);
          lastRow = Math.max(lastRow, row.number);
          lastColumn = Math.max(lastColumn, Number(cell.col));
        });
        if (cells.size) {
          rows.set(row.number, cells);
        }
      });
      if (!rows.size) {
        result.warnings.push(`工作表「${sheet.name}」为空，已忽略。`);
        continue;
      }
      const headers = rows.get(1);
      if (!headers) {
        throw new AppError(400, '第 1 行缺少表头，请删除表格前的空行');
      }
      if (lastRow < 2) {
        throw new AppError(400, '只有表头，没有数据行');
      }
      const ids = new Set<string>();
      for (let col = 1; col <= lastColumn; col++) {
        const header = headers.get(col);
        if (typeof header !== 'string' || !header.trim()) {
          throw new AppError(
            400,
            `${sheet.getCell(1, col).address} 缺少文本表头名称，可能存在空列或表格之外的孤立单元格`,
          );
        }
        const id = header.trim();
        if (id.length > 250) {
          throw new AppError(
            400,
            `${sheet.getCell(1, col).address} 的字段名称过长（最多 250 个字符）`,
          );
        }
        if (ids.has(id.toLowerCase())) {
          throw new AppError(400, `表头「${id}」重复，请使用唯一的字段名称`);
        }
        ids.add(id.toLowerCase());
      }
      const types = Array.from({ length: lastColumn }, () => new Set<'文本型' | '数值型'>());
      let missing = 0;
      for (let row = 2; row <= lastRow; row++) {
        const cells = rows.get(row);
        if (!cells) {
          throw new AppError(
            400,
            `第 ${row} 行为空行，数据区中不能间隔空行；请检查其后的孤立单元格`,
          );
        }
        missing += lastColumn - cells.size;
        for (const [col, value] of cells) {
          if (
            lastColumn > 1 &&
            !cells.has(col - 1) &&
            !cells.has(col + 1) &&
            !rows.get(row - 1)?.has(col) &&
            !rows.get(row + 1)?.has(col)
          ) {
            throw new AppError(
              400,
              `${sheet.getCell(row, col).address} 是孤立单元格（上下左右均无数据），请检查表格结构`,
            );
          }
          types[col - 1].add(typeof value === 'number' ? '数值型' : '文本型');
        }
      }
      if (missing) {
        result.warnings.push(
          `工作表「${sheet.name}」有 ${missing} 个缺失值，已保留；请确认符合研究需要。`,
        );
      }
      for (let col = 1; col <= lastColumn; col++) {
        const id = String(headers.get(col)).trim();
        const seen = types[col - 1];
        if (!seen.size) {
          result.warnings.push(`「${sheet.name} / ${id}」没有非空数据，暂按文本型识别。`);
        }
        if (seen.size > 1) {
          result.warnings.push(`「${sheet.name} / ${id}」混有文本和数值，按文本型识别。`);
        }
        result.fields.push({
          key: `${sheetIndex + 1}:${col}`,
          sheet: sheet.name,
          column: col,
          data_id: id,
          data_type: seen.size === 1 && seen.has('数值型') ? '数值型' : '文本型',
          suggested_panel_role: suggestPanelRole(id),
        });
      }
      if (result.fields.length > 500) {
        throw new AppError(400, '一个数据集的字段总量不能超过 500 个');
      }
      result.sheets.push({ name: sheet.name, row_count: lastRow - 1, column_count: lastColumn });
      result.row_count += lastRow - 1;
    } catch (error) {
      if (error instanceof AppError) {
        throw new AppError(error.status, `数据集工作表「${sheet.name}」：${error.message}`);
      }
      throw new AppError(400, `工作表「${sheet.name}」无法读取，请检查数据格式`);
    }
  }
  if (!result.fields.length) {
    throw new AppError(400, '数据集没有可用的数据表');
  }
  return result;
}
