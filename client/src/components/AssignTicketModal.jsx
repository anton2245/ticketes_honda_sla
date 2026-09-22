import React, { useState, useEffect } from 'react';
import { UserCheck, User, Wrench, Shield, Check, X, AlertCircle } from 'lucide-react';
import DesktopWindow from './DesktopWindow.jsx';
import { fetchMentionUsers } from '../api/notifications.js';
import { updateTicket, addTicketComment } from '../api/tickets.js';

export default function AssignTicketModal({ ticket, onClose, onAssigned }) {
  const [assignee, setAssignee] = useState(ticket?.assigned_to || '');
  const [note, setNote] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadUsers() {
      try {
        const list = await fetchMentionUsers();
        if (isMounted && Array.isArray(list)) {
          setUsers(list);
        }
      } catch (err) {
        console.warn('Could not load mention users:', err);
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }
    loadUsers();
    return () => { isMounted = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assignee.trim()) {
      setError('Please select or enter an assignee name.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const trimmedAssignee = assignee.trim();
      const updated = await updateTicket(ticket.id, {
        assignedTo: trimmedAssignee,
        assignmentNote: note.trim()
      });

      // If user added an assignment note, post it as a comment for clear audit
      if (note.trim()) {
        try {
          await addTicketComment(ticket.id, `[Assigned to ${trimmedAssignee}] ${note.trim()}`);
        } catch (_) {}
      }

      if (onAssigned) {
        onAssigned(updated || { ...ticket, assigned_to: trimmedAssignee });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update assignment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DesktopWindow
      title={`Assign Ticket ${ticket.ticket_number || `#${ticket.id}`}`}
      icon={UserCheck}
      onClose={onClose}
      defaultWidth="480px"
    >
      <form onSubmit={handleSubmit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Ticket Header Brief */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          padding: '10px 14px',
          borderRadius: '6px',
          border: '1px solid var(--border-light)',
          fontSize: '12px'
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
              {ticket.vehicle_plate || ticket.vehicle_no || 'UNREGISTERED'}
            </div>
            <div style={{ color: 'var(--text-subtle)' }}>
              {ticket.vehicle_model || ticket.model || 'Honda Vehicle'} • {ticket.customer_name || 'Customer'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              backgroundColor: '#e0e7ff',
              color: '#3730a3',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 700
            }}>
              Stage {ticket.current_stage_id}
            </span>
          </div>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--sla-red-bg)',
            color: 'var(--sla-red-text)',
            border: '1px solid var(--sla-red-border)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Assignee Input / Quick Selection */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
            Assigned Staff / Technician / Advisor <span style={{ color: 'var(--honda-red)' }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Select staff below or type custom name..."
            style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }}
            autoFocus
          />
        </div>

        {/* Quick User Suggestions */}
        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-subtle)', display: 'block', marginBottom: '6px' }}>
            Quick Select Active Team:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
            {isLoadingUsers ? (
              <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>Loading team members...</span>
            ) : users.length === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>No registered users found.</span>
            ) : (
              users.map(u => {
                const isSelected = assignee.toLowerCase() === (u.display_name || u.username).toLowerCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setAssignee(u.display_name || u.username)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      borderRadius: '16px',
                      border: isSelected ? '1.5px solid var(--honda-red)' : '1px solid var(--border-medium)',
                      backgroundColor: isSelected ? 'var(--honda-red-light)' : '#ffffff',
                      color: isSelected ? 'var(--honda-red)' : 'var(--text-main)',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.1s'
                    }}
                  >
                    <User size={12} />
                    <span>{u.display_name || u.username}</span>
                    <span style={{ fontSize: '9.5px', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>({u.role})</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Assignment Note */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
            Assignment Note / Instructions (Optional)
          </label>
          <textarea
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., Primary technician for panel beating & paint matching..."
            style={{ width: '100%', fontSize: '12px', resize: 'vertical' }}
          />
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving}
            style={{ minWidth: '130px' }}
          >
            {isSaving ? 'Assigning...' : 'Save Assignment'}
          </button>
        </div>
      </form>
    </DesktopWindow>
  );
}
