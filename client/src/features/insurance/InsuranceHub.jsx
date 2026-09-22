import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Shield, UserCheck, Plus, Phone, Mail, FileText, CheckCircle2, AlertTriangle, X, Edit2, Trash2 } from 'lucide-react';
import { fetchInsurers, fetchInsurer, createInsurer, deleteInsurer, fetchSurveyors, fetchSurveyor, createSurveyor, deleteSurveyor } from '../../api/insurance.js';

export default function InsuranceHub({ onOpenTicket }) {
  const [activeSubtab, setActiveSubtab] = useState('INSURERS'); // INSURERS or SURVEYORS

  // --- INSURERS STATE ---
  const [insurers, setInsurers] = useState([]);
  const [selectedInsurerId, setSelectedInsurerId] = useState(null);
  const [selectedInsurerDossier, setSelectedInsurerDossier] = useState(null);
  const [insurerSearch, setInsurerSearch] = useState('');
  const [isNewInsurerModalOpen, setIsNewInsurerModalOpen] = useState(false);
  const [newInsurerForm, setNewInsurerForm] = useState({ name: '', contactInfo: '' });

  // --- SURVEYORS STATE ---
  const [surveyors, setSurveyors] = useState([]);
  const [selectedSurveyorId, setSelectedSurveyorId] = useState(null);
  const [selectedSurveyorDossier, setSelectedSurveyorDossier] = useState(null);
  const [surveyorSearch, setSurveyorSearch] = useState('');
  const [isNewSurveyorModalOpen, setIsNewSurveyorModalOpen] = useState(false);
  const [newSurveyorForm, setNewSurveyorForm] = useState({ name: '', phone: '', email: '', insuranceCompanyId: '' });

  // Load insurers
  const loadInsurers = useCallback(async () => {
    try {
      const list = await fetchInsurers();
      setInsurers(list || []);
      if (!selectedInsurerId && list?.length > 0) {
        setSelectedInsurerId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load insurers:', err);
    }
  }, [selectedInsurerId]);

  // Load surveyors
  const loadSurveyors = useCallback(async () => {
    try {
      const list = await fetchSurveyors();
      setSurveyors(list || []);
      if (!selectedSurveyorId && list?.length > 0) {
        setSelectedSurveyorId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load surveyors:', err);
    }
  }, [selectedSurveyorId]);

  useEffect(() => {
    if (activeSubtab === 'INSURERS') {
      loadInsurers();
    } else {
      loadSurveyors();
    }
  }, [activeSubtab, loadInsurers, loadSurveyors]);

  // Load selected insurer dossier
  useEffect(() => {
    if (!selectedInsurerId) {
      setSelectedInsurerDossier(null);
      return;
    }
    fetchInsurer(selectedInsurerId)
      .then(setSelectedInsurerDossier)
      .catch(console.error);
  }, [selectedInsurerId]);

  // Load selected surveyor dossier
  useEffect(() => {
    if (!selectedSurveyorId) {
      setSelectedSurveyorDossier(null);
      return;
    }
    fetchSurveyor(selectedSurveyorId)
      .then(setSelectedSurveyorDossier)
      .catch(console.error);
  }, [selectedSurveyorId]);

  const filteredInsurers = useMemo(() => {
    const q = insurerSearch.toLowerCase().trim();
    return insurers.filter(ins => ins.name?.toLowerCase().includes(q));
  }, [insurers, insurerSearch]);

  const filteredSurveyors = useMemo(() => {
    const q = surveyorSearch.toLowerCase().trim();
    return surveyors.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.phone?.includes(q) ||
      s.insurance_company_name?.toLowerCase().includes(q)
    );
  }, [surveyors, surveyorSearch]);

  const handleCreateInsurer = async (e) => {
    e.preventDefault();
    if (!newInsurerForm.name) return;
    try {
      const res = await createInsurer(newInsurerForm);
      setIsNewInsurerModalOpen(false);
      setNewInsurerForm({ name: '', contactInfo: '' });
      await loadInsurers();
      if (res?.id) setSelectedInsurerId(res.id);
    } catch (err) {
      alert(`Failed to create insurer: ${err.message}`);
    }
  };

  const handleCreateSurveyor = async (e) => {
    e.preventDefault();
    if (!newSurveyorForm.name) return;
    try {
      const res = await createSurveyor(newSurveyorForm);
      setIsNewSurveyorModalOpen(false);
      setNewSurveyorForm({ name: '', phone: '', email: '', insuranceCompanyId: '' });
      await loadSurveyors();
      if (res?.id) setSelectedSurveyorId(res.id);
    } catch (err) {
      alert(`Failed to add surveyor: ${err.message}`);
    }
  };

  const handleDeleteInsurer = async () => {
    if (!selectedInsurerId) return;
    if (!confirm('Are you sure you want to remove this insurance company?')) return;
    try {
      await deleteInsurer(selectedInsurerId);
      setSelectedInsurerId(null);
      await loadInsurers();
    } catch (err) {
      alert(`Failed to delete insurer: ${err.message}`);
    }
  };

  const handleDeleteSurveyor = async () => {
    if (!selectedSurveyorId) return;
    if (!confirm('Are you sure you want to remove this surveyor?')) return;
    try {
      await deleteSurveyor(selectedSurveyorId);
      setSelectedSurveyorId(null);
      await loadSurveyors();
    } catch (err) {
      alert(`Failed to delete surveyor: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
      {/* Header & Subnav */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-light)', padding: '0 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={20} color="var(--honda-red)" />
            <h1 style={{ fontSize: '16px', fontWeight: 800 }}>Insurance & Surveyors Hub</h1>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn-toggle ${activeSubtab === 'INSURERS' ? 'active' : ''}`}
              onClick={() => setActiveSubtab('INSURERS')}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 700 }}
            >
              Insurance Companies ({insurers.length})
            </button>
            <button
              className={`btn-toggle ${activeSubtab === 'SURVEYORS' ? 'active' : ''}`}
              onClick={() => setActiveSubtab('SURVEYORS')}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 700 }}
            >
              Surveyors Directory ({surveyors.length})
            </button>
          </div>

          <div>
            {activeSubtab === 'INSURERS' ? (
              <button
                onClick={() => setIsNewInsurerModalOpen(true)}
                className="btn btn-primary"
                style={{ padding: '5px 12px', fontSize: '12px', gap: '6px' }}
              >
                <Plus size={13} />
                <span>+ Add Insurance</span>
              </button>
            ) : (
              <button
                onClick={() => setIsNewSurveyorModalOpen(true)}
                className="btn btn-primary"
                style={{ padding: '5px 12px', fontSize: '12px', gap: '6px' }}
              >
                <Plus size={13} />
                <span>+ Add Surveyor</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SUBTAB 1: INSURANCE COMPANIES */}
      {activeSubtab === 'INSURERS' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Master List */}
          <div style={{ width: '360px', flexShrink: 0, borderRight: '1px solid var(--border-light)', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#fafbfc' }}>
              <div className="input-with-icon">
                <Search size={14} className="search-icon-svg" />
                <input
                  type="text"
                  value={insurerSearch}
                  onChange={e => setInsurerSearch(e.target.value)}
                  placeholder="Search insurance company..."
                  className="form-input"
                  style={{ fontSize: '12px', height: '30px' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredInsurers.map(ins => {
                const isSelected = ins.id === selectedInsurerId;
                return (
                  <div
                    key={ins.id}
                    onClick={() => setSelectedInsurerId(ins.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      borderLeft: isSelected ? '4px solid var(--honda-red)' : '4px solid transparent',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: 'var(--text-main)' }}>
                      {ins.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>{ins.surveyors?.length || 0} surveyors</span>
                      <span>•</span>
                      <span style={{ color: ins.active_tickets > 0 ? 'var(--honda-red)' : 'var(--text-subtle)', fontWeight: 600 }}>
                        {ins.active_tickets || 0} active claims
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Dossier */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!selectedInsurerDossier ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-subtle)' }}>
                Select an insurance partner to view details and authorized surveyors.
              </div>
            ) : (
              <>
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Shield size={24} />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 800 }}>{selectedInsurerDossier.name}</h2>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {selectedInsurerDossier.contact_info || 'No contact notes registered'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleDeleteInsurer}
                      className="btn btn-outline"
                      style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--honda-red)' }}
                    >
                      Delete Partner
                    </button>
                  </div>
                </div>

                {/* Authorized Surveyors */}
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>
                    Authorized Surveyors ({selectedInsurerDossier.surveyors?.length || 0})
                  </h3>
                  {(!selectedInsurerDossier.surveyors || selectedInsurerDossier.surveyors.length === 0) ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12px' }}>
                      No surveyors mapped to this insurance partner yet.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                      {selectedInsurerDossier.surveyors.map(s => (
                        <div key={s.id} style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: '#fafbfc' }}>
                          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{s.name}</div>
                          {s.phone && (
                            <a href={`tel:${s.phone}`} style={{ fontSize: '12px', color: 'var(--honda-red)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={12} />
                              {s.phone}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Claim Tickets */}
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>
                    Active Insurance Claim Tickets ({selectedInsurerDossier.tickets?.length || 0})
                  </h3>
                  {(!selectedInsurerDossier.tickets || selectedInsurerDossier.tickets.length === 0) ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12px' }}>
                      No active claim tickets under this insurer.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedInsurerDossier.tickets.map(t => (
                        <div
                          key={t.id}
                          onClick={() => onOpenTicket && onOpenTicket(t)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: '#fafbfc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: onOpenTicket ? 'pointer' : 'default',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--honda-red)', fontFamily: 'var(--font-mono)', marginRight: '8px' }}>
                              {t.ticket_number}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '12px' }}>{t.vehicle_no || t.model || 'Vehicle'}</span>
                            <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>Surveyor: {t.surveyor_name || 'Unassigned'}</div>
                          </div>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                            Stage {t.current_stage_id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: SURVEYORS DIRECTORY */}
      {activeSubtab === 'SURVEYORS' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Master List */}
          <div style={{ width: '360px', flexShrink: 0, borderRight: '1px solid var(--border-light)', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#fafbfc' }}>
              <div className="input-with-icon">
                <Search size={14} className="search-icon-svg" />
                <input
                  type="text"
                  value={surveyorSearch}
                  onChange={e => setSurveyorSearch(e.target.value)}
                  placeholder="Search surveyor name, phone..."
                  className="form-input"
                  style={{ fontSize: '12px', height: '30px' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredSurveyors.map(surv => {
                const isSelected = surv.id === selectedSurveyorId;
                return (
                  <div
                    key={surv.id}
                    onClick={() => setSelectedSurveyorId(surv.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      borderLeft: isSelected ? '4px solid var(--honda-red)' : '4px solid transparent',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px', color: 'var(--text-main)' }}>
                      {surv.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                      {surv.phone || 'No phone'}
                    </div>
                    {surv.insurance_company_name && (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#1d4ed8', backgroundColor: '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>
                        {surv.insurance_company_name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Dossier */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!selectedSurveyorDossier ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-subtle)' }}>
                Select a surveyor to view their profile, turnaround SLA, and claims history.
              </div>
            ) : (
              <>
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        backgroundColor: '#fef2f2',
                        color: 'var(--honda-red)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <UserCheck size={24} />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 800 }}>{selectedSurveyorDossier.name}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {selectedSurveyorDossier.phone && (
                            <a href={`tel:${selectedSurveyorDossier.phone}`} style={{ color: 'var(--honda-red)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={12} />
                              {selectedSurveyorDossier.phone}
                            </a>
                          )}
                          {selectedSurveyorDossier.email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Mail size={12} />
                              {selectedSurveyorDossier.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleDeleteSurveyor}
                      className="btn btn-outline"
                      style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--honda-red)' }}
                    >
                      Delete Surveyor
                    </button>
                  </div>
                </div>

                {/* Claims History */}
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>
                    Surveyor Assigned Tickets ({selectedSurveyorDossier.tickets?.length || 0})
                  </h3>
                  {(!selectedSurveyorDossier.tickets || selectedSurveyorDossier.tickets.length === 0) ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12px' }}>
                      No tickets assigned to this surveyor yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedSurveyorDossier.tickets.map(t => (
                        <div
                          key={t.id}
                          onClick={() => onOpenTicket && onOpenTicket(t)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: '#fafbfc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: onOpenTicket ? 'pointer' : 'default',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--honda-red)', fontFamily: 'var(--font-mono)', marginRight: '8px' }}>
                              {t.ticket_number}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '12px' }}>{t.vehicle_no || t.model || 'Vehicle'}</span>
                            <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>Customer: {t.customer_name}</div>
                          </div>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                            Stage {t.current_stage_id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Insurer Modal */}
      {isNewInsurerModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewInsurerModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Add Insurance Company</h3>
              <button onClick={() => setIsNewInsurerModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateInsurer}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Insurance Company Name *</label>
                <input
                  type="text"
                  required
                  value={newInsurerForm.name}
                  onChange={e => setNewInsurerForm({ ...newInsurerForm, name: e.target.value })}
                  className="form-input"
                  placeholder="e.g. HDFC ERGO General Insurance"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">Contact Information / Notes</label>
                <textarea
                  rows={2}
                  value={newInsurerForm.contactInfo}
                  onChange={e => setNewInsurerForm({ ...newInsurerForm, contactInfo: e.target.value })}
                  className="form-textarea"
                  placeholder="Claims desk email, contact numbers, portal URL..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsNewInsurerModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Insurer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Surveyor Modal */}
      {isNewSurveyorModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewSurveyorModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Add Insurance Surveyor</h3>
              <button onClick={() => setIsNewSurveyorModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateSurveyor}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Surveyor Name *</label>
                <input
                  type="text"
                  required
                  value={newSurveyorForm.name}
                  onChange={e => setNewSurveyorForm({ ...newSurveyorForm, name: e.target.value })}
                  className="form-input"
                  placeholder="e.g. Rajesh Sharma"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  value={newSurveyorForm.phone}
                  onChange={e => setNewSurveyorForm({ ...newSurveyorForm, phone: e.target.value })}
                  className="form-input"
                  placeholder="e.g. 9845011223"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  value={newSurveyorForm.email}
                  onChange={e => setNewSurveyorForm({ ...newSurveyorForm, email: e.target.value })}
                  className="form-input"
                  placeholder="e.g. surveyor@email.com"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">Associated Insurance Company</label>
                <select
                  value={newSurveyorForm.insuranceCompanyId}
                  onChange={e => setNewSurveyorForm({ ...newSurveyorForm, insuranceCompanyId: e.target.value })}
                  className="form-select"
                >
                  <option value="">-- Independent / None --</option>
                  {insurers.map(ins => (
                    <option key={ins.id} value={ins.id}>{ins.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsNewSurveyorModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Surveyor</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
