import React, { useState } from 'react';
import { X, CheckCircle2, ClipboardCheck, ArrowRight } from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';
import SurveyorSelect from '../../components/SurveyorSelect.jsx';

export default function Stage4SurveyModal({
  ticket,
  nextStage,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [surveyorName, setSurveyorName] = useState(ticket?.surveyor_name || '');
  const [surveyorPhone, setSurveyorPhone] = useState(ticket?.surveyor_phone || '');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSurveyorChange = ({ name, phone }) => {
    setSurveyorName(name);
    setSurveyorPhone(phone);
    if (name) setErrorMsg('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!surveyorName.trim()) {
      setErrorMsg('Please select or add an insurance surveyor to continue.');
      return;
    }

    onSubmit({
      targetStageId: 4,
      surveyorName: surveyorName.trim(),
      surveyorPhone: surveyorPhone.trim(),
      notes,
    });
  };

  const vehiclePlate = ticket?.vehicle_no || ticket?.vehicle_plate || 'VEHICLE';
  const vehicleModel = ticket?.model || ticket?.vehicle_model || 'Honda Vehicle';
  const insurer = ticket?.insurance_company || 'Insurance Claim';

  return (
    <DesktopWindow
      title={`Stage 4: Surveyor Assignment & Inspection — ${vehiclePlate}`}
      icon={ClipboardCheck}
      onClose={onClose}
      defaultWidth="560px"
    >
      <div className="modal-header">
        <div className="modal-title">
          <span
            style={{
              backgroundColor: 'var(--honda-red)',
              color: '#ffffff',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 800,
            }}
          >
            STAGE 4
          </span>
          <span>Survey & Inspection</span>
          <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 500 }}>
            — {vehiclePlate} ({vehicleModel})
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Context Card */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                {vehiclePlate} • {vehicleModel}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {insurer}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '4px' }}>
              Advancing ticket to <strong>Stage 4: Survey</strong>. Surveyor inspection target SLA is{' '}
              <strong>{nextStage?.slaLimitWD || 3} Working Days</strong>.
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                borderRadius: 'var(--radius-md)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Surveyor Selection Component with Dropdown & On-The-Fly Add */}
          <SurveyorSelect
            selectedName={surveyorName}
            selectedPhone={surveyorPhone}
            onChange={handleSurveyorChange}
            required={true}
          />

          {/* Stage Notes / Inspection Remarks */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Inspection & Survey Remarks (Optional)</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. Physical survey scheduled for 2:00 PM, bumper overhaul to be inspected..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            <CheckCircle2 size={14} />
            <span>{isSubmitting ? 'Advancing to Survey...' : 'Confirm Stage 4 Survey'}</span>
          </button>
        </div>
      </form>
    </DesktopWindow>
  );
}
