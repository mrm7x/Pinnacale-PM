import { useEffect, useMemo, useRef, useState } from 'react';
import type { Consultant, Project, Task } from '../types';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, AlertCircle, CheckCircle2, CornerDownRight } from 'lucide-react';
import { buildTasks, downloadTemplate, parseGrid, readSpreadsheet, type ImportRow, type ParsedImport } from '../utils/importTasks';

interface Props {
  project: Project;
  /** Tasks already in this project (parents can reference them by name). */
  existingTasks: Task[];
  consultants: Consultant[];
  accent: string;
  onClose: () => void;
  onImport: (tasks: Task[]) => void;
}

const STATUS_LABEL: Record<Task['status'], string> = {
  not_started: 'Not Started', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed',
};

const newId = () => `t-${Math.random().toString(36).substring(2, 9)}`;

/**
 * Two-step import: pick a file → preview (errors/warnings per row) → import.
 * Nothing is written until the user clicks Import.
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

  const counts = useMemo(() => {
    const rows = parsed?.rows ?? [];
    return {
      total: rows.length,
      ok: rows.filter(r => r.errors.length === 0).length,
      skipped: rows.filter(r => r.errors.length > 0).length,
      warned: rows.filter(r => r.errors.length === 0 && r.warnings.length > 0).length,
    };
  }, [parsed]);

  const doImport = () => {
    if (!parsed || counts.ok === 0) return;
    onImport(buildTasks(parsed.rows, project.id, existingTasks, newId));
  };

  const reset = () => {
    setParsed(null); setFileName(null); setReadError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

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
                <button type="button" className="btn btn-secondary tv2-import-template"
                  onClick={() => downloadTemplate(project.name).catch(() => setReadError('Could not create the template.'))}>
                  <Download size={15} /> Download template
                </button>

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

                {parsed.fatal ? (
                  <div className="tv2-import-alert tv2-import-alert-error"><AlertCircle size={15} /> {parsed.fatal}</div>
                ) : (
                  <>
                    <div className="tv2-import-summary">
                      <span className="tv2-import-stat tv2-import-stat-ok"><CheckCircle2 size={14} /> {counts.ok} ready</span>
                      {counts.warned > 0 && <span className="tv2-import-stat tv2-import-stat-warn"><AlertTriangle size={14} /> {counts.warned} with notes</span>}
                      {counts.skipped > 0 && <span className="tv2-import-stat tv2-import-stat-err"><AlertCircle size={14} /> {counts.skipped} will be skipped</span>}
                    </div>
                    {parsed.unknownHeaders.length > 0 && (
                      <p className="tv2-import-note">Ignored columns: {parsed.unknownHeaders.join(', ')}</p>
                    )}
                    <div className="tv2-import-table-wrap">
                      <table className="tv2-import-table">
                        <thead>
                          <tr>
                            <th>Row</th><th>Name</th><th>Assignee</th><th>Days</th><th>Status</th><th>Due</th><th>Owner</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.rows.map(r => <PreviewRow key={r.rowNumber} row={r} />)}
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
              disabled={!parsed || !!parsed.fatal || counts.ok === 0}
              onClick={doImport}
            >
              <Upload size={14} /> Import {counts.ok > 0 ? `${counts.ok} task${counts.ok === 1 ? '' : 's'}` : ''}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

function PreviewRow({ row }: { row: ImportRow }) {
  const skipped = row.errors.length > 0;
  const notes = [...row.errors, ...row.warnings];
  return (
    <>
      <tr className={skipped ? 'tv2-import-row-skip' : ''}>
        <td className="tv2-import-rownum">{row.rowNumber}</td>
        <td>
          <span className="tv2-import-name">
            {row.parentName && <CornerDownRight size={12} className="tv2-import-sub" aria-label="Sub-task" />}
            {row.name || <i>(no name)</i>}
          </span>
          {row.parentName && <span className="tv2-import-parent">under {row.parentName}</span>}
        </td>
        <td>{row.assigneeLabel || <span className="tv2-dash">—</span>}</td>
        <td>{row.durationDays || <span className="tv2-dash">—</span>}</td>
        <td>{STATUS_LABEL[row.status]}</td>
        <td>{row.dueDate || <span className="tv2-dash">—</span>}</td>
        <td>{row.taskOwner}</td>
      </tr>
      {notes.length > 0 && (
        <tr className={`tv2-import-notes ${skipped ? 'tv2-import-notes-err' : 'tv2-import-notes-warn'}`}>
          <td />
          <td colSpan={6}>
            {skipped ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}{' '}
            {skipped ? 'Skipped: ' : ''}{notes.join(' · ')}
          </td>
        </tr>
      )}
    </>
  );
}
