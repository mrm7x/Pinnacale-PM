import { useMemo } from 'react';
import type { Project, Task, Consultant } from '../types';
import { getSchedulePoint, parseDate } from '../utils/scheduler';
import { Info, HelpCircle } from 'lucide-react';

interface GanttChartProps {
  activeProject: Project | null;
  tasks: Task[];
  consultants: Consultant[];
}

export default function GanttChart({ activeProject, tasks, consultants }: GanttChartProps) {
  const projectTasks = useMemo(() => {
    if (!activeProject) return [];
    return tasks.filter(t => t.projectId === activeProject.id);
  }, [tasks, activeProject]);

  // Determine the dimensions of our timeline
  const maxEndHalfDay = useMemo(() => {
    if (projectTasks.length === 0) return 0;
    return Math.max(...projectTasks.map(t => t.endHalfDay || 0));
  }, [projectTasks]);

  // Determine how many days we show in the timeline (at least 12 working days, i.e., ~2.5 weeks)
  const totalWorkingDays = useMemo(() => {
    return Math.max(12, Math.ceil((maxEndHalfDay + 2) / 2));
  }, [maxEndHalfDay]);

  const rowHeight = 48;
  const headerHeight = 44;
  const colWidth = 80;
  const halfColWidth = colWidth / 2; // 40px for a half-day chunk

  const timelineWidth = totalWorkingDays * colWidth;
  const timelineHeight = projectTasks.length * rowHeight;

  // Compile list of column day details
  const columns = useMemo(() => {
    if (!activeProject) return [];
    const cols = [];
    for (let c = 0; c < totalWorkingDays; c++) {
      const point = getSchedulePoint(activeProject.startDate, c * 2);
      const dateObj = parseDate(point.date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      cols.push({ index: c, dayName, dateLabel, dateStr: point.date });
    }
    return cols;
  }, [activeProject, totalWorkingDays]);

  if (!activeProject) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <HelpCircle size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
        <h3>No Project Selected</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>Please select a project in the Project tab to view its Gantt timeline.</p>
      </div>
    );
  }

  if (projectTasks.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <HelpCircle size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
        <h3>Empty Timeline</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>No tasks found for this project. Create some tasks in the Project tab to view the Gantt schedule.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Legend / Info Bar */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          backgroundColor: 'var(--bg-secondary)', 
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem'
        }}
      >
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.95rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: '14px', height: '14px', borderRadius: '2px', backgroundColor: 'var(--text-secondary)' }} />
            <span>Parent Task</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: '14px', height: '14px', borderRadius: '2px', backgroundColor: 'var(--primary)' }} />
            <span>Consultant Tasks</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
          <Info size={15} />
          <span>Business days only (excl. Sat &amp; Sun)</span>
        </div>
      </div>

      {/* Gantt Visual Area */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '280px 1fr', 
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Left Pane - Tasks Directory */}
        <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div 
            style={{ 
              height: `${headerHeight}px`, 
              backgroundColor: 'var(--bg-tertiary)', 
              borderBottom: '2px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 1rem',
              fontWeight: 700,
              fontSize: '0.78rem',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}
          >
            Task Directory
          </div>
          
          {/* List Rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {projectTasks.map((task, idx) => {
              const isParent = tasks.some(t => t.parentId === task.id);
              const assignedConsultant = consultants.find(c => c.id === task.assignedConsultantId);
              return (
                <div 
                  key={task.id}
                  style={{
                    height: `${rowHeight}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 1rem',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                    position: 'relative'
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: isParent ? 700 : 500,
                      color: isParent ? 'var(--text-primary)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingLeft: task.parentId ? '1rem' : '0'
                    }}
                    title={task.name}
                  >
                    {task.parentId && <span style={{ color: 'var(--text-tertiary)', marginRight: '4px' }}>└</span>}
                    {task.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', paddingLeft: task.parentId ? '1.5rem' : '0', marginTop: '0.15rem' }}>
                    {task.durationDays}d{assignedConsultant ? ` · ${assignedConsultant.name.split(' ')[0]}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane - Scrollable Timeline */}
        <div style={{ overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Column Headers Container */}
          <div 
            style={{ 
              display: 'flex', 
              width: `${timelineWidth}px`, 
              height: `${headerHeight}px`, 
              backgroundColor: 'var(--bg-tertiary)', 
              borderBottom: '2px solid var(--border-color)' 
            }}
          >
            {columns.map(col => (
              <div 
                key={col.index} 
                style={{ 
                  width: `${colWidth}px`, 
                  borderRight: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  lineHeight: '1.3'
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{col.dayName}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{col.dateLabel}</span>
              </div>
            ))}
          </div>

          {/* SVG Canvas Area */}
          <div style={{ width: `${timelineWidth}px`, position: 'relative' }}>
            {/* Draw grid columns underneath the SVG using HTML for clean scroll sync */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
              {columns.map(col => (
                <div 
                  key={col.index} 
                  style={{ 
                    width: `${colWidth}px`, 
                    borderRight: '1px solid var(--border-color)', 
                    height: '100%',
                    opacity: 0.25,
                    backgroundColor: col.dayName === 'Mon' ? 'rgba(13, 148, 136, 0.05)' : 'transparent'
                  }} 
                />
              ))}
            </div>

            <svg 
              width={timelineWidth} 
              height={timelineHeight} 
              className="gantt-svg"
              style={{ display: 'block', position: 'relative', zIndex: 2, background: 'transparent' }}
            >
              <defs>
                {/* Arrowhead marker for dependencies */}
                <marker 
                  id="gantt-arrow" 
                  viewBox="0 0 10 10" 
                  refX="6" 
                  refY="5" 
                  markerWidth="5" 
                  markerHeight="5" 
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="var(--accent)" />
                </marker>
              </defs>

              {/* Rows Backdrops */}
              {projectTasks.map((_, idx) => (
                <rect 
                  key={idx}
                  x={0}
                  y={idx * rowHeight}
                  width={timelineWidth}
                  height={rowHeight}
                  fill={idx % 2 === 0 ? 'transparent' : 'var(--bg-primary)'}
                  opacity={0.3}
                />
              ))}

              {/* Vertical half-day subgrids */}
              {columns.map(col => (
                <line 
                  key={`line-${col.index}`}
                  x1={col.index * colWidth + halfColWidth}
                  y1={0}
                  x2={col.index * colWidth + halfColWidth}
                  y2={timelineHeight}
                  stroke="var(--border-color)"
                  strokeWidth={0.5}
                  strokeDasharray="2 2"
                />
              ))}

              {/* Dependency Connection Lines */}
              {projectTasks.map((task, idx) => {
                if (!task.predecessorIds || task.predecessorIds.length === 0) return null;
                const y2 = idx * rowHeight + rowHeight / 2;
                const x2 = (task.startHalfDay || 0) * halfColWidth;

                return task.predecessorIds.map(predId => {
                  const predTaskIdx = projectTasks.findIndex(t => t.id === predId);
                  if (predTaskIdx === -1) return null;
                  
                  const predTask = projectTasks[predTaskIdx];
                  const y1 = predTaskIdx * rowHeight + rowHeight / 2;
                  const x1 = ((predTask.endHalfDay || 0) + 1) * halfColWidth;

                  const intermediateX = x1 + 12;
                  const pathData = `M ${x1} ${y1} L ${intermediateX} ${y1} L ${intermediateX} ${y2} L ${x2} ${y2}`;

                  return (
                    <path 
                      key={`${predId}-${task.id}`}
                      d={pathData}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      markerEnd="url(#gantt-arrow)"
                      opacity={0.8}
                    />
                  );
                });
              })}

              {/* Task Bars */}
              {projectTasks.map((task, idx) => {
                const isParent = tasks.some(t => t.parentId === task.id);
                const startHalf = task.startHalfDay || 0;
                const endHalf = task.endHalfDay || 0;
                
                const x = startHalf * halfColWidth;
                const w = (endHalf - startHalf + 1) * halfColWidth;
                const y = idx * rowHeight + (rowHeight - 24) / 2; // center the 24px bar in 48px row
                const h = 24;

                const assignedConsultant = consultants.find(c => c.id === task.assignedConsultantId);
                const barColor = isParent 
                  ? 'var(--text-secondary)' 
                  : (assignedConsultant?.avatarColor || 'var(--primary)');

                // Only show text inside bar if bar is wide enough
                const showBarText = !isParent && w >= 120;

                return (
                  <g key={`group-${task.id}`}>
                    {/* ClipPath for text inside bars */}
                    {!isParent && (
                      <defs>
                        <clipPath id={`clip-${task.id}`}>
                          <rect x={x} y={y} width={w} height={h} rx={4} ry={4} />
                        </clipPath>
                      </defs>
                    )}

                    {/* Task Bar Rect */}
                    {isParent ? (
                      <g>
                        <rect 
                          x={x} 
                          y={y + 4} 
                          width={w} 
                          height={6} 
                          fill={barColor}
                          rx={1}
                        />
                        {/* Downward extensions at start and end */}
                        <rect x={x} y={y + 4} width={3} height={14} fill={barColor} />
                        <rect x={x + w - 3} y={y + 4} width={3} height={14} fill={barColor} />
                      </g>
                    ) : (
                      <rect 
                        className="gantt-bar"
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={barColor}
                        rx={4}
                        ry={4}
                        opacity={task.status === 'completed' ? 0.6 : 0.9}
                      />
                    )}

                    {/* Text inside the bar (clipped) */}
                    {showBarText && (
                      <text
                        x={x + 8}
                        y={y + h / 2 + 4}
                        fill="white"
                        fontSize="11px"
                        fontFamily="var(--font-body)"
                        pointerEvents="none"
                        clipPath={`url(#clip-${task.id})`}
                      >
                        {task.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
