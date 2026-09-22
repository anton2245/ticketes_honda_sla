import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  PackageCheck,
  Clock,
  AlertCircle,
  Package,
  Layers,
  Save,
  Check
} from 'lucide-react';
import { request } from '../../api/client.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage7PartsArrivalModal({
  ticket,
  onClose,
  onSubmit,
  onSaveArrival,
  isStandalone = false,
  isSubmitting = false,
}) {
  const [parts, setParts] = useState(Array.isArray(ticket?.parts) ? ticket.parts : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch live parts for this ticket
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    request(`/api/tickets/${ticket.id}/parts`)
      .then((data) => {
        if (!active) return;
        const fetchedParts = Array.isArray(data) ? data : (data?.parts || []);
        // Only show parts that were ordered (or already arrived) - exclude parts merely needed/demanded
        const orderedParts = fetchedParts.filter(p => {
          const status = (p.part_status || '').toUpperCase();
          return status === 'ORDERED' || status === 'ARRIVED' || (Number(p.ordered_qty) > 0);
        });
        setParts(orderedParts);

        // Pre-check parts that are already arrived
        const arrived = orderedParts
          .filter(p => (p.part_status || '').toUpperCase() === 'ARRIVED')
          .map(p => p.id);

        setSelectedIds(arrived);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load parts for arrival verification:', err);
        setError(err.message || 'Failed to fetch ticket parts.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ticket.id]);

  const handleToggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(parts.map(p => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isStandalone) {
      setIsSaving(true);
      try {
        const res = await request(`/api/tickets/${ticket.id}/parts/batch-arrival`, {
          method: 'POST',
          body: JSON.stringify({
            partIds: selectedIds,
            syncAll: true,
            notes,
          }),
        });
        if (onSaveArrival) {
          onSaveArrival(res.ticket || res);
        }
        onClose();
      } catch (err) {
        alert(`Failed to record parts arrival: ${err.message}`);
      } finally {
        setIsSaving(false);
      }
    } else {
      // Advancing to Stage 7
      onSubmit({
        targetStageId: 7,
        arrivedPartIds: selectedIds,
        notes,
      });
    }
  };

  const totalCount = parts.length;
  const arrivedCount = selectedIds.length;
  const arrivalPercent = totalCount > 0 ? Math.round((arrivedCount / totalCount) * 100) : 0;
  const isFullArrival = totalCount > 0 && arrivedCount >= totalCount;

  // Progress gradient: grey -> yellow -> green for partial; solid green for full
  const progressBg = isFullArrival
    ? '#16a34a'
    : arrivedCount > 0
    ? 'linear-gradient(90deg, #94a3b8 0%, #eab308 50%, #22c55e 100%)'
    : '#cbd5e1';

  return (
    <DesktopWindow
      title={`${isStandalone ? 'Parts Arrival Management' : 'Stage 7: Parts Arrival'} — ${ticket?.vehicle_plate || ticket?.vehicle_no || ''}`}
      icon={PackageCheck}
      onClose={onClose}
      defaultWidth="680px"
    >
      <div className="modal-header" style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-light)' }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            backgroundColor: isStandalone ? '#0284c7' : 'var(--honda-red)',
            color: '#ffffff',
            fontSize: '10.5px',
            padding: '2px 7px',
            borderRadius: '4px',
            fontWeight: 800,
            letterSpacing: '0.4px'
          }}>
            {isStandalone ? 'ARRIVAL' : 'STAGE 7'}
          </span>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
            {isStandalone ? 'Mark Parts as Arrived' : 'Receive Arrived Parts'}
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-subtle)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            ({ticket?.vehicle_plate || ticket?.vehicle_no || 'NO PLATE'})
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="modal-body" style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Ticket Information Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '12px'
          }}>
            <div>
              <span style={{ color: 'var(--text-subtle)' }}>Ticket: </span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{ticket?.ticket_number || `#${ticket?.id}`}</strong>
              <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
              <span style={{ color: 'var(--text-subtle)' }}>Model: </span>
              <strong>{ticket?.vehicle_model || ticket?.model || 'Honda Vehicle'}</strong>
            </div>
            {ticket?.po_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--text-subtle)' }}>PO #: </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0369a1' }}>{ticket.po_number}</span>
              </div>
            )}
          </div>

          {/* Arrival Status & Visual Progress Bar */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PackageCheck size={16} color={isFullArrival ? '#16a34a' : '#d97706'} />
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                  Arrival Progress
                </span>
              </div>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: isFullArrival ? '#15803d' : '#b45309',
                backgroundColor: isFullArrival ? '#dcfce7' : '#fef3c7',
                padding: '2px 8px',
                borderRadius: '12px',
                border: isFullArrival ? '1px solid #bbf7d0' : '1px solid #fde68a'
              }}>
                {arrivedCount} of {totalCount} Ordered Parts Arrived ({arrivalPercent}%)
              </span>
            </div>

            {/* Progress track */}
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e2e8f0',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${arrivalPercent}%`,
                  background: progressBg,
                  borderRadius: '4px',
                  transition: 'width 0.3s ease, background 0.3s ease'
                }}
              />
            </div>
          </div>

          {/* Checklist Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '12.5px' }}>
              Select Arrived Parts ({arrivedCount}/{totalCount} Ordered)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleSelectAll}
                disabled={loading || parts.length === 0}
              >
                Select All
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleDeselectAll}
                disabled={loading || parts.length === 0}
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Parts List */}
          <div style={{
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            maxHeight: '260px',
            overflowY: 'auto',
            backgroundColor: '#ffffff'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)', fontSize: '13px' }}>
                <Clock size={20} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--text-muted)' }} />
                Loading parts records for this ticket...
              </div>
            ) : parts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                <Package size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, fontSize: '13px' }}>No ordered parts on this ticket.</div>
                <div style={{ fontSize: '11.5px', marginTop: '4px' }}>Only parts ordered in Stage 6 can be received on arrival. Parts merely needed must first be ordered.</div>
              </div>
            ) : (
              parts.map((p) => {
                const isChecked = selectedIds.includes(p.id);
                const isAlreadyArrived = (p.part_status || '').toUpperCase() === 'ARRIVED';
                const isOrdered = (p.part_status || '').toUpperCase() === 'ORDERED';

                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      backgroundColor: isChecked ? '#f0fdf4' : '#ffffff',
                      transition: 'background-color 0.15s ease',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggle(p.id)}
                        style={{
                          width: '16px',
                          height: '16px',
                          accentColor: '#16a34a',
                          cursor: 'pointer'
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: '12.5px',
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {p.master_part_name || p.part_name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                          {p.part_code && (
                            <span style={{
                              fontSize: '10.5px',
                              color: '#334155',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              backgroundColor: '#f1f5f9',
                              padding: '1px 5px',
                              borderRadius: '3px'
                            }}>
                              {p.part_code}
                            </span>
                          )}
                          {p.category_code && (
                            <span style={{
                              fontSize: '9.5px',
                              backgroundColor: '#e0e7ff',
                              color: '#3730a3',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 600
                            }}>
                              {p.category_code}
                            </span>
                          )}
                          {p.purchase_id && (
                            <span style={{
                              fontSize: '9.5px',
                              backgroundColor: '#e0f2fe',
                              color: '#0369a1',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)'
                            }}>
                              PO: {p.purchase_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                          Qty: {p.quantity || 1}
                        </div>
                        {p.ordered_qty && p.ordered_qty !== p.quantity && (
                          <div style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>
                            Ord: {p.ordered_qty}
                          </div>
                        )}
                      </div>

                      {/* Status Badge */}
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: isChecked ? '#dcfce7' : isOrdered ? '#fef3c7' : '#f1f5f9',
                        color: isChecked ? '#15803d' : isOrdered ? '#b45309' : '#64748b',
                        border: isChecked ? '1px solid #bbf7d0' : isOrdered ? '1px solid #fde68a' : '1px solid #e2e8f0',
                        minWidth: '78px',
                        justifyContent: 'center'
                      }}>
                        {isChecked ? (
                          <>
                            <Check size={11} />
                            <span>Arrived</span>
                          </>
                        ) : isOrdered ? (
                          <>
                            <Clock size={11} />
                            <span>Ordered</span>
                          </>
                        ) : (
                          <span>Pending</span>
                        )}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Remarks Field */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '12px' }}>
              Receiving & Storage Remarks
            </label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. 1/3 items arrived in good order. Placed in Staging Shelf Bay 4..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ fontSize: '12.5px' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting || isSaving}>
            Cancel
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || isSaving || loading || parts.length === 0}
            >
              {isStandalone ? (
                <>
                  <Save size={14} />
                  <span>{isSaving ? 'Saving Arrival...' : 'Save Arrival Status'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>{isSubmitting ? 'Recording Arrival...' : 'Confirm Parts Arrived (Stage 7)'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </DesktopWindow>
  );
}
