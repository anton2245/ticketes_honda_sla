import React, { useState } from 'react';
import { Clock, User, Phone, Car, GripVertical, UserCheck, Package } from 'lucide-react';
import { calculateWorkingDays, evaluateSlaStatus } from '../../utils/slaCalculator.js';

// Cumulative stage SLA limits fallback (Monday-Saturday working days)
const CUMULATIVE_STAGE_LIMITS = {
  1: 1,   // Vehicle Arrival
  2: 3,   // Estimate Preparation (1 + 2)
  3: 4,   // Insurance Intimation (3 + 1)
  4: 7,   // Survey (4 + 3)
  5: 9,   // Approval (7 + 2)
  6: 19,  // Parts Order (9 + 10)
  7: 20,  // Parts Arrival (19 + 1)
  8: 22,  // Work Start (20 + 2)
  9: 25,  // Work Complete (22 + 3)
  10: 26, // Invoice (25 + 1)
  11: 28, // Resurvey (26 + 2)
  12: 43  // Waiting Delivery (28 + 15)
};

/**
 * Calculates average/cumulative SLA health across all stages from intake to current stage.
 * Flags cards whose overall turnaround time is breaching thresholds even if current stage is fresh.
 */
function getOverallSlaHealth(ticket, currentStage, allStages = []) {
  const stageId = Number(ticket.current_stage_id) || 1;
  const intakeDate = ticket.arrival_date || ticket.created_at || ticket.current_stage_entered_at;
  const totalElapsedWd = calculateWorkingDays(intakeDate);

  let cumulativeTargetWd = 0;
  if (Array.isArray(allStages) && allStages.length > 0) {
    cumulativeTargetWd = allStages
      .filter(s => Number(s.id) <= stageId)
      .reduce((acc, s) => acc + (Number(s.slaLimitWD || s.sla_days) || 2), 0);
  }
  if (!cumulativeTargetWd || cumulativeTargetWd <= 0) {
    cumulativeTargetWd = CUMULATIVE_STAGE_LIMITS[stageId] || Math.max(2, Math.round(stageId * 2.5));
  }

  const ratio = totalElapsedWd / Math.max(1, cumulativeTargetWd);

  // 1. Critical Overall Turnaround Breach (> 35% past cumulative target)
  if (ratio > 1.35) {
    return {
      status: 'CRITICAL_BREACH',
      label: `Overall Turnaround: Severely Delayed (${totalElapsedWd}/${cumulativeTargetWd} WD cumulative - previous stages exceeded thresholds)`,
      shadow: '0 4px 14px -2px rgba(239, 68, 68, 0.22), 0 2px 6px -1px rgba(192, 38, 211, 0.14)',
      hoverShadow: '0 8px 22px -3px rgba(239, 68, 68, 0.32), 0 3px 10px -2px rgba(192, 38, 211, 0.22)',
      totalElapsedWd,
      cumulativeTargetWd,
    };
  }

  // 2. Delayed Overall Turnaround (10% to 35% past cumulative target)
  if (ratio > 1.10) {
    return {
      status: 'DELAYED',
      label: `Overall Turnaround: Delayed (${totalElapsedWd}/${cumulativeTargetWd} WD cumulative)`,
      shadow: '0 4px 14px -2px rgba(249, 115, 22, 0.20), 0 2px 6px -1px rgba(225, 29, 72, 0.14)',
      hoverShadow: '0 8px 20px -3px rgba(249, 115, 22, 0.30), 0 3px 9px -2px rgba(225, 29, 72, 0.20)',
      totalElapsedWd,
      cumulativeTargetWd,
    };
  }

  // 3. Warning (Pacing near cumulative threshold: 85% to 110%)
  if (ratio > 0.85) {
    return {
      status: 'WARNING',
      label: `Overall Turnaround: Approaching Threshold (${totalElapsedWd}/${cumulativeTargetWd} WD cumulative)`,
      shadow: '0 4px 14px -2px rgba(245, 158, 11, 0.18), 0 2px 6px -1px rgba(234, 88, 12, 0.12)',
      hoverShadow: '0 8px 20px -3px rgba(245, 158, 11, 0.28), 0 3px 9px -2px rgba(234, 88, 12, 0.18)',
      totalElapsedWd,
      cumulativeTargetWd,
    };
  }

  // 4. Healthy (turnaroundRatio <= 0.85)
  return {
    status: 'HEALTHY',
    label: `Overall Turnaround: On Track (${totalElapsedWd}/${cumulativeTargetWd} WD cumulative)`,
    shadow: '0 3px 12px -2px rgba(16, 185, 129, 0.15), 0 1px 5px -1px rgba(6, 182, 212, 0.10)',
    hoverShadow: '0 6px 18px -2px rgba(16, 185, 129, 0.25), 0 2px 8px -1px rgba(6, 182, 212, 0.16)',
    totalElapsedWd,
    cumulativeTargetWd,
  };
}

