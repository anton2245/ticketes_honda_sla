import React, { useState, useEffect } from 'react';
import TicketCard from './TicketCard.jsx';
import { ArrowDown, Layers } from 'lucide-react';
import { KanbanCardSkeleton } from '../../components/Skeletons.jsx';

export default function KanbanBoard({
  stages = [],
  tickets = [],
  isLoading = false,
  onOpenTicketDetails,
  onAdvanceTicket,
  onDropTicketToStage,
  onContextMenu,
  onOpenPca,
  onOpenOrder,
}) {
  const [draggedTicket, setDraggedTicket] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [customerDeliveryLimit, setCustomerDeliveryLimit] = useState(10);

  // Clear dragging state on window dragend or drop cancellation
  useEffect(() => {
    const handleWindowDragEnd = () => {
      setDraggedTicket(null);
      setDragOverStageId(null);
    };
    window.addEventListener('dragend', handleWindowDragEnd);
    return () => window.removeEventListener('dragend', handleWindowDragEnd);
  }, []);

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleDragLeave = (e, stageId) => {
    // Prevent flickering when cursor moves across child elements
    if (e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    if (dragOverStageId === stageId) {
      setDragOverStageId(null);
    }
  };

  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    setDragOverStageId(null);
    const sourceTicket = draggedTicket;
    setDraggedTicket(null);

    try {
      let ticket = sourceTicket;
      if (!ticket) {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
          const data = JSON.parse(raw);
          if (data && data.ticketId) {
            ticket = tickets.find(t => t.id === data.ticketId);
          }
        }
      }

      if (!ticket) return;

      // If dropped on the same stage it's already in, do nothing
      if ((ticket.current_stage_id || 1) === targetStage.id) return;

      if (onDropTicketToStage) {
        onDropTicketToStage(ticket, targetStage);
      } else if (onAdvanceTicket) {
        onAdvanceTicket(ticket);
      }
    } catch (err) {
      console.error('Failed to parse dropped card data:', err);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flex: 1,
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '14px',
      gap: '12px',
      backgroundColor: 'var(--bg-main)',
      height: '100%',
      userSelect: 'none'
    }}>
      {stages.map((stage) => {
        const isCustomerDelivery = stage.id === 13 || (stage.name && stage.name.toLowerCase() === 'customer delivery');
        const isWaitingDelivery = stage.id === 12 || (stage.name && stage.name.toLowerCase().includes('waiting'));

        const stageTickets = tickets.filter(t => (t.current_stage_id || 1) === stage.id);
        const visibleTickets = isCustomerDelivery && customerDeliveryLimit !== 'ALL'
          ? stageTickets.slice(0, customerDeliveryLimit)
          : stageTickets;

        const isDraggedOver = dragOverStageId === stage.id;
        const isSourceStage = draggedTicket && (draggedTicket.current_stage_id || 1) === stage.id;

        return (
          <div
            key={stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={(e) => handleDragLeave(e, stage.id)}
            onDrop={(e) => handleDrop(e, stage)}
            style={{
              width: '280px',
              minWidth: '280px',
              maxHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: isDraggedOver ? '#eff6ff' : '#f1f5f9',
              borderRadius: 'var(--radius-lg)',
              border: isDraggedOver
                ? '2px solid #2563eb'
                : isSourceStage
                ? '1px dashed #94a3b8'
                : '1px solid var(--border-light)',
              overflow: 'hidden',
              boxShadow: isDraggedOver
                ? '0 0 0 3px rgba(37, 99, 235, 0.25), 0 8px 16px -4px rgba(37, 99, 235, 0.12)'
                : 'none',
              transition: 'background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease',
              position: 'relative'
            }}
          >
            {/* Column Header */}
            <div style={{
              height: '42px',
              padding: '0 12px',
              backgroundColor: isDraggedOver ? '#dbeafe' : '#ffffff',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background-color 0.12s ease',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#ffffff',
                  backgroundColor: isCustomerDelivery ? '#059669' : (isDraggedOver ? '#2563eb' : 'var(--text-muted)'),
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.12s ease'
                }}>
                  {stage.id}
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isDraggedOver ? '#1e40af' : 'var(--text-main)',
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {isWaitingDelivery ? 'Waiting Customer Delivery' : isCustomerDelivery ? 'Customer Delivery' : stage.name}
                </span>
              </div>

              {/* Status Indicator / Ticket Count */}
              {isDraggedOver && !isSourceStage ? (
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#ffffff',
                  backgroundColor: '#2563eb',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <span>Drop</span>
                  <ArrowDown size={11} />
                </span>
              ) : (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isDraggedOver ? '#1d4ed8' : 'var(--text-muted)',
                  backgroundColor: isDraggedOver ? '#bfdbfe' : '#f1f5f9',
                  padding: '2px 7px',
                  borderRadius: '9999px'
                }}>
                  {isCustomerDelivery && customerDeliveryLimit !== 'ALL' && stageTickets.length > visibleTickets.length
                    ? `${visibleTickets.length}/${stageTickets.length}`
                    : stageTickets.length}
                </span>
              )}
            </div>

            {/* Stage SLA Subtitle */}
            <div style={{
              padding: '3px 12px',
              fontSize: '10px',
              color: 'var(--text-subtle)',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: isDraggedOver ? '#e0f2fe' : '#f8fafc',
              flexShrink: 0
            }}>
              {isWaitingDelivery ? (
                <span>Target SLA: <strong>15 WD</strong> • Waiting for Pickup</span>
              ) : isCustomerDelivery ? (
                <span>Closed / Delivered Ticket History</span>
              ) : (
                <span>Target SLA: <strong>{stage.slaLimitWD} WD</strong></span>
              )}
            </div>

            {/* Stage 13 Customer Delivery Filter Ribbon */}
            {isCustomerDelivery && (
              <div style={{
                padding: '4px 10px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                flexShrink: 0
              }}>
                <span style={{ color: 'var(--text-subtle)', fontWeight: 600 }}>Show:</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {[10, 20, 50, 100, 'ALL'].map(limit => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => setCustomerDeliveryLimit(limit)}
                      style={{
                        border: 'none',
                        backgroundColor: customerDeliveryLimit === limit ? '#1e293b' : '#f1f5f9',
                        color: customerDeliveryLimit === limit ? '#ffffff' : '#64748b',
                        borderRadius: '3px',
                        padding: '1px 5px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Column Scrollable Cards Container */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <KanbanCardSkeleton key={i} />
                ))
              ) : visibleTickets.length === 0 ? (
                <div style={{
                  padding: '32px 12px',
                  textAlign: 'center',
                  color: isDraggedOver ? '#2563eb' : 'var(--text-subtle)',
                  backgroundColor: isDraggedOver ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                  border: isDraggedOver ? '1.5px dashed #60a5fa' : 'none',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontStyle: isDraggedOver ? 'normal' : 'italic',
                  fontWeight: isDraggedOver ? 600 : 400,
                  transition: 'all 0.15s ease'
                }}>
                  {isDraggedOver ? `Drop to place in Stage ${stage.id}` : 'No vehicles in this stage'}
                </div>
              ) : (
                visibleTickets.map(t => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    currentStage={stage}
                    allStages={stages}
                    onOpenDetails={onOpenTicketDetails}
                    onAdvance={onAdvanceTicket}
                    onContextMenu={onContextMenu}
                    onOpenPca={onOpenPca}
                    onOpenOrder={onOpenOrder}
                    isAnyCardDragging={!!draggedTicket}
                    onDragStart={(ticket) => setDraggedTicket(ticket)}
                    onDragEnd={() => {
                      setDraggedTicket(null);
                      setDragOverStageId(null);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
