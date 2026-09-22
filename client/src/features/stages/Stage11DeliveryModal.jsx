import React, { useState } from 'react';
import { X, CheckCircle2, KeyRound } from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage11DeliveryModal({
  ticket,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [gatePass, setGatePass] = useState('');
  const [recipient, setRecipient] = useState(ticket?.customer_name || '');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const delDetails = [
      gatePass ? `Gate Pass: ${gatePass}` : '',
      recipient ? `Handed to: ${recipient}` : '',
      notes,
    ].filter(Boolean).join(' • ');

    onSubmit({
      targetStageId: 11,
      gatePassNumber: gatePass,
      deliveredTo: recipient,
      notes: delDetails,
    });
  };

  return (
    <DesktopWindow
      title={`Stage 11: Vehicle Delivery & Gate Pass Release — ${ticket?.vehicle_plate || ''}`}
      icon={KeyRound}
      onClose={onClose}
      defaultWidth="540px"
    >
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ backgroundColor: 'var(--honda-red)', color: '#ffffff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
              STAGE 11
            </span>
            <span>Vehicle Delivery & Gate Pass Release</span>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Gate Pass Number *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. GP-2026-901"
                  value={gatePass}
                  onChange={e => setGatePass(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Delivered / Handed Over To *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Customer Name / Representative"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Delivery Notes / Handover Feedback</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Customer inspected vehicle, satisfied with paint finish, keys handed over..."
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
              <span>{isSubmitting ? 'Releasing...' : 'Confirm Delivery & Release Vehicle'}</span>
            </button>
          </div>
        </form>
    </DesktopWindow>
  );
}
