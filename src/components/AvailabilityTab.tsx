import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AvailabilityCode, Consultant, Project, ProjectAvailability, Task } from '../types';
import {
  ClipboardPaste, Upload, UserPlus, Trash2, Eraser, X, AlertCircle, AlertTriangle,
  CheckCircle2, RefreshCw, FileSpreadsheet, Download, CalendarOff,
} from 'lucide-react';
import { api } from '../utils/api';
import { parseDate } from '../utils/scheduler';
import { getProjectAccent } from '../utils/phases';
import { exportProjectToExcel } from '../utils/exportToExcel';
import {
  AVAILABILITY_CODES, CODE_META, mergeAvailability, parseAvailabilityGrid, parseClipboardGrid,
  readAvailabilityWorkbook, timelineDates, timelineDayCount,
} from '../utils/availability';

interface Props {
  project: Project;
  tasks: Task[];
  consultants: Consultant[];
  canEdit: boolean;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const COL_WIDTH = 34;
const newId = () => `av-${crypto.randomUUID()}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Brush: a code to paint, or null for the eraser. */
type Brush = AvailabilityCode | null;

interface ImportSource {
  kind: 'paste' | 'file';
  label: string;
  grid: unknown[][];
}

export default function AvailabilityTab({ project, tasks, consultants, canEdit, onAddToast }: Props) {
  const [rows, setRows] = useState<ProjectAvailability[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [brush, setBrush] = useState<Brush>('U');
  const [source, setSource] = useState<ImportSource | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const accent = getProjectAccent(project);
  const loading = loadedFor !== project.id;

  // ---- Timeline: the Gantt's working days ----------------------------------
  const projectTasks = useMemo(() => tasks.filter(t => t.projectId === project.id), [tasks, project.id]);
  const dates = useMemo(
    () => timelineDates(project.startDate, timelineDayCount(projectTasks)),
    [project.startDate, projectTasks],
  );
  const todayStr = toYMD(new Date());
  const monthBands = useMemo(() => {
    const bands: { key: string; label: string; count: number }[] = [];
    dates.forEach(date => {
      const key = date.slice(0, 7);
      const last = bands[bands.length - 1];
      if (last && last.key === key) last.count++;
      else bands.push({ key, label: parseDate(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), count: 1 });
    });
    return bands;
  }, [dates]);

  // ---- Load ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    api.availability.getByProject(project.id)
      .then(r => { if (!cancelled) setRows(r); })
      .catch(err => {
        console.error('Failed to load availability:', err);
        if (!cancelled) { setRows([]); onAddToast('Could not load availability.', 'error'); }
      })
      .finally(() => { if (!cancelled) setLoadedFor(project.id); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const persist = useCallback(async (changed: ProjectAvailability[], deletedIds: string[] = []) => {
    try {
      await Promise.all([api.availability.saveMany(changed), api.availability.deleteMany(deletedIds)]);
    } catch (err) {
      console.error('Failed to save availability:', err);
      onAddToast('Could not save availability. Reload to see what was saved.', 'error');
    }
  }, [onAddToast]);

  // ---- Painting cells (click or drag) -------------------------------------
  const paint = useRef<{ code: Brush; changed: Set<string> } | null>(null);

  const setCell = (rowId: string, date: string, code: Brush) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId || (r.days[date] ?? null) === code) return r;
      const days = { ...r.days };
      if (code) days[date] = code; else delete days[date];
      return { ...r, days };
    }));
    paint.current?.changed.add(rowId);
  };

  const onCellDown = (e: React.MouseEvent, row: ProjectAvailability, date: string) => {
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    // Clicking a cell that already has the brush's code clears it (and the drag).
    const code = brush && row.days[date] === brush ? null : brush;
    paint.current = { code, changed: new Set() };
    setCell(row.id, date, code);
  };

  const onCellEnter = (row: ProjectAvailability, date: string) => {
    if (paint.current) setCell(row.id, date, paint.current.code);
  };

  useEffect(() => {
    const onUp = () => {
      if (!paint.current) return;
      const ids = paint.current.changed;
      paint.current = null;
      // Read rows after React has applied the last setRows.
      setTimeout(() => persist(rowsRef.current.filter(r => ids.has(r.id))), 0);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [persist]);

  // ---- People ---------------------------------------------------------------
  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    if (rows.some(r => r.personName.trim().toLowerCase() === name.toLowerCase())) {
      onAddToast(`${name} is already on the list.`, 'warning');
      return;
    }
    const row: ProjectAvailability = {
      id: newId(), projectId: project.id, personName: name,
      sortOrder: Math.max(-1, ...rows.map(r => r.sortOrder)) + 1, days: {},
    };
    setRows(prev => [...prev, row]);
    setNewName('');
    persist([row]);
  };

  const renamePerson = (row: ProjectAvailability, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === row.personName) return;
    const updated = { ...row, personName: trimmed };
    setRows(prev => prev.map(r => (r.id === row.id ? updated : r)));
    persist([updated]);
  };

  const removePerson = (row: ProjectAvailability) => {
    if (!window.confirm(`Remove ${row.personName} and their availability?`)) return;
    setRows(prev => prev.filter(r => r.id !== row.id));
    persist([], [row.id]);
  };

  // ---- Paste / import ---------------------------------------------------------
  const openPaste = (text = '') => {
    setSource({ kind: 'paste', label: 'Pasted', grid: text ? parseClipboardGrid(text) : [] });
    setModalOpen(true);
  };

  // Ctrl+V anywhere on the tab (outside a text box) opens the paste preview.
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      if (modalOpen || isTypingTarget(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.includes('\t') && !text.includes('\n')) return;
      e.preventDefault();
      openPaste(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [canEdit, modalOpen]);

  const onFile = async (file: File) => {
    try {
      const grid = await readAvailabilityWorkbook(file);
      setSource({ kind: 'file', label: file.name, grid });
      setModalOpen(true);
    } catch (err) {
      onAddToast(err instanceof Error && err.message ? err.message : 'We could not read that file.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyImport = (removeMissing: boolean) => {
    if (!source) return;
    const parsed = parseAvailabilityGrid(source.grid, dates);
    if (parsed.error) return;
    const result = mergeAvailability(rows, parsed.people, project.id, newId, removeMissing);
    const changedIds = new Set(
      result.rows.filter(r => {
        const before = rows.find(x => x.id === r.id);
        return !before || JSON.stringify(before) !== JSON.stringify(r);
      }).map(r => r.id),
    );
    setRows(result.rows);
    persist(result.rows.filter(r => changedIds.has(r.id)), result.deletedIds);
    setModalOpen(false);
    setSource(null);
    const bits = [
      result.added ? `added ${plural(result.added, 'person').replace('persons', 'people')}` : '',
      result.updated ? `updated ${result.updated}` : '',
      result.deletedIds.length ? `removed ${result.deletedIds.length}` : '',
    ].filter(Boolean);
    onAddToast(`Availability ${bits.join(', ') || 'unchanged'}.`, 'success');
  };

  const downloadExcel = async () => {
    try {
      await exportProjectToExcel(project, tasks, consultants, rows);
    } catch {
      onAddToast('Export failed. Please try again.', 'error');
    }
  };

  // ---- Per-day totals (people out) ------------------------------------------
  const outPerDay = useMemo(() => dates.map(date => rows.reduce((n, r) => {
    const c = r.days[date];
    return n + (c === 'U' || c === 'P' ? 1 : c === 'H' ? 0.5 : 0);
  }, 0)), [dates, rows]);

  const daysOff = (r: ProjectAvailability) => dates.reduce((n, d) => {
    const c = r.days[d];
    return n + (c === 'U' ? 1 : c === 'H' ? 0.5 : 0);
  }, 0);

  // ---- Render -----------------------------------------------------------------
  const toolbar = (
    <div className="g2-toolbar av-toolbar">
      <div className="av-legend" role={canEdit ? 'radiogroup' : undefined} aria-label="Availability codes">
        {AVAILABILITY_CODES.map(c => (
          <button key={c.code} type="button"
            className={`av-legend-item ${canEdit && brush === c.code ? 'av-legend-active' : ''}`}
            role={canEdit ? 'radio' : undefined}
            aria-checked={canEdit ? brush === c.code : undefined}
            disabled={!canEdit}
            onClick={() => setBrush(c.code)}
            title={canEdit ? `Paint “${c.label}”` : c.label}
          >
            <span className="av-swatch" style={{ backgroundColor: c.fill, color: c.ink }}>{c.code}</span>
            {c.label}
          </button>
        ))}
        {canEdit && (
          <button type="button"
            className={`av-legend-item ${brush === null ? 'av-legend-active' : ''}`}
            role="radio" aria-checked={brush === null}
            onClick={() => setBrush(null)} title="Clear cells"
          >
            <span className="av-swatch av-swatch-eraser"><Eraser size={11} /></span>
            Clear
          </button>
        )}
      </div>
      <div className="g2-toolbar-actions">
        {canEdit && (
          <>
            <button className="btn btn-ghost g2-icon-btn" onClick={() => openPaste()} title="Paste a block copied from the Excel Availability sheet">
              <ClipboardPaste size={15} /> Paste from Excel
            </button>
            <button className="btn btn-ghost g2-icon-btn" onClick={() => fileRef.current?.click()} title="Import the project's Excel export">
              <Upload size={15} /> Import workbook
            </button>
            <input ref={fileRef} type="file" accept=".xlsx" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <span className="g2-toolbar-divider" />
          </>
        )}
        <button className="btn btn-ghost g2-icon-btn" onClick={downloadExcel} title="Download the project export with this availability filled in">
          <Download size={15} /> Excel
        </button>
      </div>
    </div>
  );

  return (
    <div className="g2-root av-root" style={{ '--g2-accent': accent } as React.CSSProperties}>
      {toolbar}

      {loading ? (
        <div className="card av-empty"><p>Loading availability…</p></div>
      ) : rows.length === 0 && !canEdit ? (
        <div className="card av-empty">
          <CalendarOff size={40} />
          <h3>No availability yet</h3>
          <p>Nobody has added holidays or availability for this project.</p>
        </div>
      ) : (
        <div className="card av-frame">
          <div className="av-scroll">
            <table className="av-table" style={{ minWidth: 240 + dates.length * COL_WIDTH }}>
              <thead>
                <tr className="av-month-row">
                  <th className="av-name-head av-sticky" rowSpan={2}>
                    <span>Person</span>
                    <span className="av-name-sub">{plural(dates.length, 'working day')} · same as Gantt</span>
                  </th>
                  {monthBands.map(b => (
                    <th key={b.key} colSpan={b.count} className="av-month-cell"><span className="g2-month-label">{b.label}</span></th>
                  ))}
                </tr>
                <tr className="av-day-row">
                  {dates.map(date => {
                    const d = parseDate(date);
                    return (
                      <th key={date}
                        className={`av-day-head ${date === todayStr ? 'g2-today-head' : ''} ${d.getDay() === 1 ? 'av-week-start' : ''}`}
                        title={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      >
                        <span className="g2-head-day">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                        <span className="g2-head-date">{d.getDate()}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const off = daysOff(row);
                  return (
                    <tr key={row.id} className={idx % 2 ? 'g2-stripe' : ''}>
                      <th className="av-name av-sticky" scope="row"><div className="av-name-inner">
                        {canEdit ? (
                          <input key={row.personName} className="av-name-input" defaultValue={row.personName} aria-label="Name"
                            onBlur={e => renamePerson(row, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                        ) : <span className="av-name-text">{row.personName}</span>}
                        {off > 0 && <span className="av-off" title="Days unavailable in this timeline">{off} off</span>}
                        {canEdit && (
                          <button type="button" className="av-remove" onClick={() => removePerson(row)} title={`Remove ${row.personName}`}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div></th>
                      {dates.map(date => {
                        const code = row.days[date];
                        const meta = code ? CODE_META[code] : null;
                        return (
                          <td key={date}
                            className={`av-cell ${canEdit ? 'av-cell-edit' : ''} ${parseDate(date).getDay() === 1 ? 'av-week-start' : ''} ${date === todayStr ? 'av-today' : ''}`}
                            style={meta ? { backgroundColor: meta.fill, color: meta.ink } : undefined}
                            title={`${row.personName} · ${date}${meta ? ` · ${meta.label}` : ''}`}
                            onMouseDown={e => onCellDown(e, row, date)}
                            onMouseEnter={() => onCellEnter(row, date)}
                          >
                            {code ?? ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {canEdit && (
                  <tr className="av-add-row">
                    <th className="av-name av-sticky"><div className="av-name-inner">
                      <UserPlus size={14} className="av-add-icon" />
                      <input className="av-name-input" placeholder="Add a person…" value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addPerson(); }}
                        onBlur={addPerson} aria-label="Add a person" />
                    </div></th>
                    <td colSpan={dates.length} className="av-add-hint">
                      {rows.length === 0
                        ? 'Add people here, or copy the block from the Excel export’s Availability sheet (from the “Name” cell) and press Ctrl+V.'
                        : 'Pick a code above, then click or drag across days. Ctrl+V pastes a block from Excel.'}
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <th className="av-name av-sticky av-foot-label" scope="row">People out</th>
                    {outPerDay.map((n, i) => (
                      <td key={dates[i]} className={`av-foot ${n > 0 ? 'av-foot-out' : ''} ${parseDate(dates[i]).getDay() === 1 ? 'av-week-start' : ''}`}>
                        {n > 0 ? n : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {modalOpen && source && (
        <ImportModal
          project={project}
          accent={accent}
          source={source}
          dates={dates}
          existing={rows}
          onChangeText={text => setSource({ kind: 'paste', label: 'Pasted', grid: parseClipboardGrid(text) })}
          onClose={() => { setModalOpen(false); setSource(null); }}
          onApply={applyImport}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paste / import preview
// ---------------------------------------------------------------------------

function ImportModal({ project, accent, source, dates, existing, onChangeText, onClose, onApply }: {
  project: Project;
  accent: string;
  source: ImportSource;
  dates: string[];
  existing: ProjectAvailability[];
  onChangeText: (text: string) => void;
  onClose: () => void;
  onApply: (removeMissing: boolean) => void;
}) {
  const [removeMissing, setRemoveMissing] = useState(false);
  const hasData = source.grid.some(r => r.some(v => String(v ?? '').trim()));
  const parsed = useMemo(() => (hasData ? parseAvailabilityGrid(source.grid, dates) : null), [hasData, source.grid, dates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const existingNames = new Set(existing.map(r => r.personName.trim().toLowerCase()));
  const people = parsed?.people ?? [];
  const added = people.filter(p => !existingNames.has(p.name.trim().toLowerCase())).length;
  const updated = people.length - added;
  const pastedNames = new Set(people.map(p => p.name.trim().toLowerCase()));
  const missing = existing.filter(r => !pastedNames.has(r.personName.trim().toLowerCase())).length;
  const inTimeline = new Set(dates);
  const outside = parsed ? new Set(people.flatMap(p => Object.keys(p.days)).filter(d => !inTimeline.has(d))).size : 0;
  const ready = !!parsed && !parsed.error;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="tv2-modal tv2-import-modal" role="dialog" aria-modal="true" aria-labelledby="av-import-title">
        <div className="tv2-modal-form">
          <header className="tv2-modal-header" style={{ borderBottomColor: accent }}>
            <div>
              <span className="tv2-modal-eyebrow">{project.name}</span>
              <h3 id="av-import-title" className="tv2-modal-title">
                {source.kind === 'file' ? 'Import availability' : 'Paste availability from Excel'}
              </h3>
            </div>
            <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>

          <div className="tv2-modal-body">
            {source.kind === 'paste' ? (
              <>
                <p className="tv2-import-intro">
                  In the Excel export, open the <b>Availability</b> sheet, select from the <b>Name</b> cell (A5) to the last
                  filled day, copy, and paste below. Each row is a person; each day holds a code
                  ({AVAILABILITY_CODES.map(c => c.code).join(' / ')}).
                </p>
                <textarea className="form-textarea av-paste" autoFocus={!hasData} spellCheck={false}
                  placeholder="Paste here (Ctrl+V)"
                  defaultValue={hasData ? source.grid.map(r => r.map(v => String(v ?? '')).join('\t')).join('\n') : ''}
                  onChange={e => onChangeText(e.target.value)} />
              </>
            ) : (
              <div className="tv2-import-filebar">
                <FileSpreadsheet size={18} />
                <span className="tv2-import-filename">{source.label}</span>
              </div>
            )}

            {parsed?.error && (
              <div className="tv2-import-alert tv2-import-alert-error"><AlertCircle size={15} /> {parsed.error}</div>
            )}

            {ready && parsed && (
              <>
                <div className="tv2-import-summary">
                  {added > 0 && <span className="tv2-import-stat tv2-import-stat-ok"><CheckCircle2 size={14} /> {added} new</span>}
                  {updated > 0 && <span className="tv2-import-stat tv2-import-stat-ok"><RefreshCw size={14} /> {updated} to update</span>}
                  <span className="tv2-import-stat">{plural(parsed.dayCount, 'day')}</span>
                  {parsed.unknownValues.length > 0 && (
                    <span className="tv2-import-stat tv2-import-stat-warn">
                      <AlertTriangle size={14} /> Ignored: {parsed.unknownValues.map(v => `“${v}”`).join(', ')}
                    </span>
                  )}
                </div>
                <p className="tv2-import-note">
                  {parsed.mode === 'dated'
                    ? 'Days are matched by the date row.'
                    : `No date row found, so the first day column is ${dates[0]} and the rest follow the Gantt's working days. Include the "Name" row when copying to match by date.`}
                  {outside > 0 && ` ${plural(outside, 'date')} fall outside the current timeline; they are kept but not shown.`}
                  {' '}Only the days in the block change; blank cells clear that day.
                </p>
                <div className="av-preview">
                  {people.slice(0, 12).map(p => {
                    const codes = Object.values(p.days).filter(Boolean) as AvailabilityCode[];
                    const counts = AVAILABILITY_CODES.map(c => ({ c, n: codes.filter(x => x === c.code).length })).filter(x => x.n > 0);
                    return (
                      <div key={p.name} className="av-preview-row">
                        <span className="av-preview-name">{p.name}</span>
                        {!existingNames.has(p.name.trim().toLowerCase()) && <span className="av-preview-new">new</span>}
                        <span className="av-preview-counts">
                          {counts.length === 0 ? <em>no codes</em> : counts.map(({ c, n }) => (
                            <span key={c.code} className="av-swatch av-swatch-count" style={{ backgroundColor: c.fill, color: c.ink }} title={c.label}>
                              {c.code} {n}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                  {people.length > 12 && <div className="tv2-import-note">…and {people.length - 12} more</div>}
                </div>
                {missing > 0 && (
                  <label className="av-check">
                    <input type="checkbox" checked={removeMissing} onChange={e => setRemoveMissing(e.target.checked)} />
                    Remove {plural(missing, 'person').replace('persons', 'people')} not in this block
                  </label>
                )}
              </>
            )}
          </div>

          <footer className="tv2-modal-footer">
            <div className="tv2-modal-spacer" />
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => onApply(removeMissing)}>
              {source.kind === 'file' ? 'Import' : 'Apply'}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
