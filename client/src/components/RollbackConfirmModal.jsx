import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, X, AlertCircle } from 'lucide-react';
import DesktopWindow from './DesktopWindow.jsx';

export default function RollbackConfirmModal({
  ticket,
  targetStage,
  stages = [],
  onClose,
  onConfirm,
  isSubmitting = false
}) {
  const [reason, setReason] = useState('Moved backward via Kanban board drag & drop');

  if (!ticket || !targetStage) return null;

  const curStageId = ticket.current_stage_id || 1;
  const currentStage = stages.find(s => s.id === curStageId) || { id: curStageId, name: `Stage ${curStageId}` };

  const handleConfirm = (e) => {
    e.preventDefault();
    if (onConfirm) {
      onConfirm(ticket.id, targetStage.id, reason);
    }
  };

  // Compute what data gets removed/reset
  const resetItems = [];
  if (targetStage.id < 2 && curStageId >= 2) {
    resetItems.push('All estimate parts, labor/painting charges will be erased and warehouse stock restored');
  }
  if (targetStage.id < 3 && curStageId >= 3) {
    resetItems.push('Insurance company intimation details will be cleared');
  }
  if (targetStage.id < 4 && curStageId >= 4) {
    resetItems.push('Surveyor contact and survey date will be cleared');
  }
  if (targetStage.id < 5 && curStageId >= 5) {
    resetItems.push('Surveyor and customer parts approval statuses will be reset to Pending');
  }
  if (targetStage.id < 6 && curStageId >= 6) {
    resetItems.push('Parts purchase order records will be reverted back to Pending Order');
  }
  if (targetStage.id < 7 && curStageId >= 7) {
    resetItems.push('Parts arrival confirmation timestamps will be reset');
  }
  if (targetStage.id < 8 && curStageId >= 8) {
    resetItems.push('Work start date will be cleared');
  }
  if (targetStage.id < 9 && curStageId >= 9) {
    resetItems.push('Work completion date will be cleared');
  }
  if (targetStage.id < 10 && curStageId >= 10) {
    resetItems.push('Final invoice numbers and amounts will be cleared');
  }
  if (targetStage.id < 11 && curStageId >= 11) {
    resetItems.push('Resurvey and waiting delivery records will be cleared');
  }
  if (targetStage.id < 12 && curStageId >= 12) {
    resetItems.push('Customer delivery and closure timestamps will be cleared');
  }
  resetItems.push(`Stage history logs and SLA timers for stages after Stage ${targetStage.id} will be permanently erased`);

  return (
    <DesktopWindow
      title="Confirm Stage Rollback — Move Backward"
      icon={AlertTriangle}
      onClose={onClose}
      defaultWidth="560px"
    >
      <div className="modal-header" style={{ borderBottom: '1px solid #fee2e2', backgroundColor: '#fff5f5' }}>
        <div className="modal-title" style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} color="#dc2626" />
          <span style={{ fontWeight: 700 }}>Rollback Stage Confirmation</span>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Ticket & Transition Overview */}
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                {ticket.vehicle_plate || 'Vehicle'} • {ticket.model || ticket.vehicle_name || 'Honda'}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                backgroundColor: '#ffffff',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1'
              }}>
                {ticket.ticket_number}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <div style={{
                padding: '4px 8px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                borderRadius: '4px',
                fontWeight: 700
              }}>
                Stage {curStageId}: {currentStage.name}
              </div>
              <ArrowLeft size={16} color="#64748b" style={{ transform: 'rotate(0deg)' }} />
              <div style={{
                padding: '4px 8px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                borderRadius: '4px',
                fontWeight: 700
              }}>
                Stage {targetStage.id}: {targetStage.name}
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: '8px',
            display: 'flex',
            gap: '10px'
          }}>
            <AlertCircle size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
              <strong>Notice:</strong> Moving this ticket back to <strong>Stage {targetStage.id} ({targetStage.name})</strong> will reset subsequent progress. Data entered for subsequent stages will be removed:
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {resetItems.map((item, idx) => (
                  <li key={idx} style={{ marginTop: '3px' }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Optional reason / note */}
          <div>
            <label className="form-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>
              Rollback Reason (optional note)
            </label>
            <input
              type="text"
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Estimation amended, customer requested re-quote..."
              style={{ fontSize: '12px' }}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{
          padding: '12px 20px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          backgroundColor: '#f8fafc'
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ fontSize: '12px' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={isSubmitting}
            style={{
              fontSize: '12px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSubmitting ? (
              <span>Rolling back...</span>
            ) : (
              <>
                <AlertTriangle size={14} />
                <span>Confirm & Move to Stage {targetStage.id}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </DesktopWindow>
  );
}
