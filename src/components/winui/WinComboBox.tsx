import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface WinComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function WinComboBox({ value, onChange, options, placeholder = 'Select...', className = '', disabled = false }: WinComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClassName = className?.replace(/\b(form-select|form-input)\b/g, '').trim();

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

      {/* Flyout Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          maxHeight: '250px',
          overflowY: 'auto',
          zIndex: 1000,
          padding: '0.25rem'
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '0.5rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
              No options available
            </div>
          ) : (
            options.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
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
      )}
    </div>
  );
}
