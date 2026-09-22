import React, { useState } from 'react';
import { X, CheckCircle2, ShieldCheck } from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage9WorkCompleteModal({
  ticket,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [qcInspector, setQcInspector] = useState('');
  const [paintChecked, setPaintChecked] = useState(true);
  const [alignmentChecked, setAlignmentChecked] = useState(true);
  const [washChecked, setWashChecked] = useState(true);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const qcSummary = [
      qcInspector ? `Inspector: ${qcInspector}` : '',
      paintChecked ? 'Paint QC Passed' : '',
      alignmentChecked ? 'Panel Gap Passed' : '',
      washChecked ? 'Washed & Polished' : '',
      notes,
    ].filter(Boolean).join(' • ');

    onSubmit({
      targetStageId: 9,
      notes: qcSummary,
    });
  };

  return (
    <DesktopWindow
      title={`Stage 9: Quality Inspection & Work Complete — ${ticket?.vehicle_plate || ''}`}
      icon={ShieldCheck}
      onClose={onClose}
      defaultWidth="540px"
    >
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ backgroundColor: 'var(--honda-red)', color: '#ffffff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
              STAGE 9
            </span>
            <span>Quality Inspection & Work Complete</span>
            <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 500 }}>
              — {ticket.vehicle_plate}
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">QC Inspector / Floor Manager *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. Suresh Verma (QC Lead)"
                value={qcInspector}
                onChange={e => setQcInspector(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '14px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '10px 14px', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Quality Verification Checklist
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  <input type="checkbox" checked={paintChecked} onChange={e => setPaintChecked(e.target.checked)} />
                  <span>Paint color match & clearcoat inspection verified</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  <input type="checkbox" checked={alignmentChecked} onChange={e => setAlignmentChecked(e.target.checked)} />
                  <span>Panel gap alignment and bumper fitment verified</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  <input type="checkbox" checked={washChecked} onChange={e => setWashChecked(e.target.checked)} />
                  <span>Final detailing, vacuum & wash completed</span>
                </label>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Completion Remarks</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Body repairs and painting passed inspection, ready for billing..."
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
              <span>{isSubmitting ? 'Finalizing...' : 'Pass QC & Complete (Stage 9)'}</span>
            </button>
          </div>
        </form>
    </DesktopWindow>
  );
}
