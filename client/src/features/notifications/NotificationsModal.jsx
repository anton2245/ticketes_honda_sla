import React, { useState, useEffect } from 'react';
import {
  Bell, AtSign, UserCheck, MessageSquare, Check, CheckCheck, Trash2,
  ArrowRight, ExternalLink, RefreshCw, Filter, Clock
} from 'lucide-react';
import DesktopWindow from '../../components/DesktopWindow.jsx';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
} from '../../api/notifications.js';

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsModal({
  onClose,
  onOpenTicket,
  currentUser,
  onNotificationCountChange
}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'mentions' | 'assignments'
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await fetchNotifications();
      const list = res?.notifications || [];
      const unread = Number(res?.unreadCount) || 0;
      setNotifications(list);
      setUnreadCount(unread);
      if (onNotificationCountChange) {
        onNotificationCountChange(unread);
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.id]);

  const handleMarkRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        if (onNotificationCountChange) onNotificationCountChange(next);
        return next;
      });
    } catch (err) {
      console.warn('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setIsProcessing(true);
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      if (onNotificationCountChange) onNotificationCountChange(0);
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const item = notifications.find(n => n.id === id);
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (item && !item.is_read) {
        setUnreadCount(prev => {
          const next = Math.max(0, prev - 1);
          if (onNotificationCountChange) onNotificationCountChange(next);
          return next;
        });
      }
    } catch (err) {
      console.warn('Failed to delete notification:', err);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.is_read) {
      await handleMarkRead(item.id);
    }
    if (item.ticket_id && onOpenTicket) {
      onClose();
      // Mentions and replies direct to comments tab; assignments direct to overview
      const targetTab = (item.type === 'MENTION' || item.type === 'REPLY') ? 'comments' : 'overview';
      onOpenTicket(item.ticket_id, targetTab);
    }
  };

  const filteredItems = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'mentions') return n.type === 'MENTION';
    if (filter === 'assignments') return n.type === 'ASSIGNMENT';
    return true;
  });

  return (
    <DesktopWindow
      title={`Notifications & Mentions ${unreadCount > 0 ? `(@${unreadCount})` : ''}`}
      icon={Bell}
      onClose={onClose}
      defaultWidth="640px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '520px', maxHeight: '75vh' }}>
        {/* Filter Bar & Header Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: '#f8fafc',
          flexShrink: 0
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === 'all' ? '#0f172a' : 'transparent',
                color: filter === 'all' ? '#ffffff' : '#64748b',
                transition: 'all 0.15s ease'
              }}
            >
              All ({notifications.length})
            </button>

            <button
              type="button"
              onClick={() => setFilter('unread')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === 'unread' ? '#0f172a' : 'transparent',
                color: filter === 'unread' ? '#ffffff' : '#64748b',
                transition: 'all 0.15s ease'
              }}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilter('mentions')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === 'mentions' ? '#0f172a' : 'transparent',
                color: filter === 'mentions' ? '#ffffff' : '#64748b',
                transition: 'all 0.15s ease'
              }}
            >
              <AtSign size={12} />
              <span>Mentions</span>
            </button>

            <button
              type="button"
              onClick={() => setFilter('assignments')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === 'assignments' ? '#0f172a' : 'transparent',
                color: filter === 'assignments' ? '#ffffff' : '#64748b',
                transition: 'all 0.15s ease'
              }}
            >
              <UserCheck size={12} />
              <span>Assignments</span>
            </button>
          </div>

          {/* Right Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              title="Refresh notifications"
              className="btn btn-outline"
              style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              <RefreshCw size={12} className={isLoading ? 'spin-icon' : ''} />
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isProcessing}
                className="btn btn-outline"
                style={{ padding: '4px 10px', fontSize: '11px', gap: '5px' }}
              >
                <CheckCheck size={13} color="#059669" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-subtle)', fontSize: '12.5px' }}>
              <RefreshCw size={20} className="spin-icon" style={{ margin: '0 auto 8px', opacity: 0.6 }} />
              <div>Checking for notifications...</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 16px',
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '4px'
              }}>
                <Bell size={20} color="#94a3b8" />
              </div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#475569' }}>
                No {filter !== 'all' ? `${filter} ` : ''}notifications
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', maxWidth: '280px' }}>
                {!currentUser ? 'Please log in to view your personalized notifications, mentions, and assignments.' : "When teammates mention you with @username, assign you tickets, or reply to your notes, you'll see them right here."}
              </div>
            </div>
          ) : (
            filteredItems.map(item => {
              const isUnread = !item.is_read;
              const isMention = item.type === 'MENTION';
              const isAssignment = item.type === 'ASSIGNMENT';
              const isReply = item.type === 'REPLY';

              // Type badge info
              let typeLabel = 'Mention';
              let typeBg = '#eff6ff';
              let typeColor = '#2563eb';
              let typeBorder = '#bfdbfe';
              let typeIcon = <AtSign size={10} />;

              if (isAssignment) {
                typeLabel = 'Ticket Assigned';
                typeBg = '#f0fdf4';
                typeColor = '#16a34a';
                typeBorder = '#bbf7d0';
                typeIcon = <UserCheck size={10} />;
              } else if (isReply) {
                typeLabel = 'Reply';
                typeBg = '#fdf4ff';
                typeColor = '#a855f7';
                typeBorder = '#f5d0fe';
                typeIcon = <MessageSquare size={10} />;
              }

              const initial = (item.actor_name || 'S').charAt(0).toUpperCase();

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${isUnread ? '#bfdbfe' : 'var(--border-light)'}`,
                    backgroundColor: isUnread ? '#f8faff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
                    e.currentTarget.style.borderColor = isUnread ? '#93c5fd' : '#cbd5e1';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = isUnread ? '#bfdbfe' : 'var(--border-light)';
                  }}
                >
                  {/* Unread indicator dot */}
                  {isUnread && (
                    <div style={{
                      position: 'absolute',
                      left: '4px',
                      top: '16px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#2563eb'
                    }} />
                  )}

                  {/* Actor Avatar */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: isAssignment ? '#0284c7' : isMention ? '#4f46e5' : '#475569',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                    flexShrink: 0
                  }}>
                    {initial}
                  </div>

                  {/* Main notification body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a' }}>
                        {item.actor_name || 'Staff Member'}
                      </span>

                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        backgroundColor: typeBg,
                        color: typeColor,
                        border: `1px solid ${typeBorder}`
                      }}>
                        {typeIcon}
                        <span>{typeLabel}</span>
                      </span>

                      {item.ticket_number && (
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--honda-red)'
                        }}>
                          #{item.ticket_number}
                        </span>
                      )}

                      {item.vehicle_no && (
                        <span style={{
                          fontSize: '10.5px',
                          backgroundColor: '#f1f5f9',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: '#475569'
                        }}>
                          {item.vehicle_no}
                        </span>
                      )}

                      <span style={{
                        marginLeft: 'auto',
                        fontSize: '10.5px',
                        color: '#94a3b8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        <Clock size={10} />
                        {formatTimeAgo(item.created_at)}
                      </span>
                    </div>

                    {/* Content snippet */}
                    {item.content_snippet && (
                      <div style={{
                        fontSize: '12px',
                        color: '#334155',
                        lineHeight: 1.4,
                        backgroundColor: isUnread ? '#eff6ff' : '#f8fafc',
                        padding: '6px 10px',
                        borderRadius: '5px',
                        borderLeft: `3px solid ${isUnread ? '#3b82f6' : '#cbd5e1'}`,
                        marginTop: '4px',
                        wordBreak: 'break-word'
                      }}>
                        {item.content_snippet}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, alignSelf: 'center' }}>
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkRead(item.id, e)}
                        title="Mark as read"
                        className="btn btn-outline btn-xs"
                        style={{ padding: '3px 6px' }}
                      >
                        <Check size={12} color="#059669" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Dismiss notification"
                      className="btn btn-ghost btn-xs"
                      style={{ padding: '3px 6px', color: '#94a3b8' }}
                    >
                      <Trash2 size={12} />
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      style={{ padding: '3px 8px', fontSize: '10.5px', gap: '4px' }}
                    >
                      <span>View</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DesktopWindow>
  );
}
