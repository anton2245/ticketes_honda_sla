import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserPlus, UserCheck, Phone, Check, AlertCircle, Loader2, X, Search, ChevronDown, Building2 } from 'lucide-react';
import { fetchSurveyors, createSurveyor } from '../api/insurance.js';

export default function SurveyorSelect({
  selectedName = '',
  selectedPhone = '',
  onChange,
  required = true,
}) {
  const [surveyors, setSurveyors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(selectedName || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justAddedMsg, setJustAddedMsg] = useState('');

  const inputRef = useRef(null);

  // Sync searchQuery when selectedName changes externally
  useEffect(() => {
    setSearchQuery(selectedName || '');
  }, [selectedName]);

  // Load surveyors list on mount
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSurveyors()
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : [];
          setSurveyors(list);
        }
      })
      .catch((err) => {
        console.error('Failed to load surveyors:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Filter surveyors based on searchQuery
  const filteredSurveyors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return surveyors;
    return surveyors.filter((s) => {
      const nameMatch = s.name && s.name.toLowerCase().includes(q);
      const phoneMatch = s.phone && s.phone.includes(q);
      const companyMatch = s.insurance_company_name && s.insurance_company_name.toLowerCase().includes(q);
      return nameMatch || phoneMatch || companyMatch;
    });
  }, [surveyors, searchQuery]);

  const handleSelect = (s) => {
    setSearchQuery(s.name);
    setShowDropdown(false);
    onChange({
      name: s.name,
      phone: s.phone || '',
    });
  };

  const handleClear = () => {
    setSearchQuery('');
    setShowDropdown(false);
    onChange({ name: '', phone: '' });
    if (inputRef.current) inputRef.current.focus();
  };

  const handleInputChange = (val) => {
    setSearchQuery(val);
    setShowDropdown(true);
    // If user clears the input
    if (!val.trim()) {
      onChange({ name: '', phone: '' });
    } else {
      // Check if exact match
      const exact = surveyors.find((s) => s.name.toLowerCase() === val.trim().toLowerCase());
      if (exact) {
        onChange({ name: exact.name, phone: exact.phone || '' });
      } else {
        onChange({ name: val, phone: selectedPhone });
      }
    }
  };

  // Handle on-the-fly creation
  const handleCreateOnTheFly = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      setSaveError('Please enter surveyor full name.');
      return;
    }
    if (!newPhone.trim()) {
      setSaveError('Please enter surveyor phone number.');
      return;
    }

    setSavingNew(true);
    setSaveError('');

    try {
      const payload = {
        name: newName.trim(),
        phone: newPhone.trim(),
      };
      const res = await createSurveyor(payload);
      const newSurvObj = {
        id: res?.id || Date.now(),
        name: payload.name,
        phone: payload.phone,
      };

      setSurveyors((prev) => [newSurvObj, ...prev]);
      setSearchQuery(payload.name);
      onChange({ name: payload.name, phone: payload.phone });
      setJustAddedMsg(`✓ Added "${payload.name}" and selected!`);
      setNewName('');
      setNewPhone('');
      setIsAddingNew(false);
      setShowDropdown(false);

      setTimeout(() => setJustAddedMsg(''), 4000);
    } catch (err) {
      setSaveError(err.message || 'Failed to register surveyor. Please try again.');
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label className="form-label" style={{ marginBottom: 0 }}>
          Assigned Insurance Surveyor {required ? '*' : ''}
        </label>
        {!isAddingNew && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              setIsAddingNew(true);
              setNewName(searchQuery !== selectedName ? searchQuery : '');
              setSaveError('');
              setShowDropdown(false);
            }}
            style={{
              color: 'var(--honda-red)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 700,
              fontSize: '11px',
              padding: '2px 6px',
            }}
          >
            <UserPlus size={13} />
            <span>+ Add Surveyor on the fly</span>
          </button>
        )}
      </div>

      {justAddedMsg && (
        <div
          style={{
            padding: '6px 10px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            borderRadius: 'var(--radius-md)',
            fontSize: '11.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Check size={14} color="#16a34a" />
          <span>{justAddedMsg}</span>
        </div>
      )}

      {/* Searchable Autocomplete Input matching Estimation */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            required={required && !selectedName}
            placeholder={loading ? "Loading surveyors roster..." : "Search surveyor by name, phone or company..."}
            value={searchQuery}
            disabled={loading || savingNew}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            style={{
              width: '100%',
              paddingRight: selectedName ? '55px' : '30px',
              backgroundColor: '#ffffff',
              fontSize: '12.5px',
              fontWeight: selectedName ? 600 : 400,
            }}
          />

          <div style={{
            position: 'absolute',
            right: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            {selectedName && (
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
                setShowDropdown(prev => !prev);
                if (inputRef.current) inputRef.current.focus();
              }}
              style={{ padding: '2px', color: '#64748b' }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Suggestions Dropdown (floating below input, identical to estimation modal) */}
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
            {filteredSurveyors.length > 0 ? (
              filteredSurveyors.map((s) => (
                <div
                  key={s.id || s.name}
                  onMouseDown={() => handleSelect(s)}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: s.name === selectedName ? '#f8fafc' : '#ffffff',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = s.name === selectedName ? '#f8fafc' : '#ffffff')
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563eb',
                      fontWeight: 700,
                      fontSize: '11px'
                    }}>
                      {s.name ? s.name.charAt(0).toUpperCase() : 'S'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{s.name}</div>
                      {s.phone && (
                        <div style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={10} color="#64748b" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {s.insurance_company_name && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#0369a1',
                          backgroundColor: '#e0f2fe',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Building2 size={10} />
                        <span>{s.insurance_company_name}</span>
                      </span>
                    )}
                    {s.name === selectedName && <Check size={14} color="#16a34a" />}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '10px 12px', color: 'var(--text-subtle)', fontStyle: 'italic', fontSize: '12px' }}>
                No surveyors matching "{searchQuery}"
              </div>
            )}

            {/* Quick action to register on the fly inside dropdown */}
            <div
              onMouseDown={() => {
                setIsAddingNew(true);
                setNewName(searchQuery);
                setShowDropdown(false);
              }}
              style={{
                padding: '9px 12px',
                backgroundColor: '#fff7ed',
                borderTop: '1px solid #fed7aa',
                cursor: 'pointer',
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--honda-red)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ffedd5')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff7ed')}
            >
              <UserPlus size={13} color="var(--honda-red)" />
              <span>+ Register new surveyor "{searchQuery || '...'}" on the fly</span>
            </div>
          </div>
        )}
      </div>

      {/* Selected Surveyor Details Badge */}
      {selectedName && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: '#f8fafc',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={16} color="#16a34a" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{selectedName}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Phone size={10} />
                <span>{selectedPhone || 'No phone recorded'}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={handleClear}
            title="Clear surveyor selection"
            style={{ color: '#64748b' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Inline On-The-Fly Surveyor Registration Form */}
      {isAddingNew && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: '#fafafa',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserPlus size={14} color="var(--honda-red)" />
              <span>Register New Surveyor</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                setIsAddingNew(false);
                setSaveError('');
              }}
            >
              <X size={14} />
            </button>
          </div>

          {saveError && (
            <div
              style={{
                padding: '6px 10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                borderRadius: 'var(--radius-md)',
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertCircle size={14} />
              <span>{saveError}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: '8px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>
                Full Name *
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Rajesh Kumar"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>
                Phone Number *
              </label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateOnTheFly}
              disabled={savingNew}
              style={{
                fontSize: '11.5px',
                padding: '7px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {savingNew ? (
                <>
                  <Loader2 size={13} className="spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={13} />
                  <span>Save & Select</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
