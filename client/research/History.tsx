import type { UploadEvent } from '../../shared/contracts';
import { fileUrl } from '../api';
import { FileLink, date } from '../components';

export function History({ events }: { events: UploadEvent[] }) {
  const actions: Record<string, string> = {
    create: '创建成果',
    edit: '更新资料',
    upload: '上传材料',
    document: '保存文档',
    pdf: '生成 PDF',
  };
  return (
    <div className="history-list">
      {!events.length && <p className="muted">暂无操作记录</p>}
      {events.map((event) => (
        <div className="history-event" key={event.id}>
          <span className="timeline-dot" />
          <div>
            <div className="history-title">
              <strong>{event.uploader_name}</strong>
              <span>{actions[event.action] || event.action}</span>
              <time>{date(event.created_at)}</time>
            </div>
            <p>{event.research_title}</p>
            {event.files.map((f) => (
              <FileLink key={f.id} href={fileUrl(f.id)}>
                {f.name}
              </FileLink>
            ))}
            <code className="record-id">记录 {event.id}</code>
          </div>
        </div>
      ))}
    </div>
  );
}
