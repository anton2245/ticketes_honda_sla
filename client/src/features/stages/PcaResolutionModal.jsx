import React, { useState, useEffect } from 'react';
import { X, Clock, UserCheck, ShieldCheck, CheckCircle2, AlertCircle, Phone, Loader2 } from 'lucide-react';
import { request } from '../../api/client.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function PcaResolutionModal({
  ticket,
  onClose,
  onTicketUpdated,
}) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    request(`/api/tickets/${ticket.id}/parts-approval`)
      .then((data) => {
        if (active && data) {
          const list = data.parts || ticket.parts || [];
          setParts(
            list.map((p) => {
              const isPending =
                String(p.customer_approval_status || '').toUpperCase() === 'PENDING' ||
                (!p.insurance_approved && Number(p.insurance_approved_qty || 0) === 0 && Number(p.customer_approved_qty || 0) === 0);

              return {
                id: p.id,
                part_name: p.master_part_name || p.part_name,
                part_code: p.part_code,
                category_code: p.category_code,
                quantity: Number(p.quantity) || 1,
                unit_cost: Number(p.unit_cost) || 0,
                insurance_approved: Boolean(p.insurance_approved),
                // Default resolution choice for pending items
                action: isPending ? 'CUST_APPROVE' : 'NONE',
                isOriginallyPending: isPending,
              };
            })
          );
        }
      })
      .catch((err) => {
        if (active) setErrorMsg(err.message || 'Failed to load ticket parts.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ticket.id]);

  const pendingParts = parts.filter((p) => p.isOriginallyPending);

  const handleSetPartAction = (id, action) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, action } : p))
    );
  };

  const handleBulkApproveAllCustomer = async () => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      // Use the dedicated bulk customer approve endpoint
      const res = await request(`/api/tickets/${ticket.id}/parts-approval/bulk-customer-approve`, {
        method: 'POST',
      });
      setSuccessMsg('✓ All pending parts approved for customer successfully!');
      if (onTicketUpdated) {
        onTicketUpdated({
          ...ticket,
          pca_count: 0,
          pca_pending_qty: 0,
        });
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to approve parts.');
      setIsSubmitting(false);
    }
  };

  const handleSaveResolutions = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const partsPayload = parts.map((p) => {
        if (p.action === 'CUST_APPROVE') {
          return {
            id: p.id,
            insurance_approved: 0,
            insurance_approved_qty: 0,
            customer_approved_qty: p.quantity,
            customer_approval_status: 'APPROVED',
          };
        } else if (p.action === 'INS_APPROVE') {
          return {
            id: p.id,
            insurance_approved: 1,
            insurance_approved_qty: p.quantity,
            customer_approved_qty: 0,
            customer_approval_status: 'APPROVED',
          };
        } else {
          // Keep as is
          return {
            id: p.id,
          };
        }
      });

      const res = await request(`/api/tickets/${ticket.id}/parts-approval`, {
        method: 'POST',
        body: JSON.stringify({ parts: partsPayload }),
      });

      setSuccessMsg('✓ Parts approval statuses updated successfully!');
      if (onTicketUpdated) {
        onTicketUpdated(res?.ticket || { ...ticket, pca_count: 0 });
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save approval resolutions.');
      setIsSubmitting(false);
    }
  };

  const vehiclePlate = ticket?.vehicle_no || ticket?.vehicle_plate || 'VEHICLE';
  const vehicleModel = ticket?.model || ticket?.vehicle_model || 'Honda Vehicle';
  const customerName = ticket?.customer_name || 'Customer';
  const customerPhone = ticket?.customer_phone || '';

  const totalPendingCost = pendingParts.reduce(
    (sum, p) => sum + p.quantity * p.unit_cost,
    0
  );

  return (
    <DesktopWindow
      title={`Pending Customer Approval (PCA) — ${vehiclePlate}`}
      icon={Clock}
      onClose={onClose}
      defaultWidth="760px"
      defaultHeight="auto"
    >
      <div className="modal-header">
        <div className="modal-title">
          <span
            style={{
              backgroundColor: '#d97706',
              color: '#ffffff',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 800,
            }}
          >
            PCA RESOLUTION
          </span>
          <span>Pending Customer Approval</span>
          <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 500 }}>
            — {vehiclePlate} ({vehicleModel})
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSaveResolutions} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Customer & Ticket Context */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#92400e' }}>
                Customer: {customerName} {customerPhone ? `(${customerPhone})` : ''}
              </div>
              <div style={{ fontSize: '11.5px', color: '#b45309', marginTop: '2px' }}>
                {pendingParts.length} item(s) pending customer approval • Total: ₹{Math.round(totalPendingCost).toLocaleString('en-IN')}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleBulkApproveAllCustomer}
              disabled={isSubmitting || pendingParts.length === 0}
              style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
            >
              <UserCheck size={14} />
              <span>Approve All for Customer</span>
            </button>
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

          {successMsg && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle2 size={16} color="#16a34a" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Pending Parts Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
              Loading pending approval details...
            </div>
          ) : pendingParts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#16a34a', fontWeight: 600 }}>
              ✓ No pending customer approval items for this ticket.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 12px' }}>PENDING PART</th>
                    <th style={{ padding: '8px 10px', width: '60px', textAlign: 'center' }}>QTY</th>
                    <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>EST. COST</th>
                    <th style={{ padding: '8px 12px', width: '260px', textAlign: 'center' }}>RESOLUTION ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingParts.map((p) => {
                    const isCustChosen = p.action === 'CUST_APPROVE';
                    const isInsChosen = p.action === 'INS_APPROVE';
                    const isPendingChosen = p.action === 'KEEP_PENDING';

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.part_name}</div>
                          {p.part_code && (
                            <div style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                              {p.part_code}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                          {p.quantity}
                        </td>

                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          ₹{Math.round(p.quantity * p.unit_cost).toLocaleString('en-IN')}
                        </td>

                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-medium)' }}>
                            <button
                              type="button"
                              onClick={() => handleSetPartAction(p.id, 'CUST_APPROVE')}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: isCustChosen ? '#2563eb' : '#ffffff',
                                color: isCustChosen ? '#ffffff' : 'var(--text-muted)',
                              }}
                            >
                              ✓ Customer Approved
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetPartAction(p.id, 'INS_APPROVE')}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: isInsChosen ? '#16a34a' : '#ffffff',
                                color: isInsChosen ? '#ffffff' : 'var(--text-muted)',
                                borderLeft: '1px solid var(--border-medium)',
                              }}
                            >
                              ✓ Ins. Approved
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetPartAction(p.id, 'KEEP_PENDING')}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: isPendingChosen ? '#fef3c7' : '#ffffff',
                                color: isPendingChosen ? '#b45309' : 'var(--text-subtle)',
                                borderLeft: '1px solid var(--border-medium)',
                              }}
                            >
                              Keep Pending
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || pendingParts.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Save Approved Status</span>
              </>
            )}
          </button>
        </div>
      </form>
    </DesktopWindow>
  );
}
