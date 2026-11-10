import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface WinDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  /** Open the calendar immediately on mount (used by inline cell editors). */
  defaultOpen?: boolean;
  /** Called when the calendar is dismissed without picking a date (outside click / Escape). */
  onClose?: () => void;
  /** When provided, shows a "Clear" action in the calendar footer. */
  onClear?: () => void;
  clearLabel?: string;
}

export function WinDatePicker({ value, onChange, className = '', disabled = false, defaultOpen = false, onClose, onClear, clearLabel = 'Clear' }: WinDatePickerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Ref so the long-lived document listeners always see the latest callback.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  
  // Track currently viewed month in the calendar
  const [viewDate, setViewDate] = useState(() => {
    return value ? new Date(value) : new Date();
  });

  // Sync calendar view to the selected value when it changes externally
  useEffect(() => {
    if (value) setViewDate(new Date(value));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(event.target as Node) &&
        menuRef.current && !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        onCloseRef.current?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape dismisses the open calendar.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Use useLayoutEffect so position is set before the browser paints.
  const computeMenuStyle = () => {
    const trigger = containerRef.current;
    if (!trigger) return {};
    const rect = trigger.getBoundingClientRect();
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 10000,
      left: `${rect.left}px`,
      width: '280px',
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '1rem'
    };
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 300 && rect.top > spaceBelow) {
      style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      style.top = `${rect.bottom + 4}px`;
    }
    return style;
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    setMenuStyle(computeMenuStyle());
  }, [isOpen]);

  // Keep menu in view on scroll / resize
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const trigger = containerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuStyle(prev => (prev.top !== undefined
        ? { ...prev, left: `${rect.left}px`, top: `${rect.bottom + 4}px` }
        : { ...prev, left: `${rect.left}px`, bottom: `${window.innerHeight - rect.top + 4}px` }
      ));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    // Empty slots for previous month days
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="win-cal-day empty" />);
    }
    
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = value === dateStr;
      
      days.push(
        <div
          key={dateStr}
          className={`win-cal-day ${isSelected ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onChange(dateStr);
            setIsOpen(false);
          }}
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            cursor: 'pointer',
            backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
            color: isSelected ? 'white' : 'var(--text-primary)',
            fontSize: '0.85rem',
            margin: 'auto'
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
              if (document.documentElement.classList.contains('dark')) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              }
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          {i}
        </div>
      );
    }

    return (
      <div ref={menuRef} style={menuStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost btn-icon" onClick={handlePrevMonth}><ChevronLeft size={16} /></button>
            <button className="btn btn-ghost btn-icon" onClick={handleNextMonth}><ChevronRight size={16} /></button>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {days}
        </div>

        {onClear && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); onClear(); }}
            >
              {clearLabel}
            </button>
          </div>
        )}
      </div>
    );
  };

  const filteredClassName = className?.replace(/\b(form-select|form-input)\b/g, '').trim();

  return (
    <div 
      className={`win-datepicker-container ${filteredClassName}`} 
      ref={containerRef}
      style={{ position: 'relative', width: '100%', opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
    >
      <div 
        className="form-input"
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer',
          padding: '7px 11px',
          ...(isOpen ? { borderColor: 'var(--accent-ink)', boxShadow: '0 0 0 3px var(--accent-soft)' } : {}),
          userSelect: 'none'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value || <span style={{ opacity: 0.6 }}>Select Date...</span>}</span>
        <CalendarIcon size={16} style={{ opacity: 0.6 }} />
      </div>

      {isOpen && createPortal(renderCalendar(), document.body)}
    </div>
  );
}
