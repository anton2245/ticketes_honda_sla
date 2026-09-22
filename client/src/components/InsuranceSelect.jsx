import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Shield, Check, X, ChevronDown, Building2, Plus, Phone } from 'lucide-react';
import { fetchInsurers } from '../api/insurance.js';

export default function InsuranceSelect({
  value = '',
  onChange,
  required = false,
  placeholder = 'Search insurance company or enter name...',
}) {
  const [insurers, setInsurers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);

  // Sync searchQuery when external value changes
  useEffect(() => {
    setSearchQuery(value || '');
  }, [value]);

  // Load insurers list on mount
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchInsurers()
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : [];
          setInsurers(list);
        }
      })
      .catch((err) => {
        console.error('Failed to load insurers:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Filter insurers based on searchQuery
  const filteredInsurers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return insurers;
    return insurers.filter((ins) => {
      const nameMatch = ins.name && ins.name.toLowerCase().includes(q);
      const contactMatch = ins.contact_info && ins.contact_info.toLowerCase().includes(q);
      return nameMatch || contactMatch;
    });
  }, [insurers, searchQuery]);

  const handleSelect = (ins) => {
    setSearchQuery(ins.name);
    setShowDropdown(false);
    if (onChange) onChange(ins.name, ins);
  };

  const handleClear = () => {
    setSearchQuery('');
    setShowDropdown(false);
    if (onChange) onChange('', null);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleInputChange = (val) => {
    setSearchQuery(val);
    setShowDropdown(true);
    if (onChange) onChange(val, null);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          className="form-input"
          required={required && !value}
          placeholder={loading ? 'Loading insurance companies...' : placeholder}
          value={searchQuery}
          disabled={loading}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          style={{
            width: '100%',
            paddingRight: value ? '55px' : '30px',
            backgroundColor: '#ffffff',
            fontSize: '12.5px',
            fontWeight: value ? 600 : 400,
          }}
        />

        <div
          style={{
            position: 'absolute',
            right: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {value && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={handleClear}
              style={{ padding: '2px', color: '#94a3b8' }}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              setShowDropdown((prev) => !prev);
              if (inputRef.current) inputRef.current.focus();
            }}
            style={{ padding: '2px', color: '#64748b' }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Floating Suggestions Dropdown (similar to estimation dropdown) */}
      {showDropdown && !loading && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 100,
            marginTop: '4px',
          }}
        >
          {filteredInsurers.length > 0 ? (
            filteredInsurers.map((ins) => {
              const isSelected = (ins.name || '').toLowerCase() === (value || '').toLowerCase();

              return (
                <div
                  key={ins.id || ins.name}
                  onMouseDown={() => handleSelect(ins)}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = isSelected ? '#f8fafc' : '#ffffff')
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#ecfdf5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#059669',
                        fontWeight: 700,
                        fontSize: '11px',
                      }}
                    >
                      <Shield size={12} color="#059669" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{ins.name}</div>
                      {ins.contact_info && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>{ins.contact_info}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {ins.active_count !== undefined && ins.active_count > 0 && (
                      <span
                        style={{
                          fontSize: '9.5px',
                          color: '#059669',
                          backgroundColor: '#ecfdf5',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        {ins.active_count} active
                      </span>
                    )}
                    {isSelected && <Check size={14} color="#16a34a" />}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '10px 12px', color: 'var(--text-subtle)', fontStyle: 'italic', fontSize: '12px' }}>
              No insurance companies matching "{searchQuery}"
            </div>
          )}

          {/* Quick Option to use typed text */}
          {searchQuery.trim() && !filteredInsurers.some(i => i.name.toLowerCase() === searchQuery.trim().toLowerCase()) && (
            <div
              onMouseDown={() => {
                if (onChange) onChange(searchQuery.trim(), null);
                setShowDropdown(false);
              }}
              style={{
                padding: '9px 12px',
                backgroundColor: '#f0fdf4',
                borderTop: '1px solid #bbf7d0',
                cursor: 'pointer',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dcfce7')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f0fdf4')}
            >
              <Plus size={13} color="#166534" />
              <span>Use custom "{searchQuery.trim()}" as insurance company</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
