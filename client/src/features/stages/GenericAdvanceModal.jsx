import React, { useState } from 'react';
import { ArrowRight, X, CheckCircle2 } from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';
import SurveyorSelect from '../../components/SurveyorSelect.jsx';
import InsuranceSelect from '../../components/InsuranceSelect.jsx';

export default function GenericAdvanceModal({
  ticket,
  nextStage,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [notes, setNotes] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState(ticket?.insurance_company || '');
  const [surveyorName, setSurveyorName] = useState(ticket?.surveyor_name || '');
  const [surveyorPhone, setSurveyorPhone] = useState(ticket?.surveyor_phone || '');
  const [invoiceAmount, setInvoiceAmount] = useState(ticket?.estimated_cost || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      targetStageId: nextStage.id,
      notes,
    };

    if (nextStage.id === 3) {
      payload.insuranceCompany = insuranceCompany;
    } else if (nextStage.id === 4) {
      payload.surveyorName = surveyorName;
      payload.surveyorPhone = surveyorPhone;
    } else if (nextStage.id === 10) {
      payload.invoiceAmount = invoiceAmount;
    }

    onSubmit(payload);
  };

  return (
    <DesktopWindow
      title={`Advance Stage ${nextStage?.id}: ${nextStage?.name || ''}`}
      icon={ArrowRight}
      onClose={onClose}
      defaultWidth="540px"
    >
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ backgroundColor: 'var(--honda-red)', color: '#ffffff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
              STAGE {nextStage?.id}
            </span>
            <span>Advance to {nextStage?.name}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body">
            <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                {ticket?.vehicle_plate || 'Vehicle'} • {ticket?.vehicle_model || 'Honda'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>
                Advancing from <strong>Stage {ticket?.current_stage_id}</strong> to <strong>Stage {nextStage?.id}: {nextStage?.name}</strong>.
                Target SLA for this stage: <strong>{nextStage?.slaLimitWD} Working Days</strong>.
              </div>
            </div>

            {/* Stage 3: Insurance Intimation */}
            {nextStage?.id === 3 && (
              <div className="form-group">
                <label className="form-label">Insurance Company Name *</label>
                <InsuranceSelect
                  value={insuranceCompany}
                  onChange={(val) => setInsuranceCompany(val)}
                  required={true}
                  placeholder="Search insurance company or enter name..."
                />
              </div>
            )}

            {/* Stage 4: Survey */}
            {nextStage?.id === 4 && (
              <SurveyorSelect
                selectedName={surveyorName}
                selectedPhone={surveyorPhone}
                onChange={({ name, phone }) => {
                  setSurveyorName(name);
                  setSurveyorPhone(phone);
                }}
                required={true}
              />
            )}

            {/* Stage 10: Invoicing */}
            {nextStage?.id === 10 && (
              <div className="form-group">
                <label className="form-label">Final Invoiced Amount (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min="0"
                  value={invoiceAmount}
                  onChange={e => setInvoiceAmount(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                />
              </div>
            )}

            {/* Remarks / Scope */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Stage Progress Remarks (Optional)</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Enter notes or updates for this stage transition..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Advancing Stage...' : `Confirm Stage ${nextStage?.id}`}</span>
            </button>
          </div>
        </form>
    </DesktopWindow>
  );
}
