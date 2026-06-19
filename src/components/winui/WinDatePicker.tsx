import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface WinDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function WinDatePicker({ value, onChange, className = '', disabled = false }: WinDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track currently viewed month in the calendar
  const [viewDate, setViewDate] = useState(() => {
    return value ? new Date(value) : new Date();
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const trigger = containerRef.current;
    if (!trigger) return;
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
      backdropFilter: 'blur(40px) saturate(150%)',
      WebkitBackdropFilter: 'blur(40px) saturate(150%)',
      padding: '1rem'
    };
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 300 && rect.top > spaceBelow) {
      style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      style.top = `${rect.bottom + 4}px`;
    }
    setMenuStyle(style);
  }, [isOpen]);

  // Keep menu in view on scroll / resize
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const trigger = containerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuStyle(prev => ({
        ...prev,
        left: `${rect.left}px`,
        ...(prev.top !== undefined
          ? { top: `${rect.bottom + 4}px` }
          : { bottom: `${window.innerHeight - rect.top + 4}px` })
      }));
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
      <div style={menuStyle}>
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
          padding: '0.45rem 0.8rem',
          backgroundColor: isOpen ? 'var(--bg-secondary)' : 'var(--input-fill)',
          borderBottomWidth: isOpen ? '2px' : '1px',
          borderBottomColor: isOpen ? 'var(--primary)' : 'var(--input-border-bottom)',
          paddingBottom: isOpen ? 'calc(0.45rem - 1px)' : '0.45rem',
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
