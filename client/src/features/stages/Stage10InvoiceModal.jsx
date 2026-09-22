import React, { useState } from 'react';
import { X, CheckCircle2, Receipt } from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage10InvoiceModal({
  ticket,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [finalAmount, setFinalAmount] = useState(ticket?.estimated_cost || 0);
  const [deductible, setDeductible] = useState(0);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const invDetails = [
      invoiceNo ? `Inv #${invoiceNo}` : '',
      finalAmount ? `Total: ₹${finalAmount}` : '',
      deductible ? `Customer Excess: ₹${deductible}` : '',
      notes,
    ].filter(Boolean).join(' • ');

    onSubmit({
      targetStageId: 10,
      invoiceNumber: invoiceNo,
      finalInvoiceAmount: Number(finalAmount) || 0,
      notes: invDetails,
    });
  };

  return (
    <DesktopWindow
      title={`Stage 10: Generate & Finalize Invoice — ${ticket?.vehicle_plate || ''}`}
      icon={Receipt}
      onClose={onClose}
      defaultWidth="540px"
    >
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ backgroundColor: 'var(--honda-red)', color: '#ffffff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
              STAGE 10
            </span>
            <span>Generate & Finalize Invoice</span>
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
                <label className="form-label">Tax Invoice Number *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. INV-2026-4421"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Total Invoiced Amount (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min="0"
                  placeholder="0"
                  value={finalAmount}
                  onChange={e => setFinalAmount(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Customer Deductible / Co-Pay (₹)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                placeholder="0"
                value={deductible}
                onChange={e => setDeductible(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Billing & Settlement Remarks</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Insurance liability settled, customer paid deductible via card..."
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
              <span>{isSubmitting ? 'Invoicing...' : 'Confirm Invoice (Stage 10)'}</span>
            </button>
          </div>
        </form>
    </DesktopWindow>
  );
}
