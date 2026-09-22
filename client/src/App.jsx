import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import KanbanBoard from './features/kanban/KanbanBoard.jsx';
import TableView from './features/board/TableView.jsx';

import CustomersHub from './features/customers/CustomersHub.jsx';
import VehiclesHub from './features/vehicles/VehiclesHub.jsx';
import InventoryHub from './features/inventory/InventoryHub.jsx';
import InsuranceHub from './features/insurance/InsuranceHub.jsx';

import ShortcutsHelpModal from './components/ShortcutsHelpModal.jsx';
import TicketProfileModal from './features/ticket/TicketProfileModal.jsx';
import NewTicketModal from './features/ticket/NewTicketModal.jsx';

// Auth & User Management Modals
import LoginModal from './features/auth/LoginModal.jsx';
import ChangePasswordModal from './features/auth/ChangePasswordModal.jsx';
import UserManagementModal from './features/auth/UserManagementModal.jsx';
import { fetchMe, logout } from './api/auth.js';

// Stage Modals
import Stage2EstimationModal from './features/stages/Stage2EstimationModal.jsx';
import Stage4SurveyModal from './features/stages/Stage4SurveyModal.jsx';
import Stage5ApprovalModal from './features/stages/Stage5ApprovalModal.jsx';
import Stage6PartsOrderModal from './features/stages/Stage6PartsOrderModal.jsx';
import Stage7PartsArrivalModal from './features/stages/Stage7PartsArrivalModal.jsx';
import Stage8WorkStartModal from './features/stages/Stage8WorkStartModal.jsx';
import Stage9WorkCompleteModal from './features/stages/Stage9WorkCompleteModal.jsx';
import Stage10InvoiceModal from './features/stages/Stage10InvoiceModal.jsx';
import Stage11DeliveryModal from './features/stages/Stage11DeliveryModal.jsx';
import GenericAdvanceModal from './features/stages/GenericAdvanceModal.jsx';
import PcaResolutionModal from './features/stages/PcaResolutionModal.jsx';

import StockCatalogModal from './features/inventory/StockCatalogModal.jsx';
import TicketContextMenu from './components/TicketContextMenu.jsx';
import AssignTicketModal from './components/AssignTicketModal.jsx';
import EstimatePrintModal from './components/EstimatePrintModal.jsx';
import RollbackConfirmModal from './components/RollbackConfirmModal.jsx';
import NotificationsModal from './features/notifications/NotificationsModal.jsx';
import { requestNotificationPermission, triggerDesktopNotification } from './utils/desktopNotification.js';
import { downloadTicketEstimate } from './utils/estimateExporter.js';
import { downloadEstimateXlsx } from './utils/estimateXlsxExporter.js';

import { fetchTickets, fetchTicket, createTicket, deleteTicket, advanceTicketStage, rollbackTicketStage } from './api/tickets.js';
import { fetchNotifications } from './api/notifications.js';
import { fetchStages } from './api/stages.js';
import { fetchOutlets } from './api/outlets.js';
import { subscribeToRealtimeTickets } from './services/realtime.js';
import { getCachedStages, saveCachedStages, getCachedOutlets, saveCachedOutlets } from './services/localDb.js';
import NetworkErrorBanner from './components/NetworkErrorBanner.jsx';
import { useNetworkStatus } from './hooks/useNetworkStatus.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { LayoutGrid, TableProperties, CheckCircle2, Printer, FileSpreadsheet, X, Bell } from 'lucide-react';

