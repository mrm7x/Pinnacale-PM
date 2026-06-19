import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface WinComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  enableSearch?: boolean;
  menuPosition?: 'bottom' | 'top';
}

export function WinComboBox({ value, onChange, options, placeholder = 'Select...', className = '', disabled = false, enableSearch = false, menuPosition = 'bottom' }: WinComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Close only if click is outside BOTH the trigger and the portaled menu.
      if (
        containerRef.current && !containerRef.current.contains(event.target as Node) &&
        menuRef.current && !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Use useLayoutEffect so position is set before the browser paints — prevents
  // a one-frame flash of the menu at (0,0).
  const computeMenuStyle = () => {
    const trigger = containerRef.current;
    if (!trigger) return {};
    const rect = trigger.getBoundingClientRect();
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 10000,
      left: `${rect.left}px`,
      minWidth: `${rect.width}px`,
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      backdropFilter: 'blur(40px) saturate(150%)',
      WebkitBackdropFilter: 'blur(40px) saturate(150%)',
      maxHeight: '250px',
      overflowY: 'auto',
      padding: '0.25rem'
    };

    if (menuPosition === 'bottom') {
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 260 && rect.top > spaceBelow) {
        style.bottom = `${window.innerHeight - rect.top + 4}px`;
      } else {
        style.top = `${rect.bottom + 4}px`;
      }
    } else {
      const spaceAbove = rect.top;
      if (spaceAbove < 260 && (window.innerHeight - rect.bottom) > spaceAbove) {
        style.top = `${rect.bottom + 4}px`;
      } else {
        style.bottom = `${window.innerHeight - rect.top + 4}px`;
      }
    }
    return style;
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      return;
    }
    setMenuStyle(computeMenuStyle());
  }, [isOpen, menuPosition]);

  // Keep menu in view on scroll / resize
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const trigger = containerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuStyle(prev => (prev.top !== undefined
        ? { ...prev, left: `${rect.left}px`, minWidth: `${rect.width}px`, top: `${rect.bottom + 4}px` }
        : { ...prev, left: `${rect.left}px`, minWidth: `${rect.width}px`, bottom: `${window.innerHeight - rect.top + 4}px` }
      ));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  const filteredClassName = className?.replace(/\b(form-select|form-input)\b/g, '').trim();

  const filteredOptions = enableSearch && searchTerm
    ? options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div 
      className={`win-combobox-container ${filteredClassName}`} 
      ref={containerRef}
      style={{ position: 'relative', width: '100%', opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
    >
      {/* Trigger Button */}
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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? selectedOption.label : <span style={{ opacity: 0.6 }}>{placeholder}</span>}
        </span>
        {isOpen ? <ChevronUp size={16} style={{ opacity: 0.6 }} /> : <ChevronDown size={16} style={{ opacity: 0.6 }} />}
      </div>

      {/* Flyout Menu — portaled to body to escape all clipping containers */}
      {isOpen && createPortal(
        <div ref={menuRef} style={menuStyle}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {enableSearch && (
              <div style={{ padding: '0.25rem 0.5rem 0.5rem 0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.25rem' }}>
                <input 
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--input-border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '0.5rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.9rem', textAlign: 'center' }}>
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  if (option.value !== value) {
                    onChange(option.value);
                  }
                  setIsOpen(false);
                }}
                style={{
                  padding: '0.4rem 0.8rem',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: option.value === value ? 'var(--primary)' : 'transparent',
                  color: option.value === value ? 'white' : 'var(--text-primary)',
                  margin: '0.1rem 0',
                  transition: 'background-color 0.1s',
                  fontSize: '0.95rem'
                }}
                onMouseEnter={(e) => {
                  if (option.value !== value) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    const rootDark = document.documentElement.classList.contains('dark');
                    if (rootDark) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (option.value !== value) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {option.label}
              </div>
            ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
