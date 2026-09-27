import { useEffect, useState, type FormEvent } from 'react';
import type { Research, ResearchInput, Section, UploadEvent, User } from '../../shared/contracts';
import { errorMessage } from '../api';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';
import { toResearchInput } from './form';

const blank: ResearchInput = {
  title: '',
  research_type: '要素集聚',
  factor_type_id: '',
  economic_data_names: [],
  mechanism_summary: '',
  impact_summary: '',
  risk_summary: '',
  policy_summary: '',
};

export function useResearchDraft(initial: Research | null, user: User, onChanged: () => void) {
  const [record, setRecord] = useState(initial);
  const [form, setForm] = useState<ResearchInput>(initial || blank);
  const [economicNamesText, setEconomicNamesText] = useState(
    initial?.economic_data_names.join('\n') || '',
  );
  const [tab, setTab] = useState<'basic' | 'files' | 'documents' | 'history'>('basic');
  const [section, setSection] = useState<Section>('mechanism');
  const [error, setError] = useState('');
  const [isSavingOrUploading, setSavingOrUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [formHasChanges, setFormHasChanges] = useState(false);
  const [documentHasChanges, setDocumentHasChanges] = useState(false);
  const [events, setEvents] = useState<UploadEvent[]>([]);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const aiCurrent = toResearchInput(form, economicNamesText);
  function applyAiSuggestions(values: Partial<ResearchInput>) {
    setForm((old) => ({ ...old, ...values }));
    if (values.economic_data_names) {
      setEconomicNamesText(values.economic_data_names.join('\n'));
    }
    setFormHasChanges(true);
    setNotice('智能建议已填入基本信息，核对后请点击“保存研究资料”。');
  }
  const canEditResearch = !record || record.owner_id === user.id || user.role === 'admin';
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (formHasChanges || documentHasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [formHasChanges, documentHasChanges]);
  async function refreshResearch() {
    if (record) {
      const next = await queries.research(record.id);
      setRecord(next);
      onChanged();
    }
  }
  function setField<K extends keyof ResearchInput>(key: K, value: ResearchInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFormHasChanges(true);
  }
  async function saveResearch(e: FormEvent) {
    e.preventDefault();
    setSavingOrUploading(true);
    setError('');
    setNotice('');
    try {
      const data = {
        ...toResearchInput(form, economicNamesText),
        ...(record ? { version: record.version } : {}),
      };
      const next = await commands.saveResearch(record?.id, data);
      setRecord(next);
      setForm(next);
      setFormHasChanges(false);
      setNotice('研究资料已保存，可以继续上传材料或编辑说明文档。');
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingOrUploading(false);
    }
  }
  async function changeTab(next: typeof tab) {
    if (documentHasChanges && !confirm('文档还有未保存的内容，确定离开编辑器吗？')) {
      return;
    }
    setDocumentHasChanges(false);
    setTab(next);
    setError('');
    if (next === 'history' && record) {
      try {
        setEvents(await queries.researchHistory(record.id));
      } catch (e) {
        setError(errorMessage(e));
      }
    }
  }
  async function uploadMaterials(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!record) {
      return;
    }
    const el = e.currentTarget;
    setSavingOrUploading(true);
    setError('');
    setNotice('');
    try {
      const data = new FormData(el);
      for (const [key, value] of [...data.entries()]) {
        if (value instanceof File && !value.size) {
          data.delete(key);
        }
      }
      await commands.uploadFiles(record.id, data);
      el.reset();
      await refreshResearch();
      setNotice('材料已上传，文件映射与上传记录已同步更新。');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingOrUploading(false);
    }
  }

  return {
    record,
    form,
    economicNamesText,
    setEconomicNamesText,
    tab,
    section,
    setSection,
    error,
    isSavingOrUploading,
    notice,
    formHasChanges,
    setFormHasChanges,
    documentHasChanges,
    setDocumentHasChanges,
    events,
    descriptionOpen,
    setDescriptionOpen,
    aiOpen,
    setAiOpen,
    aiCurrent,
    applyAiSuggestions,
    canEditResearch,
    refreshResearch,
    setField,
    saveResearch,
    changeTab,
    uploadMaterials,
  };
}