export default function App() {
  const { isConnected } = useNetworkStatus();
  const [stages, setStages] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active navigation hub: 'BOARD', 'CUSTOMERS', 'VEHICLES', 'INVENTORY', 'INSURANCE'
  const [activeHub, setActiveHub] = useState('BOARD');

  // Operations Board view mode: 'KANBAN' or 'TABLE'
  const [boardViewMode, setBoardViewMode] = useState('KANBAN');

  // Sidebar navigation collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('honda_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('honda_sidebar_collapsed', String(next)); } catch (_) {}
      return next;
    });
  };

  // Authentication & User State
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);

  // Modals state
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [profileModalTab, setProfileModalTab] = useState('overview');
  const [pcaModalTicket, setPcaModalTicket] = useState(null);
  const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, ticket: null });
  const [assignTicketTarget, setAssignTicketTarget] = useState(null);
  const [estimatePrintTicket, setEstimatePrintTicket] = useState(null);
  const [postSaveEstimateTicket, setPostSaveEstimateTicket] = useState(null);
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isStockCatalogOpen, setIsStockCatalogOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [arrivalModalTicket, setArrivalModalTicket] = useState(null);
  const [orderModalTicket, setOrderModalTicket] = useState(null);

  // Notifications & Mentions state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [toastNotification, setToastNotification] = useState(null);

  // Request native OS desktop notification permission on app mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Handle native Electron OS notification click navigation
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.onNotificationOpen === 'function') {
      window.electronAPI.onNotificationOpen(({ ticketId, type }) => {
        if (!ticketId) return;
        const targetTab = (type === 'MENTION' || type === 'REPLY') ? 'comments' : 'overview';
        fetchTicket(ticketId).then(tkt => {
          if (tkt) {
            setSelectedTicket(tkt);
            setProfileModalTab(targetTab);
          }
        }).catch(() => {});
      });
    }
  }, []);

  // Stage advance state: { ticket, nextStage }
  const [advanceState, setAdvanceState] = useState(null);
  const [isSubmittingAdvance, setIsSubmittingAdvance] = useState(false);
  const [rollbackPrompt, setRollbackPrompt] = useState(null);
  const [isSubmittingRollback, setIsSubmittingRollback] = useState(false);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const searchInputRef = useRef(null);

  // Check existing session token on mount
  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem('honda_auth_token');
      if (token) {
        try {
          const res = await fetchMe();
          if (res && res.user) {
            setCurrentUser(res.user);
          } else {
            localStorage.removeItem('honda_auth_token');
            setCurrentUser(null);
          }
        } catch {
          localStorage.removeItem('honda_auth_token');
          setCurrentUser(null);
        }
      }
      setIsCheckingAuth(false);
    }
    checkAuth();
  }, []);

  // Auto-dismiss toast notification after 6 seconds
  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => {
      setToastNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  // Load notifications count strictly for currently logged-in user
  const loadNotificationCount = useCallback(async () => {
    const current = currentUserRef.current;
    if (!current?.id) {
      setUnreadNotificationsCount(0);
      return;
    }
    try {
      const res = await fetchNotifications();
      if (res && res.unreadCount !== undefined) {
        setUnreadNotificationsCount(Number(res.unreadCount) || 0);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadNotificationCount();
  }, [loadNotificationCount, currentUser]);

  const loadTickets = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const list = await fetchTickets({
        outletId: selectedOutletId,
        search: searchQuery,
      });
      setTickets(list || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedOutletId, searchQuery]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Keyboard shortcut hook
  useKeyboardShortcuts({
    onSearchFocus: () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    },
    onNewTicket: () => setIsNewTicketOpen(true),
    onRefresh: () => loadTickets(),
    onViewKanban: () => setBoardViewMode('KANBAN'),
    onViewTable: () => setBoardViewMode('TABLE'),
    onHelp: () => setIsShortcutsHelpOpen(true),
    onEscape: () => {
      setSelectedTicket(null);
      setIsNewTicketOpen(false);
      setIsStockCatalogOpen(false);
      setIsShortcutsHelpOpen(false);
      setAdvanceState(null);
      setPcaModalTicket(null);
      setContextMenu({ isOpen: false, x: 0, y: 0, ticket: null });
      setAssignTicketTarget(null);
      setEstimatePrintTicket(null);
      setRollbackPrompt(null);
      setArrivalModalTicket(null);
      setOrderModalTicket(null);
      setIsLoginModalOpen(false);
      setIsChangePasswordOpen(false);
      setIsUserManagementOpen(false);
      setIsNotificationsOpen(false);
    },
    enabled: true
  });

  // Load initial static data (outlets, stages)
  useEffect(() => {
    async function loadMetadata() {
      // 1. Try Cache First for immediate render
      const cachedStages = await getCachedStages();
      if (cachedStages && cachedStages.length > 0) {
        setStages(cachedStages);
      }
      const cachedOutlets = await getCachedOutlets();
      if (cachedOutlets && cachedOutlets.length > 0) {
        setOutlets(cachedOutlets);
        if (!selectedOutletId) setSelectedOutletId(cachedOutlets[0].id);
      }

      // 2. Fetch fresh from server
      try {
        const [freshStages, freshOutlets] = await Promise.all([
          fetchStages(),
          fetchOutlets(),
        ]);
        if (freshStages && freshStages.length > 0) {
          setStages(freshStages);
          saveCachedStages(freshStages);
        }
        if (freshOutlets && freshOutlets.length > 0) {
          setOutlets(freshOutlets);
          saveCachedOutlets(freshOutlets);
          if (!selectedOutletId) {
            setSelectedOutletId(freshOutlets[0].id);
          }
        }
      } catch (err) {
        console.warn('Could not load fresh stages/outlets, using cached fallback.', err);
      }
    }
    loadMetadata();
  }, []);

  // Real-time synchronization across all users (Supabase Realtime + Backend SSE)
  // Per user requirement: Kanban board tickets are 100% realtime (not cached in local DB)
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeTickets({
      onInsert: (newTicket) => {
        if (!newTicket || !newTicket.id) return;
        setTickets(prev => {
          if (prev.some(t => String(t.id) === String(newTicket.id))) return prev;
          return [newTicket, ...prev];
        });
      },
      onUpdate: (updatedTicket) => {
        if (!updatedTicket || !updatedTicket.id) return;
        setTickets(prev => {
          const exists = prev.some(t => String(t.id) === String(updatedTicket.id));
          if (!exists) {
            return [updatedTicket, ...prev];
          }
          return prev.map(t => (String(t.id) === String(updatedTicket.id) ? { ...t, ...updatedTicket } : t));
        });

        // If this ticket is open in detail modal, update it live
        setSelectedTicket(current => {
          if (current && String(current.id) === String(updatedTicket.id)) {
            return { ...current, ...updatedTicket };
          }
          return current;
        });
      },
      onDelete: (deletedTicketId) => {
        if (!deletedTicketId) return;
        setTickets(prev => prev.filter(t => String(t.id) !== String(deletedTicketId)));

        // If deleted ticket was open in modal, close it immediately
        setSelectedTicket(current => {
          if (current && String(current.id) === String(deletedTicketId)) {
            return null;
          }
          return current;
        });
        setAdvanceState(current => {
          if (current?.ticket && String(current.ticket.id) === String(deletedTicketId)) {
            return null;
          }
          return current;
        });
      },
      onGeneralChange: () => {
        loadTickets();
        loadNotificationCount();
      },
      onNotification: (payload) => {
        const notif = payload.new;
        if (!notif) return;

        const current = currentUserRef.current;
        // Strict personalization: Only notify if recipient is the current authenticated user
        if (!current || !current.id) return;
        if (String(notif.user_id) !== String(current.id)) return;
        // Never notify oneself for actions performed
        if (notif.actor_id && String(notif.actor_id) === String(current.id)) return;

        setUnreadNotificationsCount(prev => prev + 1);
        const actor = notif.actor_name || 'Staff';
        const tktNum = notif.ticket_number ? `#${notif.ticket_number}` : 'a ticket';
        let msg = `🔔 ${actor} mentioned you on ${tktNum}`;
        if (notif.type === 'ASSIGNMENT') {
          msg = `📋 ${actor} assigned ticket ${tktNum} to you!`;
        } else if (notif.type === 'REPLY') {
          msg = `💬 ${actor} replied to note on ${tktNum}`;
        }

        const openTargetTicket = () => {
          if (notif.ticket_id) {
            const found = tickets.find(t => String(t.id) === String(notif.ticket_id));
            const targetTab = (notif.type === 'MENTION' || notif.type === 'REPLY') ? 'comments' : 'overview';
            if (found) {
              setSelectedTicket(found);
              setProfileModalTab(targetTab);
            } else {
              fetchTicket(notif.ticket_id).then(tkt => {
                if (tkt) {
                  setSelectedTicket(tkt);
                  setProfileModalTab(targetTab);
                }
              }).catch(() => {});
            }
          }
        };

        // 1. In-App Toast
        setToastNotification({
          id: notif.id || Date.now(),
          message: msg,
          ticketId: notif.ticket_id,
          type: notif.type,
          snippet: notif.content_snippet
        });

        // 2. Native OS Desktop Notification (Electron / Windows Action Center / Browser)
        triggerDesktopNotification({
          title: msg,
          body: notif.content_snippet || 'Click to open in Honda Service Desk app',
          ticketId: notif.ticket_id,
          type: notif.type,
          onClick: openTargetTicket
        });
      },
      onComment: (payload) => {
        const cmt = payload.new;
        if (!cmt || !cmt.ticket_id) return;
        // Trigger live refresh if ticket is currently open
        setSelectedTicket(current => {
          if (current && String(current.id) === String(cmt.ticket_id)) {
            return { ...current, _lastCommentAt: Date.now() };
          }
          return current;
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [loadTickets, loadNotificationCount]);

  // Fallback background polling every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      loadTickets();
      loadNotificationCount();
    }, 30000);
    return () => clearInterval(timer);
  }, [loadTickets, loadNotificationCount]);

  // Handle Login & Logout
  const handleLoginSuccess = (user, token) => {
    setCurrentUser(user);
    setIsLoginModalOpen(false);
    loadTickets();
  };

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('honda_auth_token');
    setCurrentUser(null);
    setIsLoginModalOpen(true);
  };

  // Close open modals
  const handleCloseAnyModal = useCallback(() => {
    if (contextMenu.isOpen) return setContextMenu(prev => ({ ...prev, isOpen: false }));
    if (arrivalModalTicket) return setArrivalModalTicket(null);
    if (orderModalTicket) return setOrderModalTicket(null);
    if (rollbackPrompt) return setRollbackPrompt(null);
    if (estimatePrintTicket) return setEstimatePrintTicket(null);
    if (postSaveEstimateTicket) return setPostSaveEstimateTicket(null);
    if (assignTicketTarget) return setAssignTicketTarget(null);
    if (isChangePasswordOpen) return setIsChangePasswordOpen(false);
    if (isUserManagementOpen) return setIsUserManagementOpen(false);
    if (isShortcutsHelpOpen) return setIsShortcutsHelpOpen(false);
    if (isNewTicketOpen) return setIsNewTicketOpen(false);
    if (isStockCatalogOpen) return setIsStockCatalogOpen(false);
    if (advanceState) return setAdvanceState(null);
    if (selectedTicket) return setSelectedTicket(null);
  }, [contextMenu.isOpen, arrivalModalTicket, orderModalTicket, rollbackPrompt, estimatePrintTicket, postSaveEstimateTicket, assignTicketTarget, isChangePasswordOpen, isUserManagementOpen, isShortcutsHelpOpen, isNewTicketOpen, isStockCatalogOpen, advanceState, selectedTicket]);

  // Keyboard shortcuts integration
  useKeyboardShortcuts({
    onNewTicket: () => setIsNewTicketOpen(true),
    onFocusSearch: () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    },
    onViewKanban: () => {
      setActiveHub('BOARD');
      setBoardViewMode('KANBAN');
    },
    onViewTable: () => {
      setActiveHub('BOARD');
      setBoardViewMode('TABLE');
    },
    onCloseModal: handleCloseAnyModal,
    onRefresh: loadTickets,
    onToggleHelp: () => setIsShortcutsHelpOpen(prev => !prev),
    onToggleSidebar: toggleSidebar,
    onSelectHub: setActiveHub,
  });

  // Handle Advance Button Click on Kanban Card
  const handleOpenAdvance = (ticket) => {
    const curStageId = ticket.current_stage_id || 1;
    const nextStageId = curStageId + 1;
    const nextStage = stages.find(s => s.id === nextStageId) || {
      id: nextStageId,
      name: `Stage ${nextStageId}`,
      slaLimitWD: 2
    };

    // If ticket is at Stage 2 and moving to Stage 3+, ensure at least 1 part is estimated
    if (curStageId === 2 && nextStageId > 2) {
      const partsCount = Number(ticket.total_parts_count || ticket.parts_count || (Array.isArray(ticket.parts) ? ticket.parts.length : 0)) || 0;
      if (partsCount === 0) {
        alert('Cannot advance stage: At least 1 product / part item is mandatory for an estimate. Please add parts in Stage 2 Estimation first.');
        setAdvanceState({ ticket, nextStage: stages.find(s => s.id === 2) || { id: 2, name: 'Estimate Preparation' } });
        return;
      }
    }

    setAdvanceState({ ticket, nextStage });
  };

  // Handle Drag and Drop card to target stage column
  const handleDropTicketToStage = (ticket, targetStage) => {
    const curStageId = ticket.current_stage_id || 1;
    if (targetStage.id < curStageId) {
      // Dropping to a previous stage -> prompt confirmation to remove downstream stage data
      setRollbackPrompt({ ticket, targetStage });
    } else if (targetStage.id > curStageId) {
      // If advancing past Stage 2, ensure ticket has at least 1 part item
      if (curStageId <= 2 && targetStage.id > 2) {
        const partsCount = Number(ticket.total_parts_count || ticket.parts_count || (Array.isArray(ticket.parts) ? ticket.parts.length : 0)) || 0;
        if (partsCount === 0) {
          alert('Cannot advance stage: At least 1 product / part item is mandatory for an estimate. Please add parts in Stage 2 Estimation first.');
          setAdvanceState({ ticket, nextStage: stages.find(s => s.id === 2) || { id: 2, name: 'Estimate Preparation' } });
          return;
        }
      }
      setAdvanceState({ ticket, nextStage: targetStage });
    }
  };

  const handleConfirmRollback = async (ticketId, targetStageId, reason) => {
    if (!isConnected) {
      alert('Cannot rollback stage while offline. Please restore connection first.');
      return;
    }
    setIsSubmittingRollback(true);
    try {
      await rollbackTicketStage(ticketId, {
        targetStageId,
        confirmed: true,
        confirmText: 'CONFIRM',
        reason: reason || 'Moved backward via drag & drop'
      });
      setRollbackPrompt(null);
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(null);
      }
      await loadTickets();
    } catch (err) {
      alert(`Rollback failed: ${err.message}`);
    } finally {
      setIsSubmittingRollback(false);
    }
  };

  const handleSubmitAdvance = async (payload) => {
    if (!isConnected) {
      alert('Cannot advance stage while offline. Please restore connection to ensure live server synchronization.');
      return;
    }
    if (!advanceState?.ticket?.id) return;
    setIsSubmittingAdvance(true);
    try {
      const targetTicket = advanceState.ticket;
      const isStage2 = (targetTicket.current_stage_id || 1) === 2 || advanceState.nextStage?.id === 2;
      await advanceTicketStage(targetTicket.id, payload);
      setAdvanceState(null);
      await loadTickets();
      if (selectedTicket?.id === targetTicket.id) {
        setSelectedTicket(null);
      }
      if (isStage2 && payload.parts && payload.parts.length > 0) {
        setPostSaveEstimateTicket({
          ...targetTicket,
          parts: payload.parts,
          estimated_cost: payload.estimatedCost
        });
      }
    } catch (err) {
      alert(`Advance failed: ${err.message}`);
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  const handleRollback = async (ticketId, targetStageId, reason) => {
    if (!isConnected) {
      alert('Cannot rollback stage while offline. Please restore connection first.');
      return;
    }
    try {
      await rollbackTicketStage(ticketId, {
        targetStageId,
        confirmed: true,
        confirmText: 'CONFIRM',
        reason
      });
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      alert(`Rollback failed: ${err.message}`);
    }
  };

  const handleCreateTicketSubmit = async (payload) => {
    if (!isConnected) {
      alert('Cannot create new ticket while offline. Please restore connection to ensure ticket numbers and data sync with server.');
      return;
    }
    setIsSubmittingNew(true);
    try {
      const created = await createTicket(payload);
      setIsNewTicketOpen(false);
      if (created?.id) {
        setTickets(prev => {
          if (prev.some(t => String(t.id) === String(created.id))) return prev;
          return [created, ...prev];
        });
      }
      await loadTickets();
    } catch (err) {
      alert(`Failed to create ticket: ${err.message}`);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    if (!isConnected) {
      alert('Cannot delete ticket while offline. Please restore connection first.');
      return;
    }
    // Optimistic instant UI removal
    setTickets(prev => prev.filter(t => String(t.id) !== String(ticketId)));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(null);
    }
    try {
      await deleteTicket(ticketId);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      loadTickets();
    }
  };

  // Right-Click Context Menu Handlers
  const handleContextMenu = useCallback((e, ticket) => {
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      ticket,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleMenuDetails = useCallback((ticket) => {
    setProfileModalTab('overview');
    setSelectedTicket(ticket);
  }, []);

  const handleMenuTimeline = useCallback((ticket) => {
    setProfileModalTab('timeline');
    setSelectedTicket(ticket);
  }, []);

  const handleMenuComment = useCallback((ticket) => {
    setProfileModalTab('comments');
    setSelectedTicket(ticket);
  }, []);

  const handleMenuAssign = useCallback((ticket) => {
    setAssignTicketTarget(ticket);
  }, []);

  const handleMenuPartsStatus = useCallback((ticket) => {
    setProfileModalTab('parts');
    setSelectedTicket(ticket);
  }, []);

  const handleEstimatePrint = useCallback((ticket) => {
    setEstimatePrintTicket(ticket);
  }, []);

  const handleEstimateXlsx = useCallback(async (ticket) => {
    try {
      await downloadEstimateXlsx(ticket);
    } catch (err) {
      alert(`Could not download estimate XLSX: ${err.message || err}`);
    }
  }, []);

  const handleMenuArrival = useCallback((ticket) => {
    setArrivalModalTicket(ticket);
  }, []);

  const handleMenuOrder = useCallback((ticket) => {
    setOrderModalTicket(ticket);
  }, []);

  const handleMenuDelete = useCallback(async (ticket) => {
    if (!ticket?.id) return;
    const identifier = ticket.ticket_number || ticket.vehicle_plate || `#${ticket.id}`;
    if (window.confirm(`Are you sure you want to permanently delete ticket ${identifier}? This action cannot be undone.`)) {
      await handleDeleteTicket(ticket.id);
    }
  }, [handleDeleteTicket]);

  const nextStageId = advanceState?.nextStage?.id;

  // Metric counts for board subheader
  const ticketCounts = useMemo(() => {
    const openCount = tickets.filter(t => (t.current_stage_id || 1) === 1).length;
    const inProgressCount = tickets.filter(t => (t.current_stage_id || 1) > 1 && (t.current_stage_id || 1) < 11).length;
    const closedCount = tickets.filter(t => (t.current_stage_id || 1) >= 11 || t.status === 'CLOSED').length;
    return { openCount, inProgressCount, closedCount, total: tickets.length };
  }, [tickets]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <NetworkErrorBanner onReconnectSync={loadTickets} />
      {/* Top Navigation with Hub Switcher & Suggestive Global Search */}
      <Navbar
        outlets={outlets}
        selectedOutletId={selectedOutletId}
        onSelectOutlet={setSelectedOutletId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeHub={activeHub}
        onSelectHub={setActiveHub}
        onOpenNewTicket={() => setIsNewTicketOpen(true)}
        onOpenStock={() => setIsStockCatalogOpen(true)}
        onRefresh={loadTickets}
        isRefreshing={isRefreshing}
        onOpenShortcutsHelp={() => setIsShortcutsHelpOpen(true)}
        searchInputRef={searchInputRef}
        tickets={tickets}
        onSelectSuggestedTicket={(ticket) => setSelectedTicket(ticket)}
        onSelectSuggestedCustomer={() => setActiveHub('CUSTOMERS')}
        onSelectSuggestedVehicle={() => setActiveHub('VEHICLES')}
        currentUser={currentUser}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onLogout={handleLogout}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      {/* Main App Layout: Sidebar + Active Module View */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%', position: 'relative' }}>
        {/* Left Side Navigation Bar */}
        <Sidebar
          activeHub={activeHub}
          onSelectHub={setActiveHub}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          onOpenStock={() => setIsStockCatalogOpen(true)}
          onOpenShortcutsHelp={() => setIsShortcutsHelpOpen(true)}
          ticketCounts={ticketCounts}
        />

        {/* Primary Content Viewport */}
        <main style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minWidth: 0, backgroundColor: 'var(--bg-main)' }}>
          {/* HUB 1: OPERATIONS BOARD (Kanban with Drag & Drop & Table) */}
          {activeHub === 'BOARD' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Controls & View Switcher Bar */}
              <div style={{
                height: '42px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                flexShrink: 0
              }}>
                {/* Left Metrics */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0284c7' }}></span>
                    <span style={{ fontWeight: 700 }}>Open: {ticketCounts.openCount}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d97706' }}></span>
                    <span style={{ fontWeight: 700 }}>In Progress: {ticketCounts.inProgressCount}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
                    <span style={{ fontWeight: 700 }}>Delivered: {ticketCounts.closedCount}</span>
                  </div>
                  <span style={{ color: 'var(--text-subtle)' }}>• Total Active: {ticketCounts.total}</span>
                </div>

                {/* Right View Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    className={`btn-toggle ${boardViewMode === 'KANBAN' ? 'active' : ''}`}
                    onClick={() => setBoardViewMode('KANBAN')}
                    title="Kanban View with Drag & Drop (Key 1)"
                    style={{ padding: '3px 10px', fontSize: '11.5px', gap: '4px' }}
                  >
                    <LayoutGrid size={13} />
                    <span>Kanban</span>
                    <kbd style={{ fontSize: '9px', opacity: 0.6 }}>1</kbd>
                  </button>
                  <button
                    className={`btn-toggle ${boardViewMode === 'TABLE' ? 'active' : ''}`}
                    onClick={() => setBoardViewMode('TABLE')}
                    title="Table View (Key 2)"
                    style={{ padding: '3px 10px', fontSize: '11.5px', gap: '4px' }}
                  >
                    <TableProperties size={13} />
                    <span>Table</span>
                    <kbd style={{ fontSize: '9px', opacity: 0.6 }}>2</kbd>
                  </button>
                </div>
              </div>

              {/* Active View Container */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {boardViewMode === 'KANBAN' && (
                  <KanbanBoard
                    stages={stages}
                    tickets={tickets}
                    isLoading={isRefreshing && tickets.length === 0}
                    onOpenTicketDetails={setSelectedTicket}
                    onAdvanceTicket={handleOpenAdvance}
                    onDropTicketToStage={handleDropTicketToStage}
                    onContextMenu={handleContextMenu}
                    onOpenPca={setPcaModalTicket}
                    onOpenOrder={setOrderModalTicket}
                  />
                )}
                {boardViewMode === 'TABLE' && (
                  <TableView
                    stages={stages}
                    tickets={tickets}
                    onOpenTicketDetails={setSelectedTicket}
                    onAdvanceTicket={handleOpenAdvance}
                    onContextMenu={handleContextMenu}
                    onOpenPca={setPcaModalTicket}
                    onOpenOrder={setOrderModalTicket}
                  />
                )}
              </div>
            </div>
          )}

          {/* HUB 2: CRM / CUSTOMERS */}
          {activeHub === 'CUSTOMERS' && (
            <CustomersHub onOpenTicket={setSelectedTicket} />
          )}

          {/* HUB 3: VEHICLES FLEET */}
          {activeHub === 'VEHICLES' && (
            <VehiclesHub onOpenTicket={setSelectedTicket} />
          )}

          {/* HUB 4: INVENTORY & PARTS ORDERS */}
          {activeHub === 'INVENTORY' && (
            <InventoryHub onOpenTicket={setSelectedTicket} />
          )}

          {/* HUB 5: INSURANCE & SURVEYORS */}
          {activeHub === 'INSURANCE' && (
            <InsuranceHub onOpenTicket={setSelectedTicket} />
          )}
        </main>
      </div>

      {/* Ticket Profile Drawer */}
      {selectedTicket && (
        <TicketProfileModal
          ticket={selectedTicket}
          currentStage={stages.find(s => s.id === selectedTicket.current_stage_id)}
          initialTab={profileModalTab}
          onClose={() => {
            setSelectedTicket(null);
            setProfileModalTab('overview');
          }}
          onRollback={handleRollback}
          onDeleteTicket={handleDeleteTicket}
          onOpenStage2={(t) => {
            setAdvanceState({
              ticket: t,
              nextStage: stages.find(s => s.id === 2) || { id: 2, name: 'Estimate Preparation', slaLimitWD: 2 }
            });
          }}
          onOpenStage6={(t) => {
            setAdvanceState({
              ticket: t,
              nextStage: stages.find(s => s.id === 6) || { id: 6, name: 'Parts Order', slaLimitWD: 10 }
            });
          }}
          onEstimatePrint={handleEstimatePrint}
          onEstimateXlsx={handleEstimateXlsx}
          onOpenPca={setPcaModalTicket}
        />
      )}

      {/* New Job Ticket Modal with Suggestive Dropdowns */}
      {isNewTicketOpen && (
        <NewTicketModal
          outlets={outlets}
          selectedOutletId={selectedOutletId}
          onClose={() => setIsNewTicketOpen(false)}
          onSubmit={handleCreateTicketSubmit}
          isSubmitting={isSubmittingNew}
        />
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {isShortcutsHelpOpen && (
        <ShortcutsHelpModal onClose={() => setIsShortcutsHelpOpen(false)} />
      )}

      {/* Stage 2: Estimation Modal */}
      {advanceState && nextStageId === 2 && (
        <Stage2EstimationModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
          onOpenPrintView={handleEstimatePrint}
        />
      )}

      {/* Stage 5: Parts Approval & PCA Modal */}
      {advanceState && nextStageId === 5 && (
        <Stage5ApprovalModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Stage 6: Parts Order Modal */}
      {advanceState && nextStageId === 6 && (
        <Stage6PartsOrderModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Standalone Parts Order Modal (From More > Order Context Menu Shortcut) */}
      {orderModalTicket && (
        <Stage6PartsOrderModal
          ticket={orderModalTicket}
          isStandalone={true}
          onClose={() => setOrderModalTicket(null)}
          onSaved={async () => {
            setOrderModalTicket(null);
            await loadTickets();
          }}
        />
      )}

      {/* Stage 7: Parts Arrival Modal (Advancing to Stage 7) */}
      {advanceState && nextStageId === 7 && (
        <Stage7PartsArrivalModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Standalone Parts Arrival Modal (From More > Arrival Context Menu Shortcut) */}
      {arrivalModalTicket && (
        <Stage7PartsArrivalModal
          ticket={arrivalModalTicket}
          isStandalone={true}
          onClose={() => setArrivalModalTicket(null)}
          onSaveArrival={async () => {
            setArrivalModalTicket(null);
            await loadTickets();
          }}
        />
      )}

      {/* Stage 8: Work Start Modal */}
      {advanceState && nextStageId === 8 && (
        <Stage8WorkStartModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Stage 9: Work Complete Modal */}
      {advanceState && nextStageId === 9 && (
        <Stage9WorkCompleteModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Stage 10: Invoicing Modal */}
      {advanceState && nextStageId === 10 && (
        <Stage10InvoiceModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Stage 11: Delivery & Release Modal */}
      {advanceState && nextStageId === 11 && (
        <Stage11DeliveryModal
          ticket={advanceState.ticket}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Stage 4: Survey Modal */}
      {advanceState && nextStageId === 4 && (
        <Stage4SurveyModal
          ticket={advanceState.ticket}
          nextStage={advanceState.nextStage}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Generic Advance Modal for Stages 3, etc. */}
      {advanceState && ![2, 4, 5, 6, 7, 8, 9, 10, 11].includes(nextStageId) && (
        <GenericAdvanceModal
          ticket={advanceState.ticket}
          nextStage={advanceState.nextStage}
          onClose={() => setAdvanceState(null)}
          onSubmit={handleSubmitAdvance}
          isSubmitting={isSubmittingAdvance}
        />
      )}

      {/* Pending Customer Approval (PCA) Resolution Modal */}
      {pcaModalTicket && (
        <PcaResolutionModal
          ticket={pcaModalTicket}
          onClose={() => setPcaModalTicket(null)}
          onTicketUpdated={(updatedTicket) => {
            setTickets((prev) =>
              prev.map((t) => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t))
            );
            if (selectedTicket && selectedTicket.id === updatedTicket.id) {
              setSelectedTicket((prev) => ({ ...prev, ...updatedTicket }));
            }
          }}
        />
      )}

      {/* Stage Rollback Confirmation Modal */}
      {rollbackPrompt && (
        <RollbackConfirmModal
          ticket={rollbackPrompt.ticket}
          targetStage={rollbackPrompt.targetStage}
          stages={stages}
          onClose={() => setRollbackPrompt(null)}
          onConfirm={handleConfirmRollback}
          isSubmitting={isSubmittingRollback}
        />
      )}

      {/* Physical Stock Catalog Modal */}
      {isStockCatalogOpen && (
        <StockCatalogModal
          onClose={() => setIsStockCatalogOpen(false)}
        />
      )}

      {/* Authentication & Login Modal */}
      {(!currentUser && !isCheckingAuth) || isLoginModalOpen ? (
        <LoginModal onSuccess={handleLoginSuccess} />
      ) : null}

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <ChangePasswordModal
          onClose={() => setIsChangePasswordOpen(false)}
          onSuccess={() => {
            setIsChangePasswordOpen(false);
            handleLogout();
          }}
        />
      )}

      {/* Admin User Management & Permissions Modal */}
      {isUserManagementOpen && currentUser?.role === 'admin' && (
        <UserManagementModal
          stages={stages}
          onClose={() => setIsUserManagementOpen(false)}
        />
      )}

      {/* Right-Click Quick Menu for Kanban Cards and Table Rows */}
      {contextMenu.isOpen && contextMenu.ticket && (
        <TicketContextMenu
          ticket={contextMenu.ticket}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onDetails={handleMenuDetails}
          onTimeline={handleMenuTimeline}
          onComment={handleMenuComment}
          onAssign={handleMenuAssign}
          onEstimatePrint={handleEstimatePrint}
          onEstimateXlsx={handleEstimateXlsx}
          onPartsStatus={handleMenuPartsStatus}
          onOrder={handleMenuOrder}
          onArrival={handleMenuArrival}
          onDelete={handleMenuDelete}
        />
      )}

      {/* Quick Ticket Assignment Modal */}
      {assignTicketTarget && (
        <AssignTicketModal
          ticket={assignTicketTarget}
          onClose={() => setAssignTicketTarget(null)}
          onAssigned={(updatedTicket) => {
            setTickets(prev => prev.map(t => t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t));
            if (selectedTicket && selectedTicket.id === updatedTicket.id) {
              setSelectedTicket(prev => ({ ...prev, ...updatedTicket }));
            }
          }}
        />
      )}

      {/* Notifications & Mentions Center Modal */}
      {isNotificationsOpen && (
        <NotificationsModal
          currentUser={currentUser}
          onClose={() => setIsNotificationsOpen(false)}
          onNotificationCountChange={setUnreadNotificationsCount}
          onOpenTicket={(ticketId, targetTab = 'overview') => {
            setIsNotificationsOpen(false);
            const found = tickets.find(t => String(t.id) === String(ticketId));
            if (found) {
              setSelectedTicket(found);
              setProfileModalTab(targetTab);
            } else {
              fetchTicket(ticketId).then(tkt => {
                if (tkt) {
                  setSelectedTicket(tkt);
                  setProfileModalTab(targetTab);
                }
              }).catch(() => {});
            }
          }}
        />
      )}

      {/* Estimate Print Document Modal */}
      {estimatePrintTicket && (
        <EstimatePrintModal
          ticket={estimatePrintTicket}
          onClose={() => setEstimatePrintTicket(null)}
        />
      )}

      {/* Post-Save Estimate Action Banner */}
      {postSaveEstimateTicket && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '12px 18px',
          borderRadius: '10px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          animation: 'modalIn 0.2s ease',
          border: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', color: '#34d399' }}>
              <CheckCircle2 size={16} />
              <span>Estimate Saved Successfully!</span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              {postSaveEstimateTicket.ticket_number || `#${postSaveEstimateTicket.id}`} • {postSaveEstimateTicket.vehicle_plate || postSaveEstimateTicket.vehicle_no || 'Vehicle'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleEstimateXlsx(postSaveEstimateTicket)}
              style={{ backgroundColor: '#059669', color: '#ffffff', border: 'none', gap: '5px', fontSize: '12px' }}
            >
              <FileSpreadsheet size={13} />
              <span>Download XLSX</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => handleEstimatePrint(postSaveEstimateTicket)}
              style={{ color: '#ffffff', borderColor: '#475569', gap: '5px', fontSize: '12px' }}
            >
              <Printer size={13} />
              <span>Print</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setPostSaveEstimateTicket(null)}
              style={{ color: '#94a3b8', padding: '4px' }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Real-time Notification Toast Banner */}
      {toastNotification && (
        <div
          onClick={() => {
            if (toastNotification.ticketId) {
              const found = tickets.find(t => String(t.id) === String(toastNotification.ticketId));
              const targetTab = toastNotification.type === 'ASSIGNMENT' ? 'overview' : 'comments';
              if (found) {
                setSelectedTicket(found);
                setProfileModalTab(targetTab);
              } else {
                fetchTicket(toastNotification.ticketId).then(tkt => {
                  if (tkt) {
                    setSelectedTicket(tkt);
                    setProfileModalTab(targetTab);
                  }
                }).catch(() => {});
              }
              setToastNotification(null);
            }
          }}
          style={{
            position: 'fixed',
            top: '64px',
            right: '20px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            maxWidth: '380px',
            cursor: 'pointer',
            animation: 'modalIn 0.2s ease-out'
          }}
          title="Click to view ticket"
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--honda-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Bell size={14} color="#ffffff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
              {toastNotification.message}
            </div>
            {toastNotification.snippet && (
              <div style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                "{toastNotification.snippet}"
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setToastNotification(null);
            }}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
