import React, { useState } from 'react';
import { X, CheckCircle2, Wrench } from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage8WorkStartModal({
  ticket,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [technician, setTechnician] = useState('');
  const [bay, setBay] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const details = [
      technician ? `Tech: ${technician}` : '',
      bay ? `Bay: ${bay}` : '',
      notes,
    ].filter(Boolean).join(' • ');

    onSubmit({
      targetStageId: 8,
      technicianName: technician,
      repairBay: bay,
      notes: details,
    });
  };

  return (
    <DesktopWindow
      title={`Stage 8: Commence Repair Work — ${ticket?.vehicle_plate || ''}`}
      icon={Wrench}
      onClose={onClose}
      defaultWidth="540px"
    >
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ backgroundColor: 'var(--honda-red)', color: '#ffffff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
              STAGE 8
            </span>
            <span>Commence Repair Work</span>
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
                <label className="form-label">Assigned Technician / Lead *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Ramesh Kumar (Bodyshop)"
                  value={technician}
                  onChange={e => setTechnician(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Bodyshop Bay / Booth</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Bay 4 (Paint Booth)"
                  value={bay}
                  onChange={e => setBay(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Repair Execution Remarks</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Vehicle moved to frame machine for alignment, paint preparation started..."
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
              <span>{isSubmitting ? 'Starting Work...' : 'Commence Work (Stage 8)'}</span>
            </button>
          </div>
        </form>
    </DesktopWindow>
  );
}
