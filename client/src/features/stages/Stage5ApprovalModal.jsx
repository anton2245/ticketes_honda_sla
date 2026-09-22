import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, ShieldCheck, UserCheck, Clock, Check, AlertCircle } from 'lucide-react';
import { request } from '../../api/client.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage5ApprovalModal({
  ticket,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExempt, setIsExempt] = useState(Boolean(ticket?.customer_approval_exempt));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let active = true;
    request(`/api/tickets/${ticket.id}/parts-approval`)
      .then((data) => {
        if (active && data) {
          const list = data.parts || ticket.parts || [];
          setParts(
            list.map((p) => {
              const isIns = Boolean(p.insurance_approved) || Number(p.insurance_approved_qty) > 0;
              const isCust = !isIns && (p.customer_approval_status === 'APPROVED' || Number(p.customer_approved_qty) > 0);
              return {
                id: p.id,
                part_name: p.master_part_name || p.part_name,
                part_code: p.part_code,
                category_code: p.category_code,
                quantity: p.quantity || 1,
                unit_cost: p.unit_cost || 0,
                insurance_approved: isIns,
                customer_approved: isCust,
              };
            })
          );
          if (data.customer_approval_exempt !== undefined) {
            setIsExempt(Boolean(data.customer_approval_exempt));
          }
        }
      })
      .catch(() => {
        if (active) {
          setParts(
            (ticket.parts || []).map((p) => ({
              id: p.id,
              part_name: p.master_part_name || p.part_name,
              part_code: p.part_code,
              category_code: p.category_code,
              quantity: p.quantity || 1,
              unit_cost: p.unit_cost || 0,
              insurance_approved: false,
              customer_approved: false,
            }))
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ticket.id]);

  // Mutual Exclusivity: Toggling Insurance Approved
  const handleToggleInsurance = (idx) => {
    setParts((prev) => {
      const next = [...prev];
      const currentVal = next[idx].insurance_approved;
      next[idx].insurance_approved = !currentVal;
      // If checking insurance, uncheck customer approval
      if (!currentVal) {
        next[idx].customer_approved = false;
      }
      return next;
    });
  };

  // Mutual Exclusivity: Toggling Customer Approved
  const handleToggleCustomer = (idx) => {
    setParts((prev) => {
      const next = [...prev];
      const currentVal = next[idx].customer_approved;
      next[idx].customer_approved = !currentVal;
      // If checking customer, uncheck insurance approval
      if (!currentVal) {
        next[idx].insurance_approved = false;
      }
      return next;
    });
  };

  // Bulk Quick-Set Actions
  const handleSetAllInsurance = () => {
    setParts((prev) =>
      prev.map((p) => ({
        ...p,
        insurance_approved: true,
        customer_approved: false,
      }))
    );
  };

  const handleSetAllCustomer = () => {
    setParts((prev) =>
      prev.map((p) => ({
        ...p,
        insurance_approved: false,
        customer_approved: true,
      }))
    );
  };

  const handleClearAll = () => {
    setParts((prev) =>
      prev.map((p) => ({
        ...p,
        insurance_approved: false,
        customer_approved: false,
      }))
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const partsApprovalPayload = parts.map((p) => {
      const isIns = Boolean(p.insurance_approved);
      const isCust = Boolean(p.customer_approved);
      const qty = Number(p.quantity) || 1;

      return {
        id: p.id,
        insurance_approved: isIns ? 1 : 0,
        insurance_approved_qty: isIns ? qty : 0,
        customer_approved_qty: isCust ? qty : 0,
        // If neither is checked, status is PENDING (PCA)
        customer_approval_status: !isIns && !isCust ? 'PENDING' : 'APPROVED',
      };
    });

    onSubmit({
      targetStageId: 5,
      partsApproval: partsApprovalPayload,
      customerApprovalExempt: isExempt ? 1 : 0,
      notes,
    });
  };

  const vehiclePlate = ticket?.vehicle_no || ticket?.vehicle_plate || 'VEHICLE';
  const vehicleModel = ticket?.model || ticket?.vehicle_model || 'Honda Vehicle';
  const pendingPcaCount = parts.filter((p) => !p.insurance_approved && !p.customer_approved).length;

  return (
    <DesktopWindow
      title={`Stage 5: Insurance & Customer Parts Approval — ${vehiclePlate}`}
      icon={CheckCircle2}
      onClose={onClose}
      defaultWidth="880px"
      defaultHeight="88vh"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
              STAGE 5
            </span>
            <span>Insurance & Customer Approval</span>
            <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 500 }}>
              — {vehiclePlate} ({vehicleModel})
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Top Instruction & Policy Note */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>
              Mark each part as either <strong>Insurance Approved</strong> or <strong>Customer Approved</strong>.
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>
              A part cannot be marked for both. Any part left <strong>unmarked</strong> will automatically be tagged as{' '}
              <strong style={{ color: '#b45309' }}>Pending Customer Approval (PCA)</strong> and can be resolved on the card later.
            </div>
          </div>

          {/* Quick Action Ribbon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={isExempt}
                onChange={(e) => setIsExempt(e.target.checked)}
              />
              <span>Exempt from Customer Approval (Direct Insurance / Workshop Approved)</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={handleSetAllInsurance}
                title="Mark all parts as approved by insurance claim"
              >
                <ShieldCheck size={12} color="#16a34a" />
                <span>All Ins. Approved</span>
              </button>

              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={handleSetAllCustomer}
                title="Mark all parts as approved by customer out-of-pocket"
              >
                <UserCheck size={12} color="#2563eb" />
                <span>All Cust. Approved</span>
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleClearAll}
                title="Leave all parts unmarked as Pending Customer Approval"
                style={{ color: 'var(--text-subtle)', fontSize: '11px' }}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Parts Approval Checklist Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>
              Loading parts approval status...
            </div>
          ) : parts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>
              No damaged or replacement parts listed for this ticket.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 12px' }}>PART DESCRIPTION</th>
                    <th style={{ padding: '8px 10px', width: '60px', textAlign: 'center' }}>QTY</th>
                    <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>EST. COST</th>
                    <th style={{ padding: '8px 12px', width: '160px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <ShieldCheck size={13} color="#16a34a" />
                        <span>INSURANCE APPROVED</span>
                      </div>
                    </th>
                    <th style={{ padding: '8px 12px', width: '160px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <UserCheck size={13} color="#2563eb" />
                        <span>CUSTOMER APPROVED</span>
                      </div>
                    </th>
                    <th style={{ padding: '8px 12px', width: '180px', textAlign: 'center' }}>STATUS TAG</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, idx) => {
                    const isIns = Boolean(p.insurance_approved);
                    const isCust = Boolean(p.customer_approved);
                    const isPca = !isIns && !isCust;

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: isPca ? '#fffbeb' : idx % 2 === 0 ? '#ffffff' : '#fafbfc',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.part_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            {p.part_code && (
                              <span style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                {p.part_code}
                              </span>
                            )}
                            {p.category_code && (
                              <span style={{ fontSize: '9.5px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                                {p.category_code}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                          {p.quantity}
                        </td>

                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          ₹{Math.round((p.quantity || 1) * (p.unit_cost || 0)).toLocaleString('en-IN')}
                        </td>

                        {/* Insurance Approved Checkmark */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              border: isIns ? '1px solid #16a34a' : '1px solid var(--border-medium)',
                              backgroundColor: isIns ? '#f0fdf4' : '#ffffff',
                              color: isIns ? '#166534' : 'var(--text-subtle)',
                              fontWeight: isIns ? 700 : 500,
                              fontSize: '11.5px',
                              transition: 'all 0.15s ease',
                              minWidth: '130px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isIns}
                              onChange={() => handleToggleInsurance(idx)}
                              style={{ cursor: 'pointer', accentColor: '#16a34a' }}
                            />
                            <span>Ins. Approved</span>
                          </label>
                        </td>

                        {/* Customer Approved Checkmark */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              border: isCust ? '1px solid #2563eb' : '1px solid var(--border-medium)',
                              backgroundColor: isCust ? '#eff6ff' : '#ffffff',
                              color: isCust ? '#1d4ed8' : 'var(--text-subtle)',
                              fontWeight: isCust ? 700 : 500,
                              fontSize: '11.5px',
                              transition: 'all 0.15s ease',
                              minWidth: '130px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isCust}
                              onChange={() => handleToggleCustomer(idx)}
                              style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            <span>Cust. Approved</span>
                          </label>
                        </td>

                        {/* Status Tag Badge */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {isIns && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                              }}
                            >
                              <Check size={12} color="#16a34a" />
                              <span>Insurance Approved</span>
                            </span>
                          )}

                          {isCust && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                              }}
                            >
                              <Check size={12} color="#2563eb" />
                              <span>Customer Approved</span>
                            </span>
                          )}

                          {isPca && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fcd34d',
                              }}
                            >
                              <Clock size={11} color="#d97706" />
                              <span>Pending Cust. (PCA)</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pending PCA notification if any */}
          {pendingPcaCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 'var(--radius-md)',
                fontSize: '11.5px',
                color: '#92400e',
              }}
            >
              <AlertCircle size={14} color="#d97706" />
              <span>
                <strong>{pendingPcaCount} part(s)</strong> are neither Insurance nor Customer approved and will be tagged on the Kanban card as <strong>Pending Customer Approval (PCA)</strong>.
              </span>
            </div>
          )}

          {/* Approval Notes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Surveyor / Approval Remarks</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. Surveyor approved bumper repair, customer consent pending for side mirror..."
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
            <span>{isSubmitting ? 'Saving Approvals...' : 'Confirm Stage 5 Approval'}</span>
          </button>
        </div>
      </form>
    </DesktopWindow>
  );
}