export default function TicketCard({
  ticket,
  currentStage,
  allStages = [],
  onOpenDetails,
  onAdvance,
  onContextMenu,
  onOpenPca,
  onOpenOrder,
  isAnyCardDragging = false,
  onDragStart,
  onDragEnd,
}) {
  const [isDragging, setIsDragging] = useState(false);

  const enteredAt = ticket.current_stage_entered_at || ticket.created_at;
  const elapsedWd = calculateWorkingDays(enteredAt);
  const slaLimitWd = currentStage?.slaLimitWD || 2;
  const sla = evaluateSlaStatus(elapsedWd, slaLimitWd);

  // Cumulative SLA across stages
  const overallSla = getOverallSlaHealth(ticket, currentStage, allStages);

  const pcaCount = Number(ticket.pca_pending_qty !== undefined && ticket.pca_pending_qty !== null ? ticket.pca_pending_qty : ticket.pca_count) || 0;
  const hasPca = Number(ticket.current_stage_id) >= 5 && pcaCount > 0;

  const pendingOrderCount = Number(
    ticket.pending_order_count !== undefined
      ? ticket.pending_order_count
      : (Array.isArray(ticket.parts)
          ? ticket.parts.filter(p => {
              const isApproved = (p.insurance_approved || Number(p.insurance_approved_qty) > 0 || (p.customer_approval_status || '').toUpperCase() === 'APPROVED' || Number(p.customer_approved_qty) > 0);
              const isProcured = ['ORDERED', 'ARRIVED'].includes((p.part_status || '').toUpperCase());
              return isApproved && !isProcured;
            }).length
          : 0)
  ) || 0;
  const hasPendingOrder = Number(ticket.current_stage_id) >= 5 && pendingOrderCount > 0;

  const stageId = Number(ticket.current_stage_id) || 1;
  const orderedParts = Number(ticket.ordered_parts_count) || (Number(ticket.pod_count) + Number(ticket.arrived_parts_count)) || 0;
  const arrivedParts = Number(ticket.arrived_parts_count) || 0;
  const showArrivalBar = orderedParts > 0 && (stageId >= 6 || arrivedParts > 0 || Number(ticket.pod_count) > 0);
  const arrivalPercent = orderedParts > 0 ? Math.min(100, Math.round((arrivedParts / orderedParts) * 100)) : 0;
  const isFullArrival = orderedParts > 0 && arrivedParts >= orderedParts;

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      ticketId: ticket.id,
      currentStageId: ticket.current_stage_id || 1,
    }));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    if (onDragStart) onDragStart(ticket);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (onDragEnd) onDragEnd();
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e, ticket);
    }
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        backgroundColor: '#ffffff',
        border: isDragging ? '2px dashed var(--honda-red)' : '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        marginBottom: '8px',
        boxShadow: isDragging ? 'var(--shadow-lg)' : overallSla.shadow,
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: 'transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.1s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        opacity: isDragging ? 0.35 : 1,
        transform: isDragging ? 'scale(0.98)' : 'none',
        pointerEvents: isAnyCardDragging && !isDragging ? 'none' : 'auto',
        userSelect: 'none',
      }}
      title={`Ticket #${ticket.ticket_number || ticket.id} • ${ticket.vehicle_no || ''}\n• Current Stage (${currentStage?.name || `Stage ${stageId}`}): ${elapsedWd}/${slaLimitWd} WD\n• ${overallSla.label}\n(Double-click for details, drag to change stage, right-click for options)`}
      onDoubleClick={() => onOpenDetails(ticket)}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.boxShadow = overallSla.hoverShadow;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = 'var(--border-light)';
          e.currentTarget.style.boxShadow = overallSla.shadow;
          e.currentTarget.style.transform = 'none';
        }
      }}
    >
      {/* Plate and SLA Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GripVertical size={13} color="var(--text-subtle)" style={{ cursor: 'grab' }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            fontSize: '12px',
            color: '#0f172a',
            backgroundColor: '#f1f5f9',
            padding: '2px 6px',
            borderRadius: '4px',
            letterSpacing: '0.4px'
          }}>
            {ticket.vehicle_plate || ticket.vehicle_no || 'NO PLATE'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {hasPca && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenPca) onOpenPca(ticket);
              }}
              title={`Pending Customer Approval: ${pcaCount} item(s) pending. Click to view details & approve.`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10.5px',
                fontWeight: 700,
                backgroundColor: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fcd34d',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(217, 119, 6, 0.12)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fde68a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fef3c7';
              }}
            >
              <User size={11} color="#b45309" />
              <span style={{ fontSize: '9.5px', fontWeight: 700 }}>({pcaCount})</span>
            </button>
          )}

          {hasPendingOrder && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenOrder) onOpenOrder(ticket);
              }}
              title={`Pending Procurement: ${pendingOrderCount} approved item(s) not yet ordered or taken from stock. Click to open Parts Order.`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10.5px',
                fontWeight: 700,
                backgroundColor: '#f0f9ff',
                color: '#0284c7',
                border: '1px solid #bae6fd',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(2, 132, 199, 0.08)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e0f2fe';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f0f9ff';
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5px' }}>
                <Package size={11} color="#0284c7" />
                <Clock size={8.5} color="#0369a1" />
              </span>
              <span style={{ fontSize: '9.5px', fontWeight: 700 }}>({pendingOrderCount})</span>
            </button>
          )}

          <span className={`badge ${sla.badgeClass}`} title={`${elapsedWd} working days elapsed (SLA limit: ${slaLimitWd} WD)`}>
            <Clock size={11} />
            <span>{elapsedWd} WD</span>
          </span>
        </div>
      </div>

      {/* Vehicle Model & Color */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
        <Car size={13} color="var(--text-subtle)" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.vehicle_model || ticket.model || 'Honda Vehicle'}
          {ticket.vehicle_color || ticket.color ? ` • ${ticket.vehicle_color || ticket.color}` : ''}
        </span>
      </div>

      {/* Customer Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <User size={11} />
          <span>{ticket.customer_name || 'Walk-in Customer'}</span>
        </div>
        {ticket.customer_phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Phone size={10} />
            <span>{ticket.customer_phone.slice(-4)}</span>
          </div>
        )}
      </div>

      {/* Footer / Ticket Number & Assignee */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {ticket.ticket_number || `#${ticket.id}`}
        </span>
        {ticket.assigned_to && (
          <span
            title={`Assigned to: ${ticket.assigned_to}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '9.5px',
              fontWeight: 600,
              color: '#0369a1',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              padding: '1px 6px',
              borderRadius: '4px',
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            <UserCheck size={9} color="#0284c7" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ticket.assigned_to}</span>
          </span>
        )}
      </div>

      {/* Minimal Parts Arrival Progress Bar at bottom edge */}
      {showArrivalBar && (
        <div
          title={`Parts Arrival: ${arrivedParts}/${orderedParts} ordered parts arrived (${arrivalPercent}%)`}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3.5px',
            backgroundColor: '#e2e8f0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${arrivalPercent}%`,
              background: isFullArrival
                ? '#16a34a'
                : 'linear-gradient(90deg, #94a3b8 0%, #eab308 50%, #22c55e 100%)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      )}
    </div>
  );
}
