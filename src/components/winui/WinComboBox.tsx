import { useState, useRef, useEffect } from 'react';
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

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
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

      {/* Flyout Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: menuPosition === 'bottom' ? 'calc(100% + 4px)' : 'auto',
          bottom: menuPosition === 'top' ? 'calc(100% + 4px)' : 'auto',
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
        </div>
      )}
    </div>
  );
}
