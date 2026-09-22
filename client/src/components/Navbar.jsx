import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Building2, Package, RefreshCw, LayoutDashboard, Users, Car,
  Shield, Keyboard, X, ArrowRight, User, Key, LogOut, ChevronDown, Lock, PanelLeft,
  Bell, AtSign
} from 'lucide-react';
import { lookupCustomers } from '../api/customers.js';
import { fetchVehicles } from '../api/vehicles.js';

export default function Navbar({
  outlets = [],
  selectedOutletId,
  onSelectOutlet,
  searchQuery,
  onSearchChange,
  activeHub = 'BOARD',
  onSelectHub,
  onOpenNewTicket,
  onOpenStock,
  onRefresh,
  isRefreshing,
  onOpenShortcutsHelp,
  searchInputRef,
  onSelectSuggestedTicket,
  onSelectSuggestedCustomer,
  onSelectSuggestedVehicle,
  tickets = [],
  currentUser = null,
  onOpenLogin,
  onOpenChangePassword,
  onOpenUserManagement,
  onLogout,
  sidebarCollapsed = false,
  onToggleSidebar,
  unreadNotificationsCount = 0,
  onOpenNotifications,
}) {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [vehicleSuggestions, setVehicleSuggestions] = useState([]);
  const searchContainerRef = useRef(null);
  const profileContainerRef = useRef(null);

  // Live Suggestive search query
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setSuggestOpen(false);
      setCustomerSuggestions([]);
      setVehicleSuggestions([]);
      return;
    }

    setSuggestOpen(true);
    const timer = setTimeout(() => {
      lookupCustomers(q)
        .then(res => setCustomerSuggestions(res ? res.slice(0, 3) : []))
        .catch(() => {});

      fetchVehicles({ q })
        .then(res => setVehicleSuggestions(res ? res.slice(0, 3) : []))
        .catch(() => {});
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close suggestion box and profile menu
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSuggestOpen(false);
      }
      if (profileContainerRef.current && !profileContainerRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered matching tickets
  const matchingTickets = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    return tickets.filter(t =>
      t.ticket_number?.toLowerCase().includes(q) ||
      t.vehicle_no?.toLowerCase().includes(q) ||
      t.customer_name?.toLowerCase().includes(q) ||
      t.model?.toLowerCase().includes(q) ||
      t.chassis_no?.toLowerCase().includes(q)
    ).slice(0, 4);
  }, [tickets, searchQuery]);

  return (
    <header style={{
      height: '52px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--border-light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      gap: '12px',
      userSelect: 'none',
      zIndex: 100,
      flexShrink: 0
    }}>
      {/* Brand, Sidebar Toggle & Outlet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Sidebar Toggle Button */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              backgroundColor: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
          >
            <PanelLeft size={16} />
          </button>
        )}

        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          onClick={() => onSelectHub && onSelectHub('BOARD')}
          title="Go to Operations Board"
        >
          <div style={{
            width: '26px',
            height: '26px',
            backgroundColor: 'var(--honda-red)',
            borderRadius: '6px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '14px',
            fontFamily: 'sans-serif'
          }}>
            H
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.2px', lineHeight: 1.1 }}>
              HONDA TICKETS
            </div>
            <div style={{ fontSize: '9.5px', color: 'var(--text-subtle)', fontWeight: 600 }}>
              Workshop SLA Hub
            </div>
          </div>
        </div>

        {/* Outlet Switcher */}
        {outlets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '1px solid var(--border-light)', paddingLeft: '10px' }}>
            <Building2 size={14} color="var(--text-subtle)" />
            <select
              value={selectedOutletId || ''}
              onChange={(e) => onSelectOutlet(e.target.value ? Number(e.target.value) : null)}
              className="form-select"
              style={{ padding: '3px 6px', fontSize: '11px', height: '28px', maxWidth: '140px' }}
            >
              <option value="">All Outlets</option>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Suggestive Global Search Box */}
      <div ref={searchContainerRef} style={{ flex: 1, maxWidth: '380px', position: 'relative' }}>
        <Search size={14} color="var(--text-subtle)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.trim().length >= 2) setSuggestOpen(true);
          }}
          placeholder="Search ticket, plate, customer, VIN (Alt+F / /)..."
          className="form-input"
          style={{ paddingLeft: '32px', paddingRight: '48px', height: '32px', fontSize: '12px' }}
        />
        <kbd
          style={{
            position: 'absolute',
            right: '8px',
            top: '7px',
            fontSize: '10px',
            backgroundColor: '#f1f5f9',
            border: '1px solid var(--border-medium)',
            borderRadius: '3px',
            padding: '1px 5px',
            color: 'var(--text-subtle)',
            fontFamily: 'var(--font-mono)'
          }}
        >
          /
        </kbd>

        {/* Live Suggestion Popover */}
        {suggestOpen && (matchingTickets.length > 0 || customerSuggestions.length > 0 || vehicleSuggestions.length > 0) && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-medium)',
            borderRadius: '6px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            maxHeight: '380px',
            overflowY: 'auto',
            padding: '8px 0',
          }}>
            {/* Matching Tickets */}
            {matchingTickets.length > 0 && (
              <div>
                <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--honda-red)', textTransform: 'uppercase' }}>
                  Tickets ({matchingTickets.length})
                </div>
                {matchingTickets.map(t => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSuggestOpen(false);
                      onSelectSuggestedTicket && onSelectSuggestedTicket(t);
                    }}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      borderBottom: '1px solid var(--border-light)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--honda-red)', fontFamily: 'var(--font-mono)', marginRight: '6px' }}>
                        {t.ticket_number}
                      </span>
                      <span style={{ fontWeight: 600 }}>{t.vehicle_no || t.model || 'Vehicle'}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>• {t.customer_name}</span>
                    </div>
                    <span style={{ fontSize: '10px', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                      Stage {t.current_stage_id}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Matching Customers */}
            {customerSuggestions.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                  Customers ({customerSuggestions.length})
                </div>
                {customerSuggestions.map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSuggestOpen(false);
                      onSelectSuggestedCustomer && onSelectSuggestedCustomer(c);
                    }}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      borderBottom: '1px solid var(--border-light)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-main)' }}>{c.name}</strong>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{c.primary_phone}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 600 }}>Open CRM →</span>
                  </div>
                ))}
              </div>
            )}

            {/* Matching Vehicles */}
            {vehicleSuggestions.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
                  Vehicles ({vehicleSuggestions.length})
                </div>
                {vehicleSuggestions.map(v => (
                  <div
                    key={v.id}
                    onClick={() => {
                      setSuggestOpen(false);
                      onSelectSuggestedVehicle && onSelectSuggestedVehicle(v);
                    }}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, marginRight: '6px' }}>
                        {v.vehicle_no || 'NOT REG'}
                      </span>
                      <span>{v.model || v.vehicle_name}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Open Fleet →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onOpenShortcutsHelp}
          title="Keyboard shortcuts (?)"
          style={{ padding: '4px 8px', fontSize: '12px' }}
        >
          <Keyboard size={13} />
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh data (R)"
          style={{ padding: '4px 8px', fontSize: '12px' }}
        >
          <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenNewTicket}
          title="Create New Job Ticket (Alt+N)"
          style={{ padding: '4px 12px', fontSize: '12px', gap: '6px' }}
        >
          <Plus size={14} />
          <span>New Ticket</span>
          <kbd style={{ fontSize: '9px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '1px 4px', borderRadius: '3px', marginLeft: '2px' }}>Alt+N</kbd>
        </button>

        {/* Notifications & Mentions Center Button */}
        <button
          type="button"
          onClick={onOpenNotifications}
          title={unreadNotificationsCount > 0 ? `${unreadNotificationsCount} unread notification(s)` : 'Notifications & Mentions'}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: unreadNotificationsCount > 0 ? '4px 8px' : '4px 8px',
            borderRadius: '6px',
            border: `1px solid ${unreadNotificationsCount > 0 ? '#fca5a5' : 'var(--border-light)'}`,
            backgroundColor: unreadNotificationsCount > 0 ? '#fff1f2' : '#ffffff',
            color: unreadNotificationsCount > 0 ? 'var(--honda-red)' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontSize: '12px'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = unreadNotificationsCount > 0 ? '#ffe4e6' : '#f1f5f9';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = unreadNotificationsCount > 0 ? '#fff1f2' : '#ffffff';
          }}
        >
          <Bell size={13} color={unreadNotificationsCount > 0 ? 'var(--honda-red)' : '#475569'} />
          {unreadNotificationsCount > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--honda-red)',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1
            }}>
              @{unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
            </span>
          )}
        </button>

        {/* User Profile / Auth Menu */}
        <div ref={profileContainerRef} style={{ position: 'relative', marginLeft: '6px' }}>
          {currentUser ? (
            <div>
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '3px 8px 3px 4px',
                  backgroundColor: profileOpen ? '#f1f5f9' : 'transparent',
                  border: '1px solid var(--border-light)',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={`Signed in as ${currentUser.displayName || currentUser.username}`}
              >
                {/* Avatar Initial Circle */}
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: currentUser.role === 'admin' ? 'var(--honda-red)' : '#334155',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '12px'
                }}>
                  {(currentUser.displayName || currentUser.username || 'U').charAt(0).toUpperCase()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser.displayName || currentUser.username}
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: currentUser.role === 'admin' ? 'var(--honda-red)' : 'var(--text-subtle)'
                  }}>
                    {currentUser.role || 'USER'}
                  </span>
                </div>

                <ChevronDown size={13} color="var(--text-subtle)" style={{ transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {/* Dropdown Menu */}
              {profileOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  width: '240px',
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 1000,
                  padding: '6px 0',
                  animation: 'modalIn 0.15s ease-out'
                }}>
                  {/* User Profile Header */}
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main)' }}>
                      {currentUser.displayName || currentUser.username}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                      @{currentUser.username}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: currentUser.role === 'admin' ? '#eff6ff' : '#f8fafc',
                        color: currentUser.role === 'admin' ? '#1d4ed8' : '#475569',
                        border: `1px solid ${currentUser.role === 'admin' ? '#bfdbfe' : '#e2e8f0'}`
                      }}>
                        {currentUser.role === 'admin' ? 'System Administrator' : 'Standard User'}
                      </span>
                    </div>
                  </div>

                  {/* Admin: User Management */}
                  {currentUser.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onOpenUserManagement && onOpenUserManagement();
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: 'none',
                        background: 'none',
                        textAlign: 'left',
                        fontSize: '12.5px',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Users size={14} color="#1d4ed8" />
                      <span>User Management & Permissions</span>
                    </button>
                  )}

                  {/* Change Password */}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenChangePassword && onOpenChangePassword();
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      fontSize: '12.5px',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      transition: 'background-color 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <Key size={14} color="var(--text-subtle)" />
                    <span>Change Password</span>
                  </button>

                  <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '4px 0' }} />

                  {/* Sign Out */}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout && onLogout();
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      fontSize: '12.5px',
                      color: 'var(--honda-red)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'background-color 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onOpenLogin}
              style={{ padding: '4px 10px', fontSize: '12px', gap: '6px' }}
            >
              <Lock size={13} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
