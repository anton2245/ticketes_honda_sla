/**
 * realtime.js — Dual-Channel Real-time Synchronization (Supabase Realtime + Express SSE)
 * 
 * Subscribes to database changes directly from Supabase Realtime (PostgreSQL replication)
 * and combines with backend SSE events for instant notification of creations, modifications,
 * and deletions across all active client instances.
 */

import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;
let realtimeChannel = null;

// Track recently processed event keys to deduplicate across Supabase Realtime and SSE
const recentEvents = new Map();
const DEDUPE_WINDOW_MS = 1000;

function isDuplicate(key) {
  const now = Date.now();
  // Clean old
  for (const [k, time] of recentEvents.entries()) {
    if (now - time > DEDUPE_WINDOW_MS * 2) {
      recentEvents.delete(k);
    }
  }

  if (recentEvents.has(key)) {
    return true;
  }
  recentEvents.set(key, now);
  return false;
}

/**
 * Fetch Supabase client configuration from Express backend
 */
async function fetchSupabaseConfig() {
  try {
    const res = await fetch('/api/config/supabase-client');
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Could not load Supabase client config:', err.message);
    return null;
  }
}

/**
 * Initialize Supabase client
 */
async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const config = await fetchSupabaseConfig();
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    console.warn('Supabase URL or Anon Key missing from backend config.');
    return null;
  }

  try {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

/**
 * Main subscriber function for ticket events
 * 
 * @param {Object} handlers
 * @param {Function} handlers.onInsert - Called with new ticket object
 * @param {Function} handlers.onUpdate - Called with updated ticket object
 * @param {Function} handlers.onDelete - Called with deleted ticketId (number or string)
 * @param {Function} handlers.onGeneralChange - Called when general event triggers a full refresh
 * @param {Function} handlers.onNotification - Called when a user notification arrives
 * @param {Function} handlers.onComment - Called when a ticket comment is added
 * @returns {Function} unsubscribe cleanup function
 */
export function subscribeToRealtimeTickets({ onInsert, onUpdate, onDelete, onGeneralChange, onNotification, onComment }) {
  let isCleanedUp = false;
  let eventSource = null;

  // 1. Supabase Realtime Setup
  (async () => {
    try {
      const client = await getSupabaseClient();
      if (!client || isCleanedUp) return;

      realtimeChannel = client
        .channel('honda-kanban-realtime-' + Math.random().toString(36).substring(2, 9))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
          if (isCleanedUp) return;
          const { eventType, new: newRecord, old: oldRecord } = payload;
          console.log(`[Supabase Realtime Tickets] ${eventType}:`, payload);

          if (eventType === 'INSERT' && newRecord) {
            const dedupeKey = `insert_${newRecord.id}`;
            if (!isDuplicate(dedupeKey) && onInsert) {
              onInsert(newRecord);
            }
          } else if (eventType === 'UPDATE' && newRecord) {
            const dedupeKey = `update_${newRecord.id}_${newRecord.current_stage_id}_${newRecord.updated_at || ''}`;
            if (!isDuplicate(dedupeKey) && onUpdate) {
              onUpdate(newRecord);
            }
          } else if (eventType === 'DELETE') {
            const delId = oldRecord?.id;
            const dedupeKey = `delete_${delId}`;
            if (!isDuplicate(dedupeKey) && onDelete && delId) {
              onDelete(delId);
            } else if (onGeneralChange) {
              onGeneralChange();
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications' }, (payload) => {
          if (isCleanedUp) return;
          console.log(`[Supabase Realtime Notifications] ${payload.eventType}:`, payload);
          if (onNotification) {
            onNotification(payload);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments' }, (payload) => {
          if (isCleanedUp) return;
          console.log(`[Supabase Realtime Comments] ${payload.eventType}:`, payload);
          if (onComment) {
            onComment(payload);
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('✓ Supabase Realtime connected for Tickets, Mentions & Comments.');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('Supabase Realtime channel error (falling back to SSE):', err);
          }
        });
    } catch (err) {
      console.warn('Supabase Realtime subscription error:', err);
    }
  })();

  // 2. Express Backend SSE Setup (Instant local broadcast channel)
  try {
    eventSource = new EventSource('/api/events');

    eventSource.onmessage = (e) => {
      if (isCleanedUp) return;
      try {
        const payload = JSON.parse(e.data);
        if (!payload || !payload.type || payload.type === 'CONNECTED') return;

        console.log(`[SSE Realtime] ${payload.type}:`, payload.data);

        switch (payload.type) {
          case 'TICKET_CREATED': {
            const t = payload.data?.ticket;
            if (t?.id) {
              const dedupeKey = `insert_${t.id}`;
              if (!isDuplicate(dedupeKey) && onInsert) {
                onInsert(t);
              }
            } else if (onGeneralChange) {
              onGeneralChange();
            }
            break;
          }

          case 'STAGE_ADVANCED':
          case 'STAGE_ROLLED_BACK':
          case 'STAGE_BYPASSED':
          case 'STAGE_SKIPPED':
          case 'TICKET_UPDATED': {
            const t = payload.data?.ticket;
            if (t?.id) {
              const dedupeKey = `update_${t.id}_${t.current_stage_id}_${t.updated_at || ''}`;
              if (!isDuplicate(dedupeKey) && onUpdate) {
                onUpdate(t);
              }
            } else if (onGeneralChange) {
              onGeneralChange();
            }
            break;
          }

          case 'TICKET_DELETED': {
            const delId = payload.data?.ticketId;
            if (delId) {
              const dedupeKey = `delete_${delId}`;
              if (!isDuplicate(dedupeKey) && onDelete) {
                onDelete(delId);
              }
            } else if (onGeneralChange) {
              onGeneralChange();
            }
            break;
          }

          case 'STOCK_UPDATED':
          case 'MASTER_UPDATED':
          case 'PARTS_NOTE_UPDATED': {
            if (onGeneralChange) {
              onGeneralChange();
            }
            break;
          }

          default: {
            if (onGeneralChange) {
              onGeneralChange();
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      // Auto-reconnect is handled natively by EventSource
    };
  } catch (err) {
    console.warn('SSE connection error:', err);
  }

  // Cleanup handler
  return () => {
    isCleanedUp = true;
    if (eventSource) {
      try { eventSource.close(); } catch {}
    }
    if (realtimeChannel && supabaseClient) {
      try { supabaseClient.removeChannel(realtimeChannel); } catch {}
      realtimeChannel = null;
    }
  };
}
