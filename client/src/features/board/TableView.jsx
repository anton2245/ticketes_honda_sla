import React, { useState, useMemo } from 'react';
import { Download, ChevronUp, ChevronDown, ArrowRight, Eye, ShieldAlert, CheckCircle2, Clock, User, UserCheck, Package } from 'lucide-react';
import { calculateWorkingDays, evaluateSlaStatus } from '../../utils/slaCalculator.js';

export default function TableView({
  tickets = [],
  stages = [],
  onOpenTicketDetails,
  onAdvanceTicket,
  onContextMenu,
  onOpenPca,
  onOpenOrder,
}) {
  const [sortField, setSortField] = useState('id');
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, BREACHED, WARNING, HEALTHY
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Stage lookup
  const stageMap = useMemo(() => {
    const map = {};
    stages.forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [stages]);

  // Enriched tickets with SLA calculations
  const enrichedTickets = useMemo(() => {
    return tickets.map(ticket => {
      const curStage = stageMap[ticket.current_stage_id] || { name: `Stage ${ticket.current_stage_id}`, slaLimitWD: 2 };
      const elapsedWD = calculateWorkingDays(ticket.current_stage_entered_at || ticket.created_at);
      const slaEval = evaluateSlaStatus(elapsedWD, curStage.slaLimitWD || 2);
      return {
        ...ticket,
        stageName: curStage.name,
        stageLimitWD: curStage.slaLimitWD || 2,
        elapsedWD,
        slaStatus: slaEval.status,
        slaBadge: slaEval.badge,
      };
    });
  }, [tickets, stageMap]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return enrichedTickets.filter(t => {
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'BREACHED') return t.slaStatus === 'BREACHED';
      if (statusFilter === 'WARNING') return t.slaStatus === 'WARNING';
      if (statusFilter === 'HEALTHY') return t.slaStatus === 'HEALTHY';
      return true;
    });
  }, [enrichedTickets, statusFilter]);

  // Sorted tickets
  const sortedTickets = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredTickets, sortField, sortAsc]);

  // Pagination
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(sortedTickets.length / pageSize) || 1;
  const paginatedTickets = useMemo(() => {
    if (pageSize === 'ALL') return sortedTickets;
    const start = (currentPage - 1) * pageSize;
    return sortedTickets.slice(start, start + pageSize);
  }, [sortedTickets, currentPage, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = ['Ticket #', 'Customer', 'Phone', 'Vehicle Plate', 'Model', 'Chassis / VIN', 'Stage', 'Elapsed WD', 'Max SLA WD', 'SLA Status', 'Estimated Cost (INR)'];
    const rows = sortedTickets.map(t => [
      `"${t.ticket_number || ''}"`,
      `"${t.customer_name || ''}"`,
      `"${t.customer_phone || ''}"`,
      `"${t.vehicle_no || ''}"`,
      `"${t.model || ''}"`,
      `"${t.chassis_no || ''}"`,
      `"${t.stageName || ''}"`,
      t.elapsedWD,
      t.stageLimitWD,
      `"${t.slaStatus}"`,
      t.estimated_cost || 0
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Honda_Tickets_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#ffffff', overflow: 'hidden' }}>
      {/* Table Toolbar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        backgroundColor: '#fafbfc',
        flexWrap: 'wrap'
      }}>
        {/* Filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
            SLA Filter:
          </span>
          <button
            className={`hub-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
          >
            All ({enrichedTickets.length})
          </button>
          <button
            className={`hub-chip ${statusFilter === 'BREACHED' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('BREACHED'); setCurrentPage(1); }}
            style={{ color: 'var(--honda-red)' }}
          >
            Breached ({enrichedTickets.filter(t => t.slaStatus === 'BREACHED').length})
          </button>
          <button
            className={`hub-chip ${statusFilter === 'WARNING' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('WARNING'); setCurrentPage(1); }}
            style={{ color: 'var(--sla-amber-text)' }}
          >
            Due Soon ({enrichedTickets.filter(t => t.slaStatus === 'WARNING').length})
          </button>
          <button
            className={`hub-chip ${statusFilter === 'HEALTHY' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('HEALTHY'); setCurrentPage(1); }}
            style={{ color: 'var(--sla-green-text)' }}
          >
            On Track ({enrichedTickets.filter(t => t.slaStatus === 'HEALTHY').length})
          </button>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Page Size:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                setCurrentPage(1);
              }}
              className="form-select"
              style={{ padding: '2px 8px', fontSize: '12px', height: '28px' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="ALL">All</option>
            </select>
          </div>

          <button
            onClick={handleExportCsv}
            className="btn btn-outline"
            style={{ padding: '4px 12px', fontSize: '12px', gap: '6px' }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
          <thead>
            <tr style={{
              backgroundColor: '#f1f5f9',
              borderBottom: '1px solid var(--border-medium)',
              position: 'sticky',
              top: 0,
              zIndex: 10,
              userSelect: 'none'
            }}>
              <th onClick={() => handleSort('ticket_number')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Ticket # {renderSortIcon('ticket_number')}
                </div>
              </th>
              <th onClick={() => handleSort('customer_name')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Customer {renderSortIcon('customer_name')}
                </div>
              </th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Phone</th>
              <th onClick={() => handleSort('vehicle_no')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Vehicle Plate {renderSortIcon('vehicle_no')}
                </div>
              </th>
              <th onClick={() => handleSort('model')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Model {renderSortIcon('model')}
                </div>
              </th>
              <th onClick={() => handleSort('current_stage_id')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Current Stage {renderSortIcon('current_stage_id')}
                </div>
              </th>
              <th onClick={() => handleSort('assigned_to')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Assigned To {renderSortIcon('assigned_to')}
                </div>
              </th>
              <th onClick={() => handleSort('elapsedWD')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Aging (WD) {renderSortIcon('elapsedWD')}
                </div>
              </th>
              <th onClick={() => handleSort('slaStatus')} style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  SLA Status {renderSortIcon('slaStatus')}
                </div>
              </th>
              <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTickets.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                  No service tickets match the selected filters.
                </td>
              </tr>
            ) : (
              paginatedTickets.map((ticket, idx) => {
                const isBreached = ticket.slaStatus === 'BREACHED';
                const isWarning = ticket.slaStatus === 'WARNING';
                return (
                  <tr
                    key={ticket.id}
                    title="Double-click to open, right-click for quick menu"
                    onDoubleClick={() => onOpenTicketDetails(ticket)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (onContextMenu) onContextMenu(e, ticket);
                    }}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafbfc',
                      transition: 'background-color 0.15s',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      <span
                        onClick={() => onOpenTicketDetails(ticket)}
                        style={{ color: 'var(--honda-red)', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {ticket.ticket_number}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {ticket.customer_name || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {ticket.customer_phone || '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {ticket.vehicle_no || 'UNREGISTERED'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {ticket.model || '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          Stage {ticket.current_stage_id}: {ticket.stageName}
                        </span>

                        {Number(ticket.current_stage_id) >= 5 && (Number(ticket.pca_pending_qty !== undefined ? ticket.pca_pending_qty : ticket.pca_count) > 0) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenPca) onOpenPca(ticket);
                            }}
                            title={`Pending Customer Approval: ${ticket.pca_pending_qty || ticket.pca_count} items. Click to resolve.`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: '#fef3c7',
                              color: '#b45309',
                              border: '1px solid #fcd34d',
                              cursor: 'pointer'
                            }}
                          >
                            <User size={10} color="#b45309" />
                            <span style={{ fontSize: '9px', fontWeight: 700 }}>({ticket.pca_pending_qty || ticket.pca_count})</span>
                          </button>
                        )}

                        {Number(ticket.current_stage_id) >= 5 && (Number(ticket.pending_order_count || 0) > 0) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenOrder) onOpenOrder(ticket);
                            }}
                            title={`Pending Procurement: ${ticket.pending_order_count} approved items not yet ordered or taken from stock. Click to open Parts Order.`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: '#f0f9ff',
                              color: '#0284c7',
                              border: '1px solid #bae6fd',
                              cursor: 'pointer'
                            }}
                          >
                            <Package size={10} color="#0284c7" />
                            <Clock size={8} color="#0369a1" />
                            <span style={{ fontSize: '9px', fontWeight: 700 }}>({ticket.pending_order_count})</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {ticket.assigned_to ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: '#f0f9ff',
                          color: '#0369a1',
                          border: '1px solid #bae6fd'
                        }}>
                          <UserCheck size={11} color="#0284c7" />
                          <span>{ticket.assigned_to}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)', fontSize: '11px', fontStyle: 'italic' }}>
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {ticket.elapsedWD} WD
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: isBreached ? 'var(--sla-red-bg)' : (isWarning ? 'var(--sla-amber-bg)' : 'var(--sla-green-bg)'),
                        color: isBreached ? 'var(--sla-red-text)' : (isWarning ? 'var(--sla-amber-text)' : 'var(--sla-green-text)'),
                        border: `1px solid ${isBreached ? 'var(--sla-red-border)' : (isWarning ? 'var(--sla-amber-border)' : 'var(--sla-green-border)')}`
                      }}>
                        {isBreached ? <ShieldAlert size={12} /> : (isWarning ? <Clock size={12} /> : <CheckCircle2 size={12} />)}
                        {ticket.slaStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => onOpenTicketDetails(ticket)}
                          className="btn btn-outline"
                          title="View Profile"
                          style={{ padding: '3px 8px', fontSize: '11px', gap: '4px' }}
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>
                        {ticket.current_stage_id < 11 && (
                          <button
                            onClick={() => onAdvanceTicket(ticket)}
                            className="btn btn-primary"
                            title="Advance Stage"
                            style={{ padding: '3px 8px', fontSize: '11px', gap: '4px' }}
                          >
                            <span>Advance</span>
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pageSize !== 'ALL' && totalPages > 1 && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          backgroundColor: '#fafbfc'
        }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Showing {Math.min((currentPage - 1) * pageSize + 1, sortedTickets.length)}–
            {Math.min(currentPage * pageSize, sortedTickets.length)} of {sortedTickets.length} tickets
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="btn btn-outline"
              style={{ padding: '3px 8px', fontSize: '11px' }}
            >
              ‹ Prev
            </button>
            <span style={{ padding: '0 8px', fontWeight: 600 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="btn btn-outline"
              style={{ padding: '3px 8px', fontSize: '11px' }}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
