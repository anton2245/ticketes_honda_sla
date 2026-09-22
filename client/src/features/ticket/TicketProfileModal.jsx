import React, { useState, useEffect, useRef } from 'react';
import {
  X, Clock, Car, User, Phone, Wrench, FileText, MessageSquare, History,
  Send, Trash2, Calendar, Shield, AlertCircle, Check, CheckCircle2,
  Package, Truck, ArrowRight, AlertTriangle, CheckCircle, ChevronRight, Sparkles,
  Printer, FileSpreadsheet, MinusCircle, FastForward, ShoppingCart, UserCheck,
  AtSign, CornerDownRight
} from 'lucide-react';
import { calculateWorkingDays, evaluateSlaStatus } from '../../utils/slaCalculator.js';
import { fetchTicket, fetchStageLogs, fetchTicketComments, addTicketComment } from '../../api/tickets.js';
import { fetchMentionUsers } from '../../api/notifications.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';

function formatCommentText(text) {
  if (!text) return null;
  const parts = String(text).split(/(@[a-zA-Z0-9_\-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: '4px',
            backgroundColor: '#e0e7ff',
            color: '#3730a3',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            margin: '0 2px'
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

const WORKFLOW_STAGES = [
  { id: 1, name: 'Vehicle Arrival', slaLimitWD: 1, group: 'Intake', description: 'Vehicle intake & reception at bodyshop' },
  { id: 2, name: 'Estimate Preparation', slaLimitWD: 2, group: 'Estimate', description: 'Parts costing, labour, and damage estimation' },
  { id: 3, name: 'Insurance Intimation', slaLimitWD: 1, group: 'Intimation', description: 'Claim intimation sent to insurer' },
  { id: 4, name: 'Survey', slaLimitWD: 3, group: 'Survey', description: 'Physical or digital inspection by insurance surveyor' },
  { id: 5, name: 'Approval', slaLimitWD: 2, group: 'Approval', description: 'Claim liability & work approval confirmed' },
  { id: 6, name: 'Parts Order', slaLimitWD: 10, group: 'Procurement', description: 'Parts ordered from Honda parts warehouse' },
  { id: 7, name: 'Parts Arrival', slaLimitWD: 1, group: 'Stocking', description: 'Parts received, checked and allocated to vehicle' },
  { id: 8, name: 'Work Start', slaLimitWD: 2, group: 'Repairs', description: 'Denting, panel beating, and surface preparation' },
  { id: 9, name: 'Work Complete', slaLimitWD: 3, group: 'Inspection', description: 'Painting, assembly, and quality assurance complete' },
  { id: 10, name: 'Invoice', slaLimitWD: 1, group: 'Billing', description: 'Final invoicing and insurance bill submission' },
  { id: 11, name: 'Resurvey', slaLimitWD: 2, group: 'Resurvey', description: 'Post-repair re-inspection by insurance surveyor' },
  { id: 12, name: 'Waiting Customer Delivery', slaLimitWD: 15, group: 'Delivery', description: 'Final customer handover and vehicle gate pass' },
];

const MACRO_STEPS = [
  { id: 1, label: 'Intake & Estimate', range: [1, 2], icon: Car },
  { id: 2, label: 'Survey & Approval', range: [3, 5], icon: Shield },
  { id: 3, label: 'Parts Procurement', range: [6, 7], icon: Package },
  { id: 4, label: 'Bodyshop Repair', range: [8, 9], icon: Wrench },
  { id: 5, label: 'Invoice & Delivery', range: [10, 12], icon: CheckCircle2 },
];

export default function TicketProfileModal({
  ticket,
  currentStage,
  onClose,
  onOpenStage2,
  onOpenStage6,
  onDeleteTicket,
  onEstimatePrint,
  onEstimateXlsx,
  onOpenPca,
  initialTab = 'overview',
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [ticketDetail, setTicketDetail] = useState(ticket || null);
  const [stageLogs, setStageLogs] = useState([]);
  const [comments, setComments] = useState([]);
  const [parts, setParts] = useState(Array.isArray(ticket?.parts) ? ticket.parts : []);
  const [newComment, setNewComment] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState('ALL');

  // Mention system state
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const commentInputRef = useRef(null);

  useEffect(() => {
    fetchMentionUsers()
      .then(res => {
        if (Array.isArray(res)) setMentionUsers(res);
      })
      .catch(() => {});
  }, []);

  const handleCommentInputChange = (e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setNewComment(val);

    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_\-]*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setShowMentionMenu(true);
      setMentionIndex(0);
    } else {
      setShowMentionMenu(false);
    }
  };

  const filteredMentionCandidates = mentionUsers.filter(u => {
    if (!mentionQuery) return true;
    return (
      (u.username && u.username.toLowerCase().includes(mentionQuery)) ||
      (u.display_name && u.display_name.toLowerCase().includes(mentionQuery))
    );
  }).slice(0, 6);

  const selectMentionCandidate = (candidate) => {
    if (!commentInputRef.current) return;
    const cursorPos = commentInputRef.current.selectionStart || newComment.length;
    const textBefore = newComment.slice(0, cursorPos);
    const textAfter = newComment.slice(cursorPos);

    const newTextBefore = textBefore.replace(/@([a-zA-Z0-9_\-]*)$/, `@${candidate.username} `);
    const updated = newTextBefore + textAfter;
    setNewComment(updated);
    setShowMentionMenu(false);

    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
        const nextPos = newTextBefore.length;
        commentInputRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleCommentKeyDown = (e) => {
    if (showMentionMenu && filteredMentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMentionCandidate(filteredMentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionMenu(false);
        return;
      }
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, ticket?.id]);

  useEffect(() => {
    if (!ticket?.id) return;
    
    setIsLoading(true);
    // Fetch full rich ticket details (includes logs, parts, partsStats)
    fetchTicket(ticket.id)
      .then(data => {
        if (data) {
          setTicketDetail(data);
          if (Array.isArray(data.logs)) setStageLogs(data.logs);
          if (Array.isArray(data.parts)) setParts(data.parts);
        }
      })
      .catch(err => {
        console.error('Failed to load full ticket details:', err);
        // Fallback to fetchStageLogs
        fetchStageLogs(ticket.id).then(logs => {
          if (Array.isArray(logs)) setStageLogs(logs);
        }).catch(() => {});
      })
      .finally(() => setIsLoading(false));

    fetchTicketComments(ticket.id)
      .then(cmts => {
        if (Array.isArray(cmts)) setComments(cmts);
      })
      .catch(() => {});
  }, [ticket?.id]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !ticket?.id) return;

    setIsSendingComment(true);
    setShowMentionMenu(false);
    try {
      const created = await addTicketComment(ticket.id, newComment.trim());
      if (created) {
        setComments(prev => [...prev, created]);
      }
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setIsSendingComment(false);
    }
  };

  if (!ticket) return null;

  const t = ticketDetail || ticket;
  const vehiclePlate = t.vehicle_no || t.vehicle_plate || 'NO PLATE';
  const vehicleModel = t.model || t.vehicle_model || t.vehicle_name || 'Honda Vehicle';
  const vehicleColor = t.color || t.vehicle_color || '';
  const vinChassis = t.chassis_number || t.vin || '—';
  const customerName = t.customer_name || 'Walk-in Customer';
  const customerPhone = t.customer_phone || '—';
  const insuranceCompany = t.insurance_company || 'Cash Customer';
  const surveyorName = t.surveyor_name || null;
  const surveyorPhone = t.surveyor_phone || null;
  const ticketNumber = t.ticket_number || `TCK-${t.id}`;

  const elapsedWd = t.slaElapsedWD ?? calculateWorkingDays(t.current_stage_entered_at || t.created_at, new Date());
  const slaLimitWd = t.slaLimitWD || currentStage?.slaLimitWD || currentStage?.sla_days || 3;
  const sla = t.slaStatus ? { status: t.slaStatus, badgeClass: t.slaStatus === 'BREACHED' ? 'badge-sla-red' : 'badge-sla-green' } : evaluateSlaStatus(elapsedWd, slaLimitWd);

  const pcaCount = Number(t.pca_pending_qty !== undefined && t.pca_pending_qty !== null ? t.pca_pending_qty : t.pca_count) || 0;
  const hasPca = Number(t.current_stage_id) >= 5 && pcaCount > 0;

  return (
    <DesktopWindow
      title={`${ticketNumber} — ${vehiclePlate} (${vehicleModel})`}
      icon={Car}
      onClose={onClose}
      defaultWidth="880px"
      defaultHeight="85vh"
    >
      {/* Header */}
      <div className="modal-header" style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 900,
            fontSize: '14px',
            backgroundColor: '#f1f5f9',
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #cbd5e1'
          }}>
            {vehiclePlate}
          </span>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
              {vehicleModel} {vehicleColor ? `• ${vehicleColor}` : ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>
              {ticketNumber} • Customer: <strong>{customerName}</strong> ({customerPhone})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`badge ${sla.badgeClass || (sla.status === 'BREACHED' ? 'badge-sla-red' : 'badge-sla-green')}`} style={{ padding: '4px 8px', fontSize: '11px' }}>
            <Clock size={12} />
            <span>{elapsedWd} WD ({currentStage?.name || `Stage ${t.current_stage_id}`})</span>
          </span>
          {onDeleteTicket && (
            <button
              type="button"
              className="btn btn-outline btn-xs"
              style={{ color: '#dc2626', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Delete Ticket"
              onClick={() => {
                if (window.confirm(`Are you sure you want to permanently delete Ticket ${ticketNumber}? This will remove all associated logs and parts.`)) {
                  onDeleteTicket(t.id);
                  onClose();
                }
              }}
            >
              <Trash2 size={12} />
              <span>Delete</span>
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 18px 0',
        borderBottom: '1px solid var(--border-light)',
        backgroundColor: '#ffffff'
      }}>
        {[
          { id: 'overview', label: 'Overview', icon: Car },
          { id: 'parts', label: `Parts Demand (${parts.length})`, icon: Wrench },
          { id: 'timeline', label: `Stage History (${stageLogs.length})`, icon: History },
          { id: 'comments', label: `Notes & Chat (${comments.length})`, icon: MessageSquare },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--honda-red)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: isActive ? 'var(--honda-red)' : 'transparent',
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body Content */}
      <div className="modal-body" style={{ padding: '16px 20px', overflowY: 'auto' }}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* PCA Notice Banner if ticket has pending customer approval */}
            {hasPca && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontSize: '12px', fontWeight: 600 }}>
                  <Clock size={15} color="#d97706" />
                  <span>
                    This ticket has <strong>{pcaCount} item(s)</strong> tagged as <strong>Pending Customer Approval (PCA)</strong>.
                  </span>
                </div>
                {onOpenPca && (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={() => onOpenPca(t)}
                    style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
                  >
                    <UserCheck size={13} />
                    <span>Review & Approve PCA</span>
                  </button>
                )}
              </div>
            )}

            {/* Top KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase' }}>Current Stage</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '3px', color: 'var(--text-main)' }}>
                  {currentStage?.name || `Stage ${t.current_stage_id}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Target: {slaLimitWd} working days</div>
              </div>

              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase' }}>Working Days SLA</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '3px', color: sla.status === 'BREACHED' ? 'var(--honda-red)' : 'var(--text-main)' }}>
                  {elapsedWd} Working Days Elapsed
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Status: {sla.status || 'WITHIN_SLA'}</div>
              </div>

              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase' }}>Estimated Repair Cost</div>
                <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: '3px', color: '#047857' }}>
                  ₹{Number(t.estimated_cost || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{parts.length} parts in demand list</div>
              </div>
            </div>

            {/* Customer & Vehicle Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', backgroundColor: '#ffffff' }}>
                <h4 style={{ fontSize: '12.5px', marginBottom: '10px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Car size={14} />
                  <span>Vehicle Information</span>
                </h4>
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)' }}>
                  <div><strong style={{ color: 'var(--text-main)' }}>Registration No:</strong> {vehiclePlate}</div>
                  <div><strong style={{ color: 'var(--text-main)' }}>Vehicle Model:</strong> {vehicleModel}</div>
                  <div><strong style={{ color: 'var(--text-main)' }}>Exterior Color:</strong> {vehicleColor || '—'}</div>
                  <div><strong style={{ color: 'var(--text-main)' }}>Chassis / VIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{vinChassis}</span></div>
                  {t.outlet_name && <div><strong style={{ color: 'var(--text-main)' }}>Branch / Outlet:</strong> {t.outlet_name}</div>}
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', backgroundColor: '#ffffff' }}>
                <h4 style={{ fontSize: '12.5px', marginBottom: '10px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} />
                  <span>Customer & Claims Details</span>
                </h4>
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)' }}>
                  <div><strong style={{ color: 'var(--text-main)' }}>Customer Name:</strong> {customerName}</div>
                  <div><strong style={{ color: 'var(--text-main)' }}>Contact Phone:</strong> {customerPhone}</div>
                  <div><strong style={{ color: 'var(--text-main)' }}>Insurance Company:</strong> {insuranceCompany}</div>
                  {surveyorName && (
                    <div>
                      <strong style={{ color: 'var(--text-main)' }}>Assigned Surveyor:</strong> {surveyorName} {surveyorPhone ? `(${surveyorPhone})` : ''}
                    </div>
                  )}
                  {t.assigned_to && (
                    <div><strong style={{ color: 'var(--text-main)' }}>Assigned Advisor/Tech:</strong> {t.assigned_to}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Stage Dates Grid */}
            <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', backgroundColor: '#f8fafc' }}>
              <h4 style={{ fontSize: '12px', marginBottom: '8px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={13} />
                <span>Operational Milestone Timestamps</span>
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '11.5px' }}>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Arrival Date</span>
                  <strong>{t.arrival_date ? new Date(t.arrival_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Estimate Date</span>
                  <strong>{t.estimate_date ? new Date(t.estimate_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Approval Date</span>
                  <strong>{t.approval_date ? new Date(t.approval_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Parts Arrival</span>
                  <strong>{t.parts_arrival_date ? new Date(t.parts_arrival_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Work Started</span>
                  <strong>{t.work_start_date ? new Date(t.work_start_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Work Completed</span>
                  <strong>{t.work_complete_date ? new Date(t.work_complete_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Invoiced Date</span>
                  <strong>{t.invoice_date ? new Date(t.invoice_date).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', display: 'block', fontSize: '10.5px' }}>Delivery Date</span>
                  <strong>{t.delivery_date ? new Date(t.delivery_date).toLocaleDateString() : '—'}</strong>
                </div>
              </div>
            </div>

            {/* Damage Remarks */}
            {t.damaged_parts && (
              <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', backgroundColor: '#ffffff' }}>
                <h4 style={{ fontSize: '12px', marginBottom: '4px', color: 'var(--text-main)' }}>Damage Remarks / Job Scope</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {t.damaged_parts}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Parts Tab */}
        {activeTab === 'parts' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ fontSize: '12.5px', margin: 0 }}>Demanded Parts & Estimation ({parts.length})</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {onEstimatePrint && (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0284c7', borderColor: '#bae6fd' }}
                    onClick={() => onEstimatePrint(t)}
                    title="Print Official Estimate Sheet"
                  >
                    <Printer size={12} />
                    <span>Print Estimate</span>
                  </button>
                )}
                {onEstimateXlsx && (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', borderColor: '#a7f3d0' }}
                    onClick={() => onEstimateXlsx(t)}
                    title="Download Formatted XLSX"
                  >
                    <FileSpreadsheet size={12} />
                    <span>Estimate XLSX</span>
                  </button>
                )}
                {onOpenStage2 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => {
                      onClose();
                      onOpenStage2(t);
                    }}
                  >
                    Edit Parts & Estimation
                  </button>
                )}
                {onOpenStage6 && Number(t.current_stage_id) >= 5 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    style={{ backgroundColor: '#ea580c', borderColor: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      onClose();
                      onOpenStage6(t);
                    }}
                  >
                    <ShoppingCart size={12} />
                    <span>Order Parts (Stage 6)</span>
                  </button>
                )}
              </div>
            </div>

            {parts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-subtle)', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                <Wrench size={24} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                <div>No parts recorded for this job ticket yet.</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>Add required parts in Stage 2 (Estimate Preparation).</div>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 10px', width: '30%' }}>Part Description</th>
                      <th style={{ padding: '8px 10px', width: '15%' }}>SKU</th>
                      <th style={{ padding: '8px 10px', width: '8%', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '8px 10px', width: '11%', textAlign: 'right' }}>MRP (₹)</th>
                      <th style={{ padding: '8px 10px', width: '11%', textAlign: 'right' }}>Labour (₹)</th>
                      <th style={{ padding: '8px 10px', width: '11%', textAlign: 'right' }}>Painting (₹)</th>
                      <th style={{ padding: '8px 10px', width: '14%', textAlign: 'right' }}>Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p, idx) => {
                      const q = Number(p.quantity) || 1;
                      const m = Number(p.master_mrp || p.unit_cost || 0);
                      const l = Number(p.labour_charges || 0);
                      const pt = Number(p.painting_charges || 0);
                      const lineTotal = Number(p.total_cost) || Math.round((q * m) + l + pt);

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.master_part_name || p.part_name}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.part_code || '—'}</span>
                            {p.category_code && (
                              <span style={{ marginLeft: '6px', fontSize: '9px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>
                                {p.category_code}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>{q}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            ₹{m.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: l > 0 ? '#2563eb' : 'var(--text-subtle)' }}>
                            {l > 0 ? `₹${l.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: pt > 0 ? '#7c3aed' : 'var(--text-subtle)' }}>
                            {pt > 0 ? `₹${pt.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            ₹{lineTotal.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab - Amazon Delivery Tracking Style */}
        {activeTab === 'timeline' && (() => {
          const currentStageId = Number(t.current_stage_id) || 1;
          const isTicketClosed = t.status === 'CLOSED';

          let itemsToRender = [];
          if (timelineViewMode === 'LOGS') {
            itemsToRender = stageLogs.map(log => {
              const stageConfig = WORKFLOW_STAGES.find(s => s.id === log.stage_id);
              const isLogSkipped = log.sla_status === 'SKIPPED' || (typeof log.data_json === 'string' ? log.data_json.includes('"skipped":true') : log.data_json?.skipped);
              const isCompleted = !isLogSkipped && Boolean(log.completed_at);
              const elapsedWdVal = isLogSkipped ? 0 : (log.elapsed_wd ?? log.working_days_elapsed ?? 0);
              const slaLimitVal = log.sla_limit_wd || stageConfig?.slaLimitWD || null;
              const isBreached = log.sla_status === 'BREACHED' || Boolean(slaLimitVal && elapsedWdVal > slaLimitVal);
              const isWarning = log.sla_status === 'WARNING' || Boolean(!isBreached && slaLimitVal && elapsedWdVal >= slaLimitVal);
              const isActive = !isLogSkipped && !isCompleted && !isTicketClosed && currentStageId === log.stage_id;
              return {
                stageId: log.stage_id,
                stageName: log.stage_name || stageConfig?.name || `Stage ${log.stage_id}`,
                enteredAt: log.entered_at,
                completedAt: log.completed_at,
                elapsedWd: elapsedWdVal,
                slaLimitWd: slaLimitVal,
                slaStatus: log.sla_status,
                isCompleted,
                isActive,
                isBreached,
                isWarning,
                isSkipped: isLogSkipped,
                isUpcoming: false,
                dataJson: log.data_json
              };
            });
          } else {
            // Full 12-Stage Pipeline Journey (Amazon delivery style)
            itemsToRender = WORKFLOW_STAGES.map(stage => {
              const matchingLogs = stageLogs.filter(l => Number(l.stage_id) === Number(stage.id));
              const latestLog = matchingLogs[matchingLogs.length - 1];

              const isLogSkipped = Boolean(
                latestLog && (
                  latestLog.sla_status === 'SKIPPED' ||
                  (typeof latestLog.data_json === 'string'
                    ? latestLog.data_json.includes('"skipped":true')
                    : latestLog.data_json?.skipped)
                )
              );

              // A stage is skipped if:
              // 1. The log explicitly says SKIPPED
              // 2. OR currentStageId > stage.id (or ticket is closed), but there is NO log for this stage (it was bypassed/skipped), except Stage 1
              // 3. OR it's an optional stage marked not required (e.g. Stage 6/7 Parts Order when parts_order_required === 0, or Stage 11 Resurvey when resurvey_required === 0)
              // 4. OR the ticket was early bypassed (is_bypassed = 1) past this stage
              const isBypassedNoLog = (isTicketClosed || currentStageId > stage.id) && !latestLog && stage.id !== 1;
              const isPartsBypassed = (stage.id === 6 || stage.id === 7) && Number(t.parts_order_required) === 0 && (currentStageId > 5 || isTicketClosed);
              const isResurveyBypassed = stage.id === 11 && Number(t.resurvey_required) === 0 && (currentStageId >= 12 || isTicketClosed);
              const isPipelineBypassed = Boolean(t.is_bypassed) && stage.id > (t.bypass_stage_id || 1) && stage.id < 12;

              const isSkipped = isLogSkipped || isBypassedNoLog || isPartsBypassed || isResurveyBypassed || isPipelineBypassed;
              const isCompleted = !isSkipped && (isTicketClosed || (latestLog && Boolean(latestLog.completed_at)) || currentStageId > stage.id);
              const isActive = !isTicketClosed && !isSkipped && currentStageId === stage.id;
              const isUpcoming = !isTicketClosed && !isSkipped && !isCompleted && currentStageId < stage.id;
              
              const itemElapsedWd = latestLog ? (latestLog.elapsed_wd ?? latestLog.working_days_elapsed ?? 0) : (isActive ? elapsedWd : 0);
              const itemSlaLimitWd = latestLog?.sla_limit_wd || stage.slaLimitWD;
              const isBreached = !isSkipped && (latestLog?.sla_status === 'BREACHED' || (isActive && sla.status === 'BREACHED') || Boolean(itemSlaLimitWd && itemElapsedWd > itemSlaLimitWd));
              const isWarning = !isSkipped && !isBreached && (latestLog?.sla_status === 'WARNING' || (isActive && sla.status === 'WARNING') || Boolean(itemSlaLimitWd && itemElapsedWd >= itemSlaLimitWd));

              return {
                stageId: stage.id,
                stageName: stage.name,
                description: stage.description,
                enteredAt: latestLog?.entered_at || (isActive ? (t.current_stage_entered_at || t.created_at) : null),
                completedAt: latestLog?.completed_at || null,
                elapsedWd: isSkipped ? 0 : itemElapsedWd,
                slaLimitWd: itemSlaLimitWd,
                slaStatus: isSkipped ? 'SKIPPED' : (latestLog?.sla_status || (isActive ? sla.status : (isCompleted ? (isBreached ? 'BREACHED' : isWarning ? 'WARNING' : 'WITHIN_SLA') : 'PENDING'))),
                isCompleted,
                isActive,
                isBreached,
                isWarning,
                isUpcoming,
                isSkipped,
                dataJson: latestLog?.data_json
              };
            });
          }

          const completedCount = itemsToRender.filter(s => s.isCompleted).length;
          const skippedCount = itemsToRender.filter(s => s.isSkipped).length;
          const progressPercent = Math.round(((completedCount + skippedCount) / WORKFLOW_STAGES.length) * 100);
          const hasAnyBreach = itemsToRender.some(s => s.isBreached);
          const hasAnyWarning = itemsToRender.some(s => s.isWarning);
          const timelineHeaderColor = hasAnyBreach ? '#ef4444' : hasAnyWarning ? '#f59e0b' : '#10b981';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Amazon Delivery Header Card */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 18px',
                boxShadow: 'var(--shadow-sm)',
                borderTop: `3px solid ${timelineHeaderColor}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: isTicketClosed ? '#ecfdf5' : '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isTicketClosed ? '#059669' : '#2563eb'
                    }}>
                      {isTicketClosed ? <CheckCircle2 size={22} /> : <Truck size={20} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{isTicketClosed ? 'Vehicle Handover & Service Completed' : `Current Stage: ${currentStage?.name || `Stage ${currentStageId}`}`}</span>
                        {!isTicketClosed && (
                          <span style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            backgroundColor: sla.status === 'BREACHED' ? '#fee2e2' : sla.status === 'WARNING' ? '#fef3c7' : '#ecfdf5',
                            color: sla.status === 'BREACHED' ? '#b91c1c' : sla.status === 'WARNING' ? '#b45309' : '#047857',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor' }}></span>
                            {sla.status === 'BREACHED' ? 'SLA Breached' : sla.status === 'WARNING' ? 'SLA Warning' : 'On Track'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                        {ticketNumber} • {vehiclePlate} ({vehicleModel}) • {t.outlet_name || 'Bodyshop'} • {completedCount} of 12 stages cleared ({progressPercent}%)
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${sla.badgeClass || (sla.status === 'BREACHED' ? 'badge-sla-red' : sla.status === 'WARNING' ? 'badge-sla-amber' : 'badge-sla-green')}`} style={{ padding: '5px 10px', fontSize: '11.5px' }}>
                      <Clock size={13} />
                      <span>{elapsedWd} of {slaLimitWd} WD Elapsed</span>
                    </span>
                  </div>
                </div>

                {/* Amazon 5-Milestone Horizontal Stepper Bar */}
                <div style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '6px',
                  padding: '12px 10px 8px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #f1f5f9'
                }}>
                  {MACRO_STEPS.map((macro) => {
                    const Icon = macro.icon;
                    const macroItems = itemsToRender.filter(item => item.stageId >= macro.range[0] && item.stageId <= macro.range[1]);
                    const allSkipped = macroItems.length > 0 && macroItems.every(item => item.isSkipped);
                    const hasBreachInMacro = macroItems.some(item => item.isBreached);
                    const hasWarningInMacro = macroItems.some(item => item.isWarning);
                    const isFinished = !allSkipped && (isTicketClosed || currentStageId > macro.range[1]);
                    const isCurrent = !allSkipped && !isTicketClosed && currentStageId >= macro.range[0] && currentStageId <= macro.range[1];
                    
                    const stepBgColor = allSkipped 
                      ? '#f1f5f9' 
                      : hasBreachInMacro 
                      ? '#ef4444' 
                      : hasWarningInMacro 
                      ? '#f59e0b' 
                      : isFinished 
                      ? '#10b981' 
                      : isCurrent 
                      ? '#2563eb' 
                      : '#ffffff';

                    const stepBorderColor = allSkipped 
                      ? '2px dashed #94a3b8' 
                      : hasBreachInMacro 
                      ? '2px solid #ef4444' 
                      : hasWarningInMacro 
                      ? '2px solid #f59e0b' 
                      : isFinished 
                      ? '2px solid #10b981' 
                      : isCurrent 
                      ? '2px solid #2563eb' 
                      : '2px solid #cbd5e1';

                    const stepTextColor = allSkipped ? '#64748b' : (isFinished || isCurrent || hasBreachInMacro || hasWarningInMacro) ? '#ffffff' : '#94a3b8';
                    const labelColor = allSkipped 
                      ? '#64748b' 
                      : hasBreachInMacro 
                      ? '#dc2626' 
                      : hasWarningInMacro 
                      ? '#d97706' 
                      : isCurrent 
                      ? '#2563eb' 
                      : isFinished 
                      ? '#047857' 
                      : '#64748b';

                    return (
                      <div key={macro.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          backgroundColor: stepBgColor,
                          border: stepBorderColor,
                          color: stepTextColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isCurrent ? (hasBreachInMacro ? '0 0 0 4px rgba(239, 68, 68, 0.2)' : '0 0 0 4px rgba(37, 99, 235, 0.2)') : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          {allSkipped ? (
                            <MinusCircle size={14} color="#64748b" />
                          ) : hasBreachInMacro ? (
                            <AlertTriangle size={14} color="#ffffff" />
                          ) : isFinished ? (
                            <Check size={15} strokeWidth={3} />
                          ) : (
                            <Icon size={14} />
                          )}
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: isCurrent ? 700 : 600,
                          color: labelColor,
                          marginTop: '6px',
                          textAlign: 'center',
                          lineHeight: 1.2
                        }}>
                          {macro.label}
                        </span>
                        <span style={{
                          fontSize: '9.5px',
                          color: labelColor,
                          fontWeight: isCurrent ? 700 : 500,
                          marginTop: '2px'
                        }}>
                          {allSkipped ? 'Skipped' : hasBreachInMacro ? 'Breached' : hasWarningInMacro ? 'Warning' : isFinished ? 'Completed' : isCurrent ? 'Active' : 'Pending'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* View Mode Toggle Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={15} color="#2563eb" />
                  <span>Tracking Milestones & Step-by-Step History</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    onClick={() => setTimelineViewMode('ALL')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: timelineViewMode === 'ALL' ? 700 : 500,
                      backgroundColor: timelineViewMode === 'ALL' ? '#ffffff' : 'transparent',
                      color: timelineViewMode === 'ALL' ? 'var(--text-main)' : 'var(--text-subtle)',
                      border: 'none',
                      borderRadius: '4px',
                      boxShadow: timelineViewMode === 'ALL' ? 'var(--shadow-sm)' : 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Full 12-Stage Journey
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineViewMode('LOGS')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: timelineViewMode === 'LOGS' ? 700 : 500,
                      backgroundColor: timelineViewMode === 'LOGS' ? '#ffffff' : 'transparent',
                      color: timelineViewMode === 'LOGS' ? 'var(--text-main)' : 'var(--text-subtle)',
                      border: 'none',
                      borderRadius: '4px',
                      boxShadow: timelineViewMode === 'LOGS' ? 'var(--shadow-sm)' : 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Recorded Logs Only ({stageLogs.length})
                  </button>
                </div>
              </div>

              {/* Amazon Vertical Tracking Spine */}
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', paddingLeft: '4px' }}>
                {itemsToRender.map((item, idx) => {
                  const isLast = idx === itemsToRender.length - 1;
                  const enteredDateObj = item.enteredAt ? new Date(item.enteredAt) : null;
                  const completedDateObj = item.completedAt ? new Date(item.completedAt) : null;

                  // Contextual metadata chip
                  let contextSnippet = null;
                  if (item.stageId === 1) contextSnippet = `Location: ${t.outlet_name || 'Bodyshop Receiving'}`;
                  else if (item.stageId === 2) contextSnippet = `Estimate Total: ₹${Number(t.estimated_cost || 0).toLocaleString('en-IN')} (${parts.length} parts)`;
                  else if (item.stageId === 3) contextSnippet = `Insurer: ${t.insurance_company || 'Cash Customer'}`;
                  else if (item.stageId === 4 && t.surveyor_name) contextSnippet = `Surveyor: ${t.surveyor_name} ${t.surveyor_phone ? `• ${t.surveyor_phone}` : ''}`;
                  else if (item.stageId === 5 && t.approval_date) contextSnippet = `Approved: ${new Date(t.approval_date).toLocaleDateString()}`;
                  else if (item.stageId === 6 && t.parts_order_date) contextSnippet = `Parts Ordered: ${new Date(t.parts_order_date).toLocaleDateString()}`;
                  else if (item.stageId === 7 && t.parts_arrival_date) contextSnippet = `Parts Arrived: ${new Date(t.parts_arrival_date).toLocaleDateString()}`;
                  else if (item.stageId === 8 && t.repair_start_date) contextSnippet = `Work Started: ${new Date(t.repair_start_date).toLocaleDateString()}`;
                  else if (item.stageId === 9 && t.repair_completion_date) contextSnippet = `Work Completed: ${new Date(t.repair_completion_date).toLocaleDateString()}`;
                  else if (item.stageId === 10 && t.invoice_date) contextSnippet = `Invoiced: ${new Date(t.invoice_date).toLocaleDateString()}`;
                  else if (item.stageId === 12 && t.delivery_date) contextSnippet = `Handover: ${new Date(t.delivery_date).toLocaleDateString()}`;

                  // Determine colors for connecting line and node based on stage SLA
                  const spineLineColor = item.isSkipped 
                    ? '#cbd5e1' 
                    : item.isBreached 
                    ? '#ef4444' 
                    : item.isWarning 
                    ? '#f59e0b' 
                    : item.isCompleted 
                    ? '#10b981' 
                    : item.isActive 
                    ? (item.isBreached ? '#ef4444' : item.isWarning ? '#f59e0b' : '#3b82f6')
                    : '#e2e8f0';

                  const nodeBg = item.isSkipped 
                    ? '#f8fafc' 
                    : item.isBreached 
                    ? '#ef4444' 
                    : item.isWarning 
                    ? '#f59e0b' 
                    : item.isCompleted 
                    ? '#10b981' 
                    : item.isActive 
                    ? (item.isBreached ? '#dc2626' : item.isWarning ? '#f59e0b' : '#2563eb') 
                    : '#ffffff';

                  const nodeBorder = item.isSkipped 
                    ? '2px dashed #94a3b8' 
                    : item.isBreached 
                    ? '2px solid #ef4444' 
                    : item.isWarning 
                    ? '2px solid #f59e0b' 
                    : item.isCompleted 
                    ? '2px solid #10b981' 
                    : item.isActive 
                    ? (item.isBreached ? '2px solid #dc2626' : item.isWarning ? '2px solid #f59e0b' : '2px solid #2563eb')
                    : '2px solid #cbd5e1';

                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      position: 'relative',
                      minHeight: '62px',
                      paddingBottom: isLast ? '0' : '12px'
                    }}>
                      {/* Left: Timestamp Column */}
                      <div style={{
                        width: '95px',
                        flexShrink: 0,
                        textAlign: 'right',
                        paddingRight: '14px',
                        paddingTop: '3px'
                      }}>
                        {item.isSkipped ? (
                          <div style={{ paddingTop: '2px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                              <MinusCircle size={11} color="#94a3b8" />
                              <span>Skipped</span>
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#94a3b8', marginTop: '1px' }}>
                              0 WD elapsed
                            </div>
                          </div>
                        ) : enteredDateObj ? (
                          <>
                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                              {enteredDateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-subtle)', marginTop: '1px' }}>
                              {enteredDateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {item.isCompleted && (
                              <div style={{ 
                                fontSize: '9.5px', 
                                color: item.isBreached ? '#dc2626' : item.isWarning ? '#d97706' : '#059669', 
                                fontWeight: 700, 
                                marginTop: '2px' 
                              }}>
                                Took {item.elapsedWd} WD
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', paddingTop: '2px' }}>
                            Upcoming
                          </div>
                        )}
                      </div>

                      {/* Middle: Continuous Vertical Spine & Checkpoint Node */}
                      <div style={{
                        width: '28px',
                        flexShrink: 0,
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'center'
                      }}>
                        {/* Connecting Line representing SLA health */}
                        {!isLast && (
                          <div style={{
                            position: 'absolute',
                            top: '16px',
                            bottom: '-6px',
                            width: '2.5px',
                            backgroundColor: spineLineColor,
                            borderLeft: (item.isUpcoming || item.isSkipped) ? '2px dashed #cbd5e1' : 'none',
                            zIndex: 1,
                            transition: 'background-color 0.2s ease'
                          }} />
                        )}

                        {/* Milestone Node Icon */}
                        <div style={{
                          position: 'relative',
                          zIndex: 2,
                          width: item.isActive ? '26px' : '22px',
                          height: item.isActive ? '26px' : '22px',
                          borderRadius: '50%',
                          backgroundColor: nodeBg,
                          border: nodeBorder,
                          boxShadow: item.isActive 
                            ? (item.isBreached ? '0 0 0 4px rgba(239, 68, 68, 0.2)' : item.isWarning ? '0 0 0 4px rgba(245, 158, 11, 0.2)' : '0 0 0 4px rgba(37, 99, 235, 0.2)') 
                            : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '2px',
                          transition: 'all 0.2s ease'
                        }}>
                          {item.isCompleted ? (
                            item.isBreached ? (
                              <AlertTriangle size={12} color="#ffffff" />
                            ) : (
                              <Check size={13} strokeWidth={3} color="#ffffff" />
                            )
                          ) : item.isActive ? (
                            <Clock size={13} color="#ffffff" />
                          ) : item.isSkipped ? (
                            <MinusCircle size={12} color="#64748b" />
                          ) : (
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#cbd5e1' }} />
                          )}
                        </div>
                      </div>

                      {/* Right: Amazon-Style Event Card */}
                      <div style={{
                        flex: 1,
                        marginLeft: '10px',
                        backgroundColor: item.isActive ? '#f0f7ff' : item.isSkipped ? '#fafafa' : '#ffffff',
                        border: item.isActive 
                          ? (item.isBreached ? '1.5px solid #fca5a5' : item.isWarning ? '1.5px solid #fcd34d' : '1.5px solid #93c5fd') 
                          : item.isSkipped 
                          ? '1px dashed #cbd5e1' 
                          : item.isBreached 
                          ? '1px solid #fee2e2' 
                          : '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 14px',
                        boxShadow: item.isActive ? '0 2px 4px rgba(37, 99, 235, 0.08)' : 'var(--shadow-sm)',
                        transition: 'all 0.15s ease'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              backgroundColor: item.isSkipped 
                                ? '#f1f5f9' 
                                : item.isBreached 
                                ? '#fee2e2' 
                                : item.isWarning 
                                ? '#fef3c7' 
                                : item.isCompleted 
                                ? '#ecfdf5' 
                                : item.isActive 
                                ? '#dbeafe' 
                                : '#f1f5f9',
                              color: item.isSkipped 
                                ? '#64748b' 
                                : item.isBreached 
                                ? '#b91c1c' 
                                : item.isWarning 
                                ? '#b45309' 
                                : item.isCompleted 
                                ? '#065f46' 
                                : item.isActive 
                                ? '#1e40af' 
                                : '#475569',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)'
                            }}>
                              Stage {item.stageId}
                            </span>
                            <span style={{
                              fontSize: '13px',
                              fontWeight: item.isActive ? 800 : 700,
                              color: item.isActive ? '#1e3a8a' : item.isSkipped ? '#64748b' : item.isUpcoming ? '#64748b' : 'var(--text-main)'
                            }}>
                              {item.stageName}
                            </span>
                          </div>

                          {/* Status Pill Badge representing SLA color */}
                          <div>
                            {item.isSkipped ? (
                              <span style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: '#475569',
                                backgroundColor: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <MinusCircle size={10} color="#64748b" />
                                <span>Skipped / Bypassed</span>
                              </span>
                            ) : item.isCompleted ? (
                              <span style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: item.isBreached ? '#b91c1c' : item.isWarning ? '#b45309' : '#047857',
                                backgroundColor: item.isBreached ? '#fef2f2' : item.isWarning ? '#fffbeb' : '#ecfdf5',
                                border: `1px solid ${item.isBreached ? '#fca5a5' : item.isWarning ? '#fcd34d' : '#a7f3d0'}`,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {item.isBreached ? (
                                  <>
                                    <AlertTriangle size={11} color="#ef4444" />
                                    <span>Completed ({item.elapsedWd} WD • Breached)</span>
                                  </>
                                ) : item.isWarning ? (
                                  <>
                                    <AlertTriangle size={11} color="#f59e0b" />
                                    <span>Completed ({item.elapsedWd} WD • Warning)</span>
                                  </>
                                ) : (
                                  <>
                                    <Check size={11} strokeWidth={3} />
                                    <span>Completed ({item.elapsedWd} WD • Within SLA)</span>
                                  </>
                                )}
                              </span>
                            ) : item.isActive ? (
                              <span style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: item.isBreached ? '#b91c1c' : item.isWarning ? '#b45309' : '#1d4ed8',
                                backgroundColor: item.isBreached ? '#fef2f2' : item.isWarning ? '#fffbeb' : '#eff6ff',
                                border: `1px solid ${item.isBreached ? '#fca5a5' : item.isWarning ? '#fcd34d' : '#bfdbfe'}`,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.isBreached ? '#dc2626' : item.isWarning ? '#d97706' : '#2563eb' }} />
                                <span>Active Now ({item.elapsedWd}/{item.slaLimitWd} WD{item.isBreached ? ' • Breached' : item.isWarning ? ' • Warning' : ''})</span>
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '10.5px',
                                fontWeight: 500,
                                color: '#94a3b8',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                padding: '2px 7px',
                                borderRadius: '12px'
                              }}>
                                Target: {item.slaLimitWd} WD
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Event Details & Context Row */}
                        {item.isSkipped ? (
                          <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '6px' }}>
                            Stage bypassed in workflow pipeline (0 WD)
                          </div>
                        ) : contextSnippet ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '6px' }}>
                            {contextSnippet}
                          </div>
                        ) : item.description ? (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                            {item.description}
                          </div>
                        ) : null}
                        <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                          <div>
                            {enteredDateObj ? (
                              <span>
                                Entered: {enteredDateObj.toLocaleString()}
                                {completedDateObj && (
                                  <span style={{ marginLeft: '8px' }}>• Completed: {completedDateObj.toLocaleString()}</span>
                                )}
                              </span>
                            ) : (
                              <span>{item.description || `Pending entry in pipeline`}</span>
                            )}
                          </div>

                          {contextSnippet && (
                            <span style={{
                              fontSize: '10.5px',
                              fontWeight: 600,
                              color: '#334155',
                              backgroundColor: '#f1f5f9',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}>
                              {contextSnippet}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Comments Tab */}
        {activeTab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '340px' }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', maxHeight: '340px' }}>
              {comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-subtle)', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                  <MessageSquare size={24} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                  <div>No notes yet. Write an internal note or chat update below.</div>
                </div>
              ) : (
                comments.map((c, idx) => (
                  <div key={idx} style={{
                    padding: '10px 14px',
                    backgroundColor: '#f8fafc',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    fontSize: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px', color: 'var(--text-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ color: 'var(--text-main)' }}>{c.user_name || 'Staff Member'}</strong>
                        {c.user_role && (
                          <span style={{ fontSize: '9.5px', backgroundColor: '#e2e8f0', padding: '1px 5px', borderRadius: '3px', color: '#475569' }}>
                            {c.user_role}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const authorTag = `@${(c.user_name || 'staff').toLowerCase().replace(/\s+/g, '')} `;
                            setNewComment(prev => prev.includes(authorTag) ? prev : `${authorTag}${prev}`);
                            if (commentInputRef.current) commentInputRef.current.focus();
                          }}
                          className="btn btn-ghost btn-xs"
                          title={`Reply to ${c.user_name || 'staff'}`}
                          style={{ padding: '1px 5px', fontSize: '10px', gap: '3px', color: '#6366f1' }}
                        >
                          <AtSign size={10} />
                          <span>Reply</span>
                        </button>
                      </div>
                    </div>
                    <div style={{ color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                      {formatCommentText(c.content || c.comment)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Form with Floating Mentions Dropdown */}
            <div style={{ position: 'relative', marginTop: 'auto' }}>
              {showMentionMenu && filteredMentionCandidates.length > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '8px',
                  boxShadow: '0 -4px 14px rgba(0,0,0,0.12)',
                  maxHeight: '190px',
                  overflowY: 'auto',
                  zIndex: 999,
                  width: '300px',
                  padding: '4px'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', padding: '4px 8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AtSign size={10} color="#6366f1" />
                    <span>Mention Team Member:</span>
                  </div>
                  {filteredMentionCandidates.map((u, i) => (
                    <div
                      key={u.id || u.username}
                      onClick={() => selectMentionCandidate(u)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: i === mentionIndex ? '#eff6ff' : 'transparent',
                        transition: 'background-color 0.1s'
                      }}
                      onMouseEnter={() => setMentionIndex(i)}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: u.role === 'admin' ? '#ef4444' : '#3b82f6',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        {(u.display_name || u.username || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.display_name || u.username}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                          @{u.username}
                        </div>
                      </div>
                      {u.role && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: '#f1f5f9', color: '#475569', textTransform: 'uppercase', fontWeight: 600 }}>
                          {u.role}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={commentInputRef}
                  type="text"
                  className="form-input"
                  placeholder="Write an internal note or chat update (type @ to mention a teammate)..."
                  value={newComment}
                  onChange={handleCommentInputChange}
                  onKeyDown={handleCommentKeyDown}
                  style={{ flex: 1, fontSize: '12px' }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSendingComment || !newComment.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                >
                  <Send size={13} />
                  <span>{isSendingComment ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
              <div style={{ fontSize: '10.5px', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <AtSign size={10} color="#6366f1" />
                <span>Type <strong>@username</strong> to mention teammates and notify them in real-time.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </DesktopWindow>
  );
}
