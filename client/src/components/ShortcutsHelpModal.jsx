import React from 'react';
import { X, Keyboard } from 'lucide-react';
import DesktopWindow from './DesktopWindow.jsx';

export default function ShortcutsHelpModal({ onClose }) {
  const shortcuts = [
    { key: 'Alt + N / N', label: 'Create New Job Ticket' },
    { key: 'Alt + F / /', label: 'Focus Quick Search' },
    { key: '1', label: 'Switch to Kanban View' },
    { key: '2', label: 'Switch to Table View' },
    { key: '[ / Ctrl+B', label: 'Toggle Sidebar Collapse' },
    { key: 'Alt + 1-5', label: 'Switch Module (Board, CRM, Fleet, Inv, Ins)' },
    { key: 'Double-Click Card', label: 'Open Ticket Details & History' },
    { key: 'Drag Card', label: 'Drag card to any stage column to advance/move' },
    { key: 'R', label: 'Refresh Data & Alerts' },
    { key: 'Esc', label: 'Close Active Window' },
    { key: '?', label: 'Show this Shortcuts Cheatsheet' },
  ];

  return (
    <DesktopWindow
      title="Keyboard & Mouse Shortcuts"
      icon={Keyboard}
      onClose={onClose}
      defaultWidth="480px"
    >
      <div style={{ padding: '16px' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{s.label}</span>
              <kbd
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: '6px 16px', fontSize: '13px' }}>
            Close
          </button>
        </div>
      </div>
    </DesktopWindow>
  );
}
