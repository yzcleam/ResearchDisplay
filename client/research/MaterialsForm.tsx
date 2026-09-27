import { FileText, Plus, UploadSimple } from '@phosphor-icons/react';
import type { FormEvent } from 'react';
import { roleLabels, type FileRecord } from '../../shared/contracts';
import { fileUrl } from '../api';
import { FileLink, size } from '../components';

const MATERIAL_ROLES = [
  'image_pack',
  'dataset',
  'indicators',
  'manuscript',
  'mechanism_pdf',
  'impact_pdf',
  'risk_pdf',
  'policy_pdf',
] as const;
type MaterialRole = (typeof MATERIAL_ROLES)[number];

function materialFormat(role: MaterialRole) {
  if (role === 'image_pack') {
    return { accept: '.zip,.rar', description: 'ZIP / RAR 图片包，仅包含 PNG / JPG / WebP' };
  }
  if (role === 'dataset' || role === 'indicators') {
    return { accept: '.xlsx', description: 'Excel 工作簿 · .xlsx' };
  }
  return { accept: '.pdf', description: 'PDF 文档 · .pdf' };
}

type Props = {
  files: FileRecord[];
  canEdit: boolean;
  isUploading: boolean;
  onUpload: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onOpenDescriptions: () => void;
};

export function MaterialsForm({
  files,
  canEdit,
  isUploading,
  onUpload,
  onOpenDescriptions,
}: Props) {
  function getCurrentFile(role: FileRecord['role']) {
    return files.find((file) => file.role === role && file.is_current);
  }
  const currentDataset = getCurrentFile('dataset');
  return (
    <form className="paper-panel" onSubmit={onUpload}>
      <div className="section-heading">
        <span className="section-number">01</span>
        <div>
          <h2>研究材料归档</h2>
          <p>替换上传会保留历史文件；单个文件最多 25 MB，单次最多 100 MB。</p>
        </div>
      </div>
      <div className="material-grid">
        {MATERIAL_ROLES.map((role) => {
          const currentFile = getCurrentFile(role);
          const datasetSummary = currentFile?.dataset_summary;
          const format = materialFormat(role);
          return (
            <div className="material-item" key={role}>
              <div className="material-icon">
                <FileText size={24} />
              </div>
              <div className="material-content">
                <div className="material-heading">
                  <h3>{roleLabels[role]}</h3>
                  {role === 'indicators' && (
                    <button
                      type="button"
                      className="dataset-add"
                      aria-label={canEdit ? '在线填写数据说明' : '查看在线数据说明'}
                      title={currentDataset ? '打开数据说明' : '请先上传数据集'}
                      disabled={isUploading || !currentDataset}
                      onClick={() => onOpenDescriptions()}
                    >
                      <Plus size={16} />
                      <span>{canEdit ? '在线填写' : '在线说明'}</span>
                    </button>
                  )}
                </div>
                <p className="small muted">{format.description}</p>
                {currentFile ? (
                  <>
                    <FileLink href={fileUrl(currentFile.id)}>{currentFile.original_name}</FileLink>
                    <span className="small muted">{size(currentFile.size_bytes)}</span>
                  </>
                ) : (
                  <span className="missing">尚未上传</span>
                )}
                {role === 'dataset' && datasetSummary && (
                  <p className="dataset-status">
                    预解析完成 · {datasetSummary.field_count} 个字段 ·{' '}
                    {datasetSummary.row_count.toLocaleString()} 行数据
                  </p>
                )}
                {role === 'dataset' && (
                  <p className="small muted">首行为完整表头，数据区内请勿留空行或合并单元格。</p>
                )}
                {role === 'indicators' && (
                  <p className="small muted">
                    {currentDataset?.dataset_summary?.described
                      ? '当前数据集已保存在线说明，可点击加号查看或修改。'
                      : '也可点击加号在线填写；请先上传数据集。'}
                  </p>
                )}
                {canEdit && (
                  <label className="upload-choice">
                    <UploadSimple size={16} />
                    <span>{currentFile ? '替换文件' : '选择文件'}</span>
                    <input
                      aria-label={roleLabels[role]}
                      type="file"
                      name={role}
                      accept={format.accept}
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="panel-footer">
          <span className="muted small">数据集上传时会自动预检查；四类说明也可在网页中编辑。</span>
          <button className="primary" disabled={isUploading}>
            <UploadSimple size={18} />
            {isUploading ? '正在上传并检查…' : '上传所选材料'}
          </button>
        </div>
      )}
    </form>
  );
}
