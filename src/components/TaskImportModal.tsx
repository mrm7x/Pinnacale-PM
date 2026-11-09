import { useEffect, useMemo, useRef, useState } from 'react';
import type { Consultant, Project, Task } from '../types';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, AlertCircle, CheckCircle2, CornerDownRight, FileDown, RefreshCw } from 'lucide-react';
import { downloadTaskList, downloadTemplate, parseGrid, planImport, readSpreadsheet, type ParsedImport, type PlannedRow } from '../utils/importTasks';

interface Props {
  project: Project;
  /** Tasks already in this project (parents can reference them by name; Task IDs update them). */
  existingTasks: Task[];
  consultants: Consultant[];
  accent: string;
  onClose: () => void;
  /** `created` are new tasks (ids assigned); `updated` are full replacements of existing tasks. */
  onImport: (created: Task[], updated: Task[]) => void;
}

const STATUS_LABEL: Record<Task['status'], string> = {
  not_started: 'Not Started', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed',
};

const ACTION_LABEL: Record<PlannedRow['action'], string> = {
  create: 'New', update: 'Update', unchanged: 'No change', skip: 'Skipped',
};

const newId = () => `t-${Math.random().toString(36).substring(2, 9)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Two-step import: pick a file → preview (new / update / unchanged / skipped
 * per row, with what changes) → import. Nothing is written until Import.
 */
export default function TaskImportModal({ project, existingTasks, consultants, accent, onClose, onImport }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setReadError(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const grid = await readSpreadsheet(file);
      setParsed(parseGrid(grid, consultants, existingTasks.map(t => t.name)));
    } catch (err) {
      console.error(err);
      setReadError(err instanceof Error && err.message ? err.message : 'We could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  // The same plan drives the preview and the import, so what you see is what's written.
  const plan = useMemo(
    () => (parsed && !parsed.fatal ? planImport(parsed, project.id, existingTasks, consultants, newId) : null),
    [parsed, project.id, existingTasks, consultants]
  );

  const counts = useMemo(() => {
    const rows = plan?.rows ?? [];
    return {
      created: plan?.created.length ?? 0,
      updated: plan?.updated.length ?? 0,
      unchanged: rows.filter(r => r.action === 'unchanged').length,
      skipped: rows.filter(r => r.action === 'skip').length,
      warned: rows.filter(r => r.action !== 'skip' && r.warnings.length > 0).length,
    };
  }, [plan]);
  const total = counts.created + counts.updated;

  const doImport = () => {
    if (!plan || total === 0) return;
    onImport(plan.created, plan.updated);
  };

  const reset = () => {
    setParsed(null); setFileName(null); setReadError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const consultantName = useMemo(() => new Map(consultants.map(c => [c.id, c.name])), [consultants]);

  const importLabel = [
    counts.created > 0 ? `add ${counts.created}` : '',
    counts.updated > 0 ? `update ${counts.updated}` : '',
  ].filter(Boolean).join(', ');

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="tv2-modal tv2-import-modal" role="dialog" aria-modal="true" aria-labelledby="tv2-import-title">
        <div className="tv2-modal-form">
          <header className="tv2-modal-header" style={{ borderBottomColor: accent }}>
            <div>
              <span className="tv2-modal-eyebrow">{project.name}</span>
              <h3 id="tv2-import-title" className="tv2-modal-title">Import tasks</h3>
            </div>
            <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>

          <div className="tv2-modal-body">
            {!parsed && (
              <>
                <p className="tv2-import-intro">
                  Upload an Excel (<b>.xlsx</b>) or <b>CSV</b> file with one task per row. Only <b>Name</b> is required.
                  Use a <b>Parent</b> column to nest sub-tasks under a task higher up in the file.
                </p>
                <p className="tv2-import-intro">
                  To change existing tasks, <b>export the current tasks</b>, edit them in Excel and import the file back.
                  Rows keep their <b>Task ID</b>, so they update the matching task instead of adding a copy.
                </p>
                <div className="tv2-import-downloads">
                  <button type="button" className="btn btn-secondary tv2-import-template"
                    onClick={() => downloadTemplate(project.name).catch(() => setReadError('Could not create the template.'))}>
                    <Download size={15} /> Download template
                  </button>
                  <button type="button" className="btn btn-secondary tv2-import-template"
                    disabled={existingTasks.length === 0}
                    title={existingTasks.length === 0 ? 'This project has no tasks yet' : 'Current tasks in the import layout'}
                    onClick={() => downloadTaskList(project.name, existingTasks, consultants).catch(() => setReadError('Could not export the task list.'))}>
                    <FileDown size={15} /> Export current tasks
                  </button>
                </div>

                <label
                  className={`tv2-import-drop ${dragOver ? 'tv2-import-drop-active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                >
                  <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="tv2-import-file"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  <FileSpreadsheet size={28} style={{ color: accent }} />
                  <span className="tv2-import-drop-title">{busy ? `Reading ${fileName}…` : 'Choose a file or drop it here'}</span>
                  <span className="tv2-import-drop-hint">.xlsx or .csv</span>
                </label>

                {readError && (
                  <div className="tv2-import-alert tv2-import-alert-error"><AlertCircle size={15} /> {readError}</div>
                )}
              </>
            )}

            {parsed && (
              <>
                <div className="tv2-import-filebar">
                  <FileSpreadsheet size={16} />
                  <span className="tv2-import-filename">{fileName}</span>
                  <button type="button" className="btn btn-ghost" onClick={reset}>Choose another file</button>
                </div>

                {parsed.fatal || !plan ? (
                  <div className="tv2-import-alert tv2-import-alert-error"><AlertCircle size={15} /> {parsed.fatal}</div>
                ) : (
                  <>
                    <div className="tv2-import-summary">
                      {counts.created > 0 && <span className="tv2-import-stat tv2-import-stat-ok"><CheckCircle2 size={14} /> {counts.created} new</span>}
                      {counts.updated > 0 && <span className="tv2-import-stat tv2-import-stat-ok"><RefreshCw size={14} /> {plural(counts.updated, 'update')}</span>}
                      {counts.unchanged > 0 && <span className="tv2-import-stat">{counts.unchanged} unchanged</span>}
                      {counts.warned > 0 && <span className="tv2-import-stat tv2-import-stat-warn"><AlertTriangle size={14} /> {counts.warned} with notes</span>}
                      {counts.skipped > 0 && <span className="tv2-import-stat tv2-import-stat-err"><AlertCircle size={14} /> {counts.skipped} will be skipped</span>}
                    </div>
                    {parsed.unknownHeaders.length > 0 && (
                      <p className="tv2-import-note">Ignored columns: {parsed.unknownHeaders.join(', ')}</p>
                    )}
                    {counts.updated + counts.unchanged > 0 && (
                      <p className="tv2-import-note">
                        Updates only change the columns in this file. Tasks missing from the file are left as they are (not deleted).
                      </p>
                    )}
                    <div className="tv2-import-table-wrap">
                      <table className="tv2-import-table">
                        <thead>
                          <tr>
                            <th>Row</th><th>Action</th><th>Name</th><th>Assignee</th><th>Days</th><th>Status</th><th>Due</th><th>Owner</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.rows.map(r => <PreviewRow key={r.row.rowNumber} planned={r} consultantName={consultantName} />)}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <footer className="tv2-modal-footer">
            <div className="tv2-modal-spacer" />
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary"
              disabled={!plan || total === 0}
              onClick={doImport}
            >
              <Upload size={14} /> {total > 0 ? `Import: ${importLabel}` : 'Import'}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

function PreviewRow({ planned, consultantName }: { planned: PlannedRow; consultantName: Map<string, string> }) {
  const { row, action, task, parentLabel, changes, errors, warnings } = planned;
  const skipped = action === 'skip';
  // Show the resulting task where there is one; the raw row when skipped.
  const name = task?.name ?? row.name;
  const assignee = task ? (task.assignedConsultantId ? consultantName.get(task.assignedConsultantId) ?? '' : '') : row.assigneeLabel;
  const days = task ? task.durationDays : row.durationDays;
  const status = task?.status ?? row.status;
  const due = task ? task.dueDate : row.dueDate;
  const owner = task ? task.taskOwner || 'Pinnacle' : row.taskOwner;

  const notes = [...errors, ...warnings];
  return (
    <>
      <tr className={skipped ? 'tv2-import-row-skip' : ''}>
        <td className="tv2-import-rownum">{row.rowNumber}</td>
        <td><span className={`tv2-import-action tv2-import-action-${action}`}>{ACTION_LABEL[action]}</span></td>
        <td>
          <span className="tv2-import-name">
            {parentLabel && <CornerDownRight size={12} className="tv2-import-sub" aria-label="Sub-task" />}
            {name || <i>(no name)</i>}
          </span>
          {parentLabel && <span className="tv2-import-parent">under {parentLabel}</span>}
        </td>
        <td>{assignee || <span className="tv2-dash">—</span>}</td>
        <td>{days || <span className="tv2-dash">—</span>}</td>
        <td>{STATUS_LABEL[status]}</td>
        <td>{due || <span className="tv2-dash">—</span>}</td>
        <td>{owner}</td>
      </tr>
      {changes.length > 0 && (
        <tr className="tv2-import-notes tv2-import-notes-change">
          <td />
          <td colSpan={7}>
            <RefreshCw size={12} />{' '}
            {changes.map((c, i) => (
              <span key={c.label}>
                {i > 0 && ' · '}
                <b>{c.label}</b> {c.from} → {c.to}
              </span>
            ))}
          </td>
        </tr>
      )}
      {notes.length > 0 && (
        <tr className={`tv2-import-notes ${skipped ? 'tv2-import-notes-err' : 'tv2-import-notes-warn'}`}>
          <td />
          <td colSpan={7}>
            {skipped ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}{' '}
            {skipped ? 'Skipped: ' : ''}{notes.join(' · ')}
          </td>
        </tr>
      )}
    </>
  );
}
