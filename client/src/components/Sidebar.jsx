import React from 'react';
import {
  LayoutDashboard,
  Users,
  Car,
  Package,
  Shield,
  Boxes,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Clock
} from 'lucide-react';

export default function Sidebar({
  activeHub = 'BOARD',
  onSelectHub,
  collapsed = false,
  onToggleCollapse,
  onOpenStock,
  onOpenShortcutsHelp,
  ticketCounts = { total: 0 }
}) {
  const navItems = [
    {
      id: 'BOARD',
      label: 'Operations Board',
      shortLabel: 'Board',
      icon: LayoutDashboard,
      badge: ticketCounts.total > 0 ? ticketCounts.total : null,
      badgeColor: '#dc2626'
    },
    {
      id: 'CUSTOMERS',
      label: 'CRM & Customers',
      shortLabel: 'CRM',
      icon: Users,
    },
    {
      id: 'VEHICLES',
      label: 'Vehicles Fleet',
      shortLabel: 'Fleet',
      icon: Car,
    },
    {
      id: 'INVENTORY',
      label: 'Inventory & Parts',
      shortLabel: 'Inventory',
      icon: Package,
    },
    {
      id: 'INSURANCE',
      label: 'Insurance Desk',
      shortLabel: 'Insurance',
      icon: Shield,
    },
  ];

  return (
    <aside
      style={{
        width: collapsed ? '60px' : '220px',
        minWidth: collapsed ? '60px' : '220px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        height: '100%',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 50,
        boxShadow: '1px 0 3px rgba(0, 0, 0, 0.02)'
      }}
    >
      {/* Top Section: Nav Links */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: '4px' }}>
        {/* Section Label (when expanded) */}
        {!collapsed && (
          <div style={{
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            color: 'var(--text-subtle)',
            padding: '4px 10px 8px 10px'
          }}>
            Main Modules
          </div>
        )}

        {/* Primary Hub Nav Items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeHub === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectHub(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between',
                padding: collapsed ? '10px 0' : '9px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? '#fef2f2' : 'transparent',
                color: isActive ? 'var(--honda-red)' : '#334155',
                cursor: 'pointer',
                fontWeight: isActive ? 700 : 500,
                fontSize: '13px',
                transition: 'all 0.15s ease',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.color = '#0f172a';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#334155';
                }
              }}
            >
              {/* Left Accent Bar for Active State */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  left: '0',
                  top: '6px',
                  bottom: '6px',
                  width: '3.5px',
                  backgroundColor: 'var(--honda-red)',
                  borderRadius: '0 4px 4px 0'
                }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon
                  size={18}
                  color={isActive ? 'var(--honda-red)' : '#64748b'}
                  style={{ flexShrink: 0, transition: 'color 0.15s ease' }}
                />
                {!collapsed && (
                  <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    letterSpacing: '-0.1px'
                  }}>
                    {item.label}
                  </span>
                )}
              </div>

              {/* Badge (e.g. Active Tickets count) */}
              {!collapsed && item.badge !== null && item.badge !== undefined && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  backgroundColor: isActive ? 'var(--honda-red)' : '#e2e8f0',
                  color: isActive ? '#ffffff' : '#475569',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  lineHeight: '14px',
                  minWidth: '18px',
                  textAlign: 'center'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '10px 4px' }} />

        {/* Quick Tools Section */}
        {!collapsed && (
          <div style={{
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            color: 'var(--text-subtle)',
            padding: '4px 10px 6px 10px'
          }}>
            Quick Tools
          </div>
        )}

        {/* Stock Catalog Action */}
        <button
          type="button"
          onClick={onOpenStock}
          title={collapsed ? 'Physical Stock Catalog' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '10px',
            padding: collapsed ? '10px 0' : '9px 12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#475569',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.color = 'var(--text-main)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#475569';
          }}
        >
          <Boxes size={18} color="#64748b" style={{ flexShrink: 0 }} />
          {!collapsed && (
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Stock Catalog
            </span>
          )}
        </button>
      </div>

      {/* Bottom Section: Shortcuts & Collapse Toggle */}
      <div style={{
        padding: '10px 8px',
        borderTop: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        backgroundColor: '#fafbfc'
      }}>
        {/* Keyboard Shortcuts Trigger */}
        <button
          type="button"
          onClick={onOpenShortcutsHelp}
          title={collapsed ? 'Shortcuts Cheatsheet (?)' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '8px 0' : '7px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f1f5f9';
            e.currentTarget.style.color = '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#64748b';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={15} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Shortcuts</span>}
          </div>
          {!collapsed && (
            <kbd style={{
              fontSize: '10px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '3px',
              padding: '1px 5px',
              color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)'
            }}>
              ?
            </kbd>
          )}
        </button>

        {/* Collapse / Expand Toggle Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '8px 0' : '7px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-light)',
            backgroundColor: '#ffffff',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.color = '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.color = '#64748b';
          }}
        >
          {!collapsed && <span>Collapse Sidebar</span>}
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  );
}
