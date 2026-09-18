// ====================================================
// HONDA SERVICE TICKETING & KANBAN - CLIENT APPLICATION
// ====================================================

const state = {
  tickets: [],
  outlets: [],
  stages: [],
  selectedOutlet: 'ALL',
  selectedOutlets: [],
  selectedSla: 'ALL',
  selectedSlas: [],
  selectedStage: 'ALL',
  selectedStages: [],
  customerBranchFilters: [],
  tablePage: 1,
  tablePageSize: '25',
  tableDateField: 'arrival_date',
  tableDatePreset: 'ALL',
  tableDateStart: '',
  tableDateEnd: '',
  eodScope: 'today',
  searchQuery: '',
  sortBy: 'sla_desc', // Default sort by SLA in descending order
  activeView: 'kanban',
  mainView: 'board',
  closedLimit: '20',
  pipelineLimit13: '20',
  pipelineLimit12: '20',
  currentEditingTicket: null,
  customers: [],
  selectedCustomerId: null,
  customerFilter: 'all',
  insurers: [],
  selectedInsurerId: null,
  surveyors: [],
  selectedSurveyorId: null,
  surveyorFilter: 'all',
  surveyorSearchQuery: '',
  surveyorTicketsPage: 1,
  surveyorTicketsPageSize: '10',
  holidays: [],
  surveyorsPage: 1,
  surveyorsPageSize: '10',
  holidaysPage: 1,
  holidaysPageSize: '10',
  slaConfigPage: 1,
  slaConfigPageSize: 'ALL',
  vehicles: [],
  selectedVehicleId: null,
  vehicleFilter: 'all',
  parts: [],
  selectedPartId: null,
  partsFilter: 'all',
  partsTablePage: 1,
  partsTablePageSize: '25',
  partsOrders: [],
  partsOrdersFilter: 'all',
  currentUser: null,
  notifications: [],
  unreadNotificationsCount: 0,
  activeAlertTab: 'mentions',
  ticketComments: [],
  mentionUsers: []
};

// ====================================================
// UNIVERSAL ASYNC CONFIRMATION MODAL
// ====================================================
function showConfirmDialog({
  title = 'Confirm Deletion',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDanger = true
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmDialog');
    const titleEl = document.getElementById('confirmDialogTitle');
    const msgEl = document.getElementById('confirmDialogMessage');
    const btnAccept = document.getElementById('btnAcceptConfirmDialog');
    const btnCancel = document.getElementById('btnCancelConfirmDialog');
    const iconWrap = document.getElementById('confirmModalIconWrap');

    if (!modal || !btnAccept || !btnCancel) {
      return resolve(window.confirm(message));
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    btnAccept.textContent = confirmText;
    btnCancel.textContent = cancelText;

    if (isDanger) {
      btnAccept.className = 'btn btn-danger btn-compact';
      if (iconWrap) {
        iconWrap.style.backgroundColor = '#fee2e2';
        iconWrap.style.color = '#dc2626';
        iconWrap.style.boxShadow = '0 0 0 6px #fef2f2';
      }
    } else {
      btnAccept.className = 'btn btn-primary btn-compact';
      if (iconWrap) {
        iconWrap.style.backgroundColor = '#e0f2fe';
        iconWrap.style.color = '#0284c7';
        iconWrap.style.boxShadow = '0 0 0 6px #f0f9ff';
      }
    }

    modal.style.display = 'flex';

    let resolved = false;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      modal.style.display = 'none';
      btnAccept.removeEventListener('click', onAccept);
      btnCancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    };

    const onAccept = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onBackdrop = (e) => {
      if (e.target === modal) onCancel();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onAccept();
      }
    };

    btnAccept.addEventListener('click', onAccept);
    btnCancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    btnCancel.focus();
  });
}

// ====================================================
// AUTHENTICATION & ACCESS CONTROL HELPERS
// ====================================================
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  let [resource, config] = args;
  config = config || {};
  config.headers = config.headers || {};

  const token = localStorage.getItem('honda_auth_token');
  if (token) {
    if (config.headers instanceof Headers) {
      if (!config.headers.has('Authorization')) {
        config.headers.set('Authorization', 'Bearer ' + token);
      }
    } else if (Array.isArray(config.headers)) {
      config.headers.push(['Authorization', 'Bearer ' + token]);
    } else {
      if (!config.headers['Authorization']) {
        config.headers['Authorization'] = 'Bearer ' + token;
      }
    }
  }

  const response = await originalFetch(resource, config);
  if (response.status === 401) {
    const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
    if (!urlStr.includes('/api/auth/login')) {
      handleAuthRequired();
    }
  }
  return response;
};

function handleAuthRequired() {
  localStorage.removeItem('honda_auth_token');
  state.currentUser = null;
  updateUserProfileUI();
  showLoginOverlay();
}

function isAdmin() {
  return state.currentUser && state.currentUser.role === 'admin';
}

function canReadStage(stageId) {
  if (isAdmin()) return true;
  if (!state.currentUser) return false;
  const num = parseInt(stageId, 10);
  const p = (state.currentUser.permissions || []).find(item => item.stage_id === num);
  return p ? p.can_read === 1 : false;
}

function canWriteStage(stageId) {
  if (isAdmin()) return true;
  if (!state.currentUser) return false;
  const num = parseInt(stageId, 10);
  const p = (state.currentUser.permissions || []).find(item => item.stage_id === num);
  return p ? p.can_write === 1 : false;
}

function canDeleteStage(stageId) {
  if (isAdmin()) return true;
  if (!state.currentUser) return false;
  const num = parseInt(stageId, 10);
  const p = (state.currentUser.permissions || []).find(item => item.stage_id === num);
  return p ? p.can_delete === 1 : false;
}

// Clipboard Helper
window.copyToClipboard = function (text, e) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }
  if (!text) return;
  const clean = String(text).trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(clean).then(() => {
      showToast(`✓ Copied: ${clean}`, 'success');
    }).catch(() => {
      fallbackCopyText(clean);
    });
  } else {
    fallbackCopyText(clean);
  }
};

function fallbackCopyText(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`✓ Copied: ${text}`, 'success');
  } catch (err) {
    showToast(`Phone: ${text}`, 'info');
  }
}

function renderPhoneCopyBtn(phone) {
  if (!phone) return '';
  const cleanPhone = String(phone).trim();
  return `<button type="button" class="btn-copy-phone" onclick="copyToClipboard('${escapeHtml(cleanPhone)}', event)" title="Copy phone number">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
  </button>`;
}

// ====================================================
// ====================================================
// INITIALIZATION
// ====================================================
let isAppInitialized = false;

async function initAuthenticatedApp() {
  if (isAppInitialized) {
    await Promise.all([loadOutlets(), loadStages()]);
    await refreshTickets();
    loadDirectoryCounts();
    return;
  }
  isAppInitialized = true;
  initSidebar();
  initFilterDropdowns();
  await Promise.all([loadOutlets(), loadStages()]);
  await refreshTickets();
  setupEventListeners();
  setupKeyboardShortcuts();
  loadDirectoryCounts();
  setupAuthUI();
  await loadMentionUsers();
  await refreshAlertsBadge();
  await initSupabaseRealtime();
  if (!window._alertsBadgeInterval) {
    window._alertsBadgeInterval = setInterval(refreshAlertsBadge, 30000);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupMousePointerAnimations();
  setupLoginUI();

  // Auth Gate: Check if user has a valid session
  const authOk = await checkAuthOnLoad();
  if (!authOk) {
    showLoginOverlay();
    return;
  }

  hideLoginOverlay();
  await initAuthenticatedApp();
});

async function loadOutlets() {
  try {
    const res = await fetch('/api/outlets');
    state.outlets = await res.json();
    populateOutletDropdowns();
  } catch (err) {
    showToast('Failed to load outlets: ' + err.message, 'error');
  }
}

async function loadStages() {
  try {
    const res = await fetch('/api/stages');
    state.stages = await res.json();
    populateStageDropdowns();
  } catch (err) {
    console.error('Failed to load stages:', err);
  }
}

function populateStageDropdowns() {
  const stageOptions = (state.stages || []).map(s => ({
    id: s.id,
    label: `Stage ${s.id}: ${s.name}`,
    badge: `S${s.id}`
  }));

  if (window.msStageFilter) {
    window.msStageFilter.setOptions(stageOptions);
  }

  const topStageSelect = document.getElementById('stageFilter');

  const options = ['<option value="ALL">All Stages (1–13)</option>'];
  (state.stages || []).forEach(s => {
    options.push(`<option value="${s.id}">Stage ${s.id}: ${escapeHtml(s.name)}</option>`);
  });

  const fullHtml = options.join('');
  if (topStageSelect) {
    topStageSelect.innerHTML = fullHtml;
    topStageSelect.value = state.selectedStage || 'ALL';
  }
}

function populateOutletDropdowns() {
  const outletOptions = (state.outlets || []).map(o => ({
    id: o.id,
    label: o.name + (o.code ? ` (${o.code})` : '')
  }));

  if (window.msOutletFilter) {
    window.msOutletFilter.setOptions(outletOptions);
  }
  if (window.msCustBranchFilter) {
    window.msCustBranchFilter.setOptions(outletOptions);
  }

  const filterSelect = document.getElementById('outletFilter');
  const modalSelect = document.getElementById('newOutletId');

  if (filterSelect) filterSelect.innerHTML = '<option value="ALL">All Branches</option>';
  if (modalSelect) modalSelect.innerHTML = '<option value="">-- Select Service Branch --</option>';

  const custBranchFilter = document.getElementById('custBranchFilter');
  if (custBranchFilter) custBranchFilter.innerHTML = '<option value="">All Branches</option>';

  const regCustBranch = document.getElementById('regCustBranch');
  if (regCustBranch) regCustBranch.innerHTML = '<option value="">-- Select Branch (Optional) --</option>';

  const editCustBranch = document.getElementById('editCustBranch');
  if (editCustBranch) editCustBranch.innerHTML = '<option value="">-- No Branch Tagged --</option>';

  const regBranchesContainer = document.getElementById('regCustBranchesContainer');
  if (regBranchesContainer) regBranchesContainer.innerHTML = '';

  const editBranchesContainer = document.getElementById('editCustBranchesContainer');
  if (editBranchesContainer) editBranchesContainer.innerHTML = '';

  (state.outlets || []).forEach(o => {
    if (filterSelect) filterSelect.innerHTML += `<option value="${o.id}">${o.name} (${o.code})</option>`;
    if (modalSelect) modalSelect.innerHTML += `<option value="${o.id}">${o.name} - ${o.location}</option>`;
    if (custBranchFilter) custBranchFilter.innerHTML += `<option value="${o.id}">${o.name}</option>`;
    if (regCustBranch) regCustBranch.innerHTML += `<option value="${o.id}">${o.name}</option>`;
    if (editCustBranch) editCustBranch.innerHTML += `<option value="${o.id}">${o.name}</option>`;

    const mapPinSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-1px;margin-right:3px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

    if (regBranchesContainer) {
      const pill = document.createElement('label');
      pill.className = 'branch-pill-checkbox';
      pill.innerHTML = `<input type="checkbox" value="${o.id}"> <span>${mapPinSvg}${escapeHtml(o.name)}</span>`;
      pill.querySelector('input').addEventListener('change', (e) => {
        pill.classList.toggle('active', e.target.checked);
      });
      regBranchesContainer.appendChild(pill);
    }

    if (editBranchesContainer) {
      const pill = document.createElement('label');
      pill.className = 'branch-pill-checkbox';
      pill.innerHTML = `<input type="checkbox" value="${o.id}"> <span>${mapPinSvg}${escapeHtml(o.name)}</span>`;
      pill.querySelector('input').addEventListener('change', (e) => {
        pill.classList.toggle('active', e.target.checked);
      });
      editBranchesContainer.appendChild(pill);
    }
  });
}

// ====================================================
// DATA FETCHING, SORTING & WAITING FEEDBACK
// ====================================================
function showGlobalLoader() {
  const loader = document.getElementById('topGlobalLoader');
  if (loader) loader.classList.add('is-loading');
  const board = document.getElementById('boardContainer');
  if (board) board.classList.add('is-refreshing');
}

function hideGlobalLoader() {
  const loader = document.getElementById('topGlobalLoader');
  if (loader) loader.classList.remove('is-loading');
  const board = document.getElementById('boardContainer');
  if (board) board.classList.remove('is-refreshing');
}

async function refreshTickets(quiet = false) {
  if (!quiet) showGlobalLoader();
  try {
    const outletParam = (state.selectedOutlets && state.selectedOutlets.length > 0)
      ? state.selectedOutlets.join(',')
      : (state.selectedOutlet || 'ALL');
    const slaParam = (state.selectedSlas && state.selectedSlas.length > 0)
      ? state.selectedSlas.join(',')
      : (state.selectedSla || 'ALL');
    const stageParam = (state.selectedStages && state.selectedStages.length > 0)
      ? state.selectedStages.join(',')
      : (state.selectedStage || 'ALL');

    let url = `/api/tickets?outletId=${encodeURIComponent(outletParam)}&slaStatus=${encodeURIComponent(slaParam)}&sortBy=${state.sortBy || 'sla_desc'}`;
    if (stageParam && stageParam !== 'ALL') {
      url += `&stageId=${encodeURIComponent(stageParam)}`;
    }
    if (state.tableDateStart || state.tableDateEnd) {
      url += `&dateField=${encodeURIComponent(state.tableDateField || 'arrival_date')}`;
      if (state.tableDateStart) url += `&startDate=${encodeURIComponent(state.tableDateStart)}`;
      if (state.tableDateEnd) url += `&endDate=${encodeURIComponent(state.tableDateEnd)}`;
    }
    if (state.searchQuery && state.searchQuery.trim()) {
      url += `&search=${encodeURIComponent(state.searchQuery.trim())}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned ${res.status}`);
    }
    const data = await res.json();
    state.tickets = Array.isArray(data) ? data : [];

    // Guarantee sort order on frontend
    if (state.tableSortKey && state.activeView === 'table') {
      sortTableTickets(state.tickets, state.tableSortKey, state.tableSortDir || 'asc');
    } else {
      sortTicketsList(state.tickets, state.sortBy || 'sla_desc');
    }

    renderCurrentView();
    updateMetrics();
    refreshAlertsBadge();
  } catch (err) {
    if (!quiet) showToast('Failed to fetch tickets: ' + err.message, 'error');
  } finally {
    if (!quiet) hideGlobalLoader();
  }
}

function sortTicketsList(tickets, sortBy = 'sla_desc') {
  if (!Array.isArray(tickets)) return [];
  if (sortBy === 'sla_desc') {
    tickets.sort((a, b) => {
      const slaA = Number(a.slaElapsedWD) || 0;
      const slaB = Number(b.slaElapsedWD) || 0;
      if (slaB !== slaA) return slaB - slaA; // Highest SLA elapsed days first
      if (b.isBreached !== a.isBreached) return b.isBreached ? 1 : -1;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  } else if (sortBy === 'sla_asc') {
    tickets.sort((a, b) => {
      const slaA = Number(a.slaElapsedWD) || 0;
      const slaB = Number(b.slaElapsedWD) || 0;
      if (slaA !== slaB) return slaA - slaB;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  } else if (sortBy === 'id_desc' || sortBy === 'newest') {
    tickets.sort((a, b) => {
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      if (timeB && timeA && timeB !== timeA) return timeB - timeA;

      const arrB = b.arrival_date ? new Date(b.arrival_date).getTime() : 0;
      const arrA = a.arrival_date ? new Date(a.arrival_date).getTime() : 0;
      if (arrB && arrA && arrB !== arrA) return arrB - arrA;

      const numB = parseInt(String(b.ticket_number || '').replace(/\D/g, ''), 10) || 0;
      const numA = parseInt(String(a.ticket_number || '').replace(/\D/g, ''), 10) || 0;
      if (numB !== numA) return numB - numA;

      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  } else if (sortBy === 'id_asc' || sortBy === 'oldest') {
    tickets.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;

      const arrA = a.arrival_date ? new Date(a.arrival_date).getTime() : 0;
      const arrB = b.arrival_date ? new Date(b.arrival_date).getTime() : 0;
      if (arrA && arrB && arrA !== arrB) return arrA - arrB;

      const numA = parseInt(String(a.ticket_number || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.ticket_number || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;

      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
  } else if (sortBy === 'customer_asc') {
    tickets.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''));
  } else if (sortBy === 'customer_desc') {
    tickets.sort((a, b) => (b.customer_name || '').localeCompare(a.customer_name || ''));
  } else if (sortBy === 'model_asc') {
    tickets.sort((a, b) => (a.model || a.vehicle_name || '').localeCompare(b.model || b.vehicle_name || ''));
  } else if (sortBy === 'stage_asc') {
    tickets.sort((a, b) => (Number(a.current_stage_id) || 0) - (Number(b.current_stage_id) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0));
  } else if (sortBy === 'stage_desc') {
    tickets.sort((a, b) => (Number(b.current_stage_id) || 0) - (Number(a.current_stage_id) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0));
  } else {
    tickets.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }
  return tickets;
}

function sortTableTickets(tickets, key, dir = 'asc') {
  if (!Array.isArray(tickets) || !key) return;
  const mul = (dir === 'desc') ? -1 : 1;

  tickets.sort((a, b) => {
    let valA, valB;
    switch (key) {
      case 'ticket_number':
        valA = a.ticket_number || '';
        valB = b.ticket_number || '';
        return valA.localeCompare(valB) * mul;
      case 'branch_name':
        valA = a.branch_name || a.outlet_name || '';
        valB = b.branch_name || b.outlet_name || '';
        return valA.localeCompare(valB) * mul;
      case 'customer_name':
        valA = a.customer_name || '';
        valB = b.customer_name || '';
        return valA.localeCompare(valB) * mul;
      case 'model':
        valA = a.model || a.vehicle_name || '';
        valB = b.model || b.vehicle_name || '';
        return valA.localeCompare(valB) * mul;
      case 'stage':
        valA = Number(a.current_stage_id) || 0;
        valB = Number(b.current_stage_id) || 0;
        return (valA - valB) * mul;
      case 'status':
        valA = a.kanbanColumn || a.status || '';
        valB = b.kanbanColumn || b.status || '';
        return valA.localeCompare(valB) * mul;
      case 'entered_date':
        valA = new Date(a.current_stage_entered_at || 0).getTime();
        valB = new Date(b.current_stage_entered_at || 0).getTime();
        return (valA - valB) * mul;
      case 'aging':
        valA = Number(a.stageElapsedWD) || 0;
        valB = Number(b.stageElapsedWD) || 0;
        return (valA - valB) * mul;
      case 'sla_status':
        valA = Number(a.slaElapsedWD) || 0;
        valB = Number(b.slaElapsedWD) || 0;
        return (valA - valB) * mul;
      default:
        return (b.id - a.id) * mul;
    }
  });
}

async function updateMetrics() {
  try {
    const outletParam = (state.selectedOutlets && state.selectedOutlets.length > 0)
      ? state.selectedOutlets.join(',')
      : (state.selectedOutlet || 'ALL');
    const res = await fetch(`/api/metrics?outletId=${encodeURIComponent(outletParam)}`);
    const m = await res.json();

    document.getElementById('metricActive').textContent = m.totalActive;
    document.getElementById('metricBreached').textContent = m.breachedCount;
    document.getElementById('metricDueSoon').textContent = m.dueSoonCount;
    document.getElementById('metricWithin').textContent = m.withinSlaCount;
    document.getElementById('metricClosed').textContent = m.closedCount;
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

// Helper to calculate and format average turnover days (avg 0d)
function formatAvgTd(tickets, field = 'stageElapsedWD') {
  if (!tickets || tickets.length === 0) return 'avg 0d';
  const sum = tickets.reduce((acc, t) => acc + (Number(t[field]) || 0), 0);
  const avg = sum / tickets.length;
  const formatted = (avg % 1 === 0) ? avg.toFixed(0) : avg.toFixed(1);
  return `avg ${formatted}d`;
}

// ====================================================
// VIEW RENDERING
// ====================================================
function renderCurrentView() {
  if (state.activeView === 'kanban') {
    renderKanbanBoard();
  } else if (state.activeView === 'pipeline') {
    renderPipelineBoard();
  } else if (state.activeView === 'table') {
    renderTableView();
  }
}

function renderTicketPartsBadges(t) {
  if (!t) return '';
  const total = Number(t.total_parts_count) || 0;
  if (total === 0) return '';

  const stageId = Number(t.current_stage_id) || 1;
  // PCA, CA and Workshop Exemption tags only show after approval stage (Stage > 5)
  const isAfterApproval = stageId > 5;
  const pca = isAfterApproval ? (Number(t.pca_count) || 0) : 0;
  const ca = isAfterApproval ? (Number(t.ca_count) || 0) : 0;
  const pod = stageId >= 6 ? (Number(t.pod_count) || 0) : 0;
  const isExempt = isAfterApproval && Number(t.customer_approval_exempt) === 1;

  if (pca === 0 && ca === 0 && pod === 0 && !isExempt) return '';

  let html = `<div class="parts-approval-badges-wrap" onclick="event.stopPropagation();">`;

  if (pca > 0) {
    html += `<span class="tag-part-lifecycle tag-pca" onclick="openPartsApprovalModal(${t.id})" title="Pending Customer Approval: ${pca}/${total} parts. Click to review or approve.">PCA (${pca}/${total})</span>`;
  }
  if (ca > 0) {
    html += `<span class="tag-part-lifecycle tag-ca" onclick="openPartsApprovalModal(${t.id})" title="Customer Approved: ${ca}/${total} parts. Click to view.">CA (${ca}/${total})</span>`;
  }
  if (pod > 0) {
    html += `<span class="tag-part-lifecycle tag-pod" onclick="openPartsApprovalModal(${t.id})" title="Awaiting Delivery (POD): ${pod}/${total} parts. Click to view.">POD (${pod}/${total})</span>`;
  }
  if (isExempt && pca > 0) {
    html += `<span class="tag-part-lifecycle tag-exempt" onclick="openPartsApprovalModal(${t.id})" title="Workshop Exemption active: Work and ordering proceed without customer pre-approval.">EXEMPT</span>`;
  }

  html += `</div>`;
  return html;
}

// 3-Column Kanban Board
function renderKanbanBoard() {
  if (!Array.isArray(state.tickets)) state.tickets = [];
  const openCol = document.getElementById('cardsOpen');
  const inProgCol = document.getElementById('cardsInProgress');
  const closedCol = document.getElementById('cardsClosed');

  openCol.innerHTML = '';
  inProgCol.innerHTML = '';
  closedCol.innerHTML = '';

  const getCol = (t) => {
    if (t.kanbanColumn) return t.kanbanColumn;
    const sId = Number(t.current_stage_id) || 1;
    if (sId === 1) return 'OPEN';
    if (sId === 13) return 'CLOSED';
    return 'IN_PROGRESS';
  };

  const openTickets = state.tickets.filter(t => getCol(t) === 'OPEN');
  const inProgTickets = state.tickets.filter(t => getCol(t) === 'IN_PROGRESS');
  const allClosedTickets = state.tickets.filter(t => getCol(t) === 'CLOSED');

  // Closed limit slicing
  let closedTickets = allClosedTickets;
  if (state.closedLimit !== 'ALL') {
    const limit = parseInt(state.closedLimit, 10) || 20;
    closedTickets = allClosedTickets.slice(0, limit);
  }

  document.getElementById('countOpen').textContent = openTickets.length;
  document.getElementById('countInProgress').textContent = inProgTickets.length;
  document.getElementById('countClosed').textContent = allClosedTickets.length > closedTickets.length
    ? `${closedTickets.length}/${allClosedTickets.length}`
    : allClosedTickets.length;

  // Average Turn Over Days (avg n d) for Kanban column headers
  const avgOpenEl = document.getElementById('avgTdOpen');
  if (avgOpenEl) avgOpenEl.textContent = formatAvgTd(openTickets, 'stageElapsedWD');

  const avgInProgEl = document.getElementById('avgTdInProgress');
  if (avgInProgEl) avgInProgEl.textContent = formatAvgTd(inProgTickets, 'slaElapsedWD');

  const avgClosedEl = document.getElementById('avgTdClosed');
  if (avgClosedEl) avgClosedEl.textContent = formatAvgTd(allClosedTickets, 'slaElapsedWD');

  if (openTickets.length === 0) {
    openCol.innerHTML = `<div class="empty-state" style="padding:14px;color:#94a3b8;font-size:12px;text-align:center;">No open tickets.</div>`;
  } else {
    openTickets.forEach(t => openCol.appendChild(createTicketCard(t, false)));
  }

  if (inProgTickets.length === 0) {
    inProgCol.innerHTML = `<div class="empty-state" style="padding:14px;color:#94a3b8;font-size:12px;text-align:center;">No in-progress tickets.</div>`;
  } else {
    inProgTickets.forEach(t => inProgCol.appendChild(createTicketCard(t, false)));
  }

  if (closedTickets.length === 0) {
    closedCol.innerHTML = `<div class="empty-state" style="padding:14px;color:#94a3b8;font-size:12px;text-align:center;">No closed tickets.</div>`;
  } else {
    closedTickets.forEach(t => closedCol.appendChild(createTicketCard(t, false)));
  }
}

function createTicketCard(t, isPipeline = false) {
  const card = document.createElement('div');
  const isJustAdvanced = state.lastAdvancedTicketId && state.lastAdvancedTicketId === t.id;
  card.className = `ticket-card ${getSlaCardClass(t)} ${isPipeline ? 'card-pipeline' : ''} ${isJustAdvanced ? 'ticket-card-just-advanced' : ''}`;
  card.dataset.id = t.id;

  const slaPillClass = getSlaPillClass(t);
  const slaText = getSlaText(t);

  const canAdvance = t.status !== 'CLOSED' && canWriteStage(t.current_stage_id);
  const canBypass = t.status === 'IN_PROGRESS' && canWriteStage(t.current_stage_id);

  // Format Date and Aging
  const enteredDateObj = new Date(t.current_stage_entered_at);
  const enteredFormatted = enteredDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const vinShort = t.chassis_number ? t.chassis_number.slice(-6) : '';
  const branchClean = escapeHtml((t.branch_name || t.outlet_name || '').replace('Honda ', ''));

  const isClosed = t.status === 'CLOSED' || t.current_stage_id === 13;
  const stageConfig = state.stages.find(s => s.id === t.current_stage_id);

  let agingText = '';
  if (isClosed) {
    agingText = `${t.slaElapsedWD} WD total`;
  } else if (stageConfig && stageConfig.slaLimitWD) {
    agingText = `${t.stageElapsedWD}/${stageConfig.slaLimitWD} WD`;
  } else {
    agingText = `${t.stageElapsedWD} WD`;
  }

  card.innerHTML = `
    <!-- Top Row: Ticket #, Branch, SLA Badge -->
    <div class="card-head-row">
      <div class="card-ref-group">
        <a href="javascript:void(0)" class="card-ticket-no" onclick="event.stopPropagation(); openTicketPage(${t.id})" title="Double-click card or click here to open dedicated ticket page">${t.ticket_number}</a>
        <span class="card-branch-tag">${branchClean}</span>
        ${renderTicketPartsBadges(t)}
        ${t.parts_status_note ? `
          <button type="button" class="card-note-icon-btn has-note" onclick="event.stopPropagation(); openPartsNoteModal(${t.id})" title="Hold Note: ${escapeHtml(t.parts_status_note)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </button>
        ` : `
          <button type="button" class="card-note-icon-btn is-ghost" onclick="event.stopPropagation(); openPartsNoteModal(${t.id})" title="Add hold / paint note">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </button>
        `}
      </div>
      <span class="card-sla-badge ${slaPillClass}" onclick="event.stopPropagation(); openDetailDrawer(${t.id}, 'tabTimeline')" title="Click SLA badge to view 13-Stage Timeline Drawer">
        <span class="sla-dot"></span>
        <span class="sla-badge-text">${slaText}</span>
      </span>
    </div>

    <!-- Vehicle & Customer Line -->
    <div class="card-body-row">
      <div class="card-veh-line">
        <span class="card-model-name">${escapeHtml(t.model || t.vehicle_name || 'Honda')}</span>
        ${t.color ? `<span class="card-color-tag">${escapeHtml(t.color)}</span>` : ''}
        ${t.vehicle_no ? `<span class="card-reg-no">${escapeHtml(t.vehicle_no)}</span>` : (vinShort ? `<span class="card-reg-no">VIN: …${escapeHtml(vinShort)}</span>` : '')}
      </div>
      <div class="card-cust-line">
        <span class="card-cust-name">${escapeHtml(t.customer_name || '')}</span>
        ${t.customer_phone ? `<span class="card-cust-sep">•</span><a href="tel:${escapeHtml(t.customer_phone)}" class="card-cust-phone" onclick="event.stopPropagation()">${escapeHtml(t.customer_phone)}</a>` : ''}
      </div>
    </div>

    <!-- Footer: Stage / Aging + Action Buttons -->
    <div class="card-foot-row">
      <div class="card-stage-info">
        ${!isPipeline ? `<span class="card-stage-tag">#${t.current_stage_id} ${escapeHtml(t.stageName || '')}</span>` : ''}
        <span class="card-aging-text" title="Stage entered on ${enteredFormatted}">${agingText}</span>
      </div>
      <div class="card-action-btns">
        ${canAdvance ? `
          <button type="button" class="btn-circle-advance ${slaPillClass}" onclick="event.stopPropagation(); openAdvanceModal(${t.id})" title="Advance to Next Stage (${slaText})">
            <svg class="advance-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="7.5,4.5 18.5,12 7.5,19.5 11.5,12" />
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  // Right-click context menu (Timeline in right pane, Bypass, Delete)
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openTicketContextMenu(e, t.id);
  });

  // Reliable Double Click Detection (handles draggable="true" browser gesture variations)
  let lastClickTime = 0;
  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, textarea, select, .card-sla-badge')) return;
    const now = Date.now();
    if (now - lastClickTime < 350) {
      e.preventDefault();
      e.stopPropagation();
      openTicketPage(t.id);
      lastClickTime = 0;
    } else {
      lastClickTime = now;
    }
  });

  card.addEventListener('dblclick', (e) => {
    if (e.target.closest('a, button, input, textarea, select, .card-sla-badge')) return;
    e.stopPropagation();
    openTicketPage(t.id);
  });

  // Enable HTML5 Drag & Drop for Pipeline & Kanban
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    const payload = JSON.stringify({ ticketId: t.id, fromStageId: t.current_stage_id, fromColumn: t.kanbanColumn });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.setData('application/json', payload);
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.pipeline-col-dragover, .kanban-col-dragover').forEach(el => {
      el.classList.remove('pipeline-col-dragover', 'kanban-col-dragover');
    });
  });

  return card;
}

function getSlaCardClass(t) {
  if (t.status === 'CLOSED') return 'ticket-closed';
  if (t.isBreached) return 'sla-breached';
  if (t.isDueSoon) return 'sla-duesoon';
  return 'sla-normal';
}

function getSlaPillClass(t) {
  if (t.status === 'CLOSED') return 'pill-closed';
  if (t.isBreached) return 'pill-breached';
  if (t.isDueSoon) return 'pill-duesoon';
  return 'pill-normal';
}

function getSlaText(t) {
  if (t.status === 'CLOSED') return 'Closed';
  if (t.slaLimitWD === null) return 'Active';
  if (t.isBreached) {
    const overdue = Math.max(1, t.slaElapsedWD - t.slaLimitWD);
    return `+${overdue} WD`;
  }
  if (t.isDueSoon) {
    const remaining = Math.max(0, t.slaLimitWD - t.slaElapsedWD);
    return `${remaining} WD left`;
  }
  const left = Math.max(0, t.slaLimitWD - t.slaElapsedWD);
  return `${left} WD`;
}

function renderSlaBadgeIcon(t) {
  if (t.status === 'CLOSED') {
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  }
  if (t.isBreached) {
    return `<span class="sla-dot-indicator dot-breached" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#dc2626;margin-right:5px;vertical-align:middle;"></span>`;
  }
  if (t.isDueSoon) {
    return `<span class="sla-dot-indicator dot-duesoon" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#f59e0b;margin-right:5px;vertical-align:middle;"></span>`;
  }
  return `<span class="sla-dot-indicator dot-normal" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;margin-right:5px;vertical-align:middle;"></span>`;
}

// 13-Stage Pipeline View with Drag-and-Drop
function renderPipelineBoard() {
  if (!Array.isArray(state.tickets)) state.tickets = [];
  const container = document.getElementById('pipelineContainer');
  container.innerHTML = '';

  state.stages.forEach(st => {
    const stageTickets = state.tickets.filter(t => t.current_stage_id === st.id);
    let displayedTickets = stageTickets;
    let limitControlsHtml = '';

    if (st.id === 13) {
      const activeLimit = state.pipelineLimit13 || '20';
      if (activeLimit !== 'ALL') {
        const limit = parseInt(activeLimit, 10) || 20;
        displayedTickets = stageTickets.slice(0, limit);
      }
      limitControlsHtml = `
        <div class="topn-control-wrap">
          <div class="topn-pills">
            <button type="button" class="topn-pill ${activeLimit === '20' ? 'active' : ''}" data-stagelimit="20">20</button>
            <button type="button" class="topn-pill ${activeLimit === '50' ? 'active' : ''}" data-stagelimit="50">50</button>
            <button type="button" class="topn-pill ${activeLimit === 'ALL' ? 'active' : ''}" data-stagelimit="ALL">All</button>
          </div>
        </div>
      `;
    }

    const col = document.createElement('div');
    col.className = 'pipeline-stage-col';
    col.dataset.stageId = st.id;

    const avgTdStage = formatAvgTd(stageTickets, 'stageElapsedWD');

    col.innerHTML = `
      <div class="pipeline-stage-header">
        <div class="pipeline-title-row">
          <div class="pipeline-stage-title" title="#${st.id} ${escapeHtml(st.name)}">
            <span class="stage-num-dot">#${st.id}</span>
            <span class="stage-title-text">${escapeHtml(st.name)}</span>
          </div>
          <span class="pipeline-stage-count">${stageTickets.length}</span>
        </div>
        <div class="pipeline-stage-subrow">
          <div class="pipeline-stage-sla">${st.slaLimitWD ? `${st.slaLimitWD} WD max` : 'Intake'} • <span class="stage-avg-td">${avgTdStage}</span></div>
          ${limitControlsHtml}
        </div>
      </div>
      <div class="pipeline-stage-cards" id="stageCol_${st.id}"></div>
    `;

    // Drop zone handlers
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('pipeline-col-dragover');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('pipeline-col-dragover');
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('pipeline-col-dragover');
      try {
        const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
        if (!raw) return;
        const data = JSON.parse(raw);
        handlePipelineDrop(data.ticketId, data.fromStageId, st.id);
      } catch (err) {
        console.error('Pipeline drop error:', err);
      }
    });

    const cardsWrap = col.querySelector(`#stageCol_${st.id}`);
    if (displayedTickets.length === 0) {
      cardsWrap.innerHTML = `<div class="empty-state-micro">No tickets</div>`;
    } else {
      displayedTickets.forEach(t => cardsWrap.appendChild(createTicketCard(t, true)));
    }

    container.appendChild(col);
  });

  // Attach Stage #13 Customer Delivery limit pill listeners
  container.querySelectorAll('[data-stagelimit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.pipelineLimit13 = btn.dataset.stagelimit;
      state.pipelineLimit12 = btn.dataset.stagelimit;
      renderPipelineBoard();
    });
  });
}

function handlePipelineDrop(ticketId, fromStageId, targetStageId) {
  if (fromStageId === targetStageId) return;

  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  if (targetStageId < fromStageId) {
    // Moving backwards: Prompt to rollback and erase subsequent data
    openRollbackModal(ticket, targetStageId);
  } else {
    // Advancing forward (either next stage or skipping forward)
    // Open the obvious modal for that target stage!
    openAdvanceModal(ticket.id, targetStageId);
  }
}

function handleKanbanDrop(ticketId, targetColumn) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const currentCol = ticket.kanbanColumn;
  if (currentCol === targetColumn) return;

  if (targetColumn === 'IN_PROGRESS') {
    if (currentCol === 'OPEN') {
      // Advance to Stage 2: Estimate Preparation
      openAdvanceModal(ticket.id, 2);
    } else if (currentCol === 'CLOSED') {
      // Reopen ticket back to Work Complete (Stage 9)
      openRollbackModal(ticket, 9);
    }
  } else if (targetColumn === 'CLOSED') {
    // Delivery / Bypass
    if (ticket.current_stage_id === 12) {
      openAdvanceModal(ticket.id, 13);
    } else {
      openBypassModal(ticket.id);
    }
  } else if (targetColumn === 'OPEN') {
    // Rollback to Stage 1: Vehicle Arrival
    openRollbackModal(ticket, 1);
  }
}

// Table View with Pagination
function renderTableView() {
  if (!Array.isArray(state.tickets)) state.tickets = [];
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const totalTickets = Array.isArray(state.tickets) ? state.tickets.length : 0;

  if (totalTickets === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:24px;color:#94a3b8;">No matching tickets found.</td></tr>`;
    updateTablePagination(0, 0, 0, 1);
    return;
  }

  // Apply table sorting if specified
  let sortedTickets = [...state.tickets];
  if (state.tableSortKey && typeof sortTableTickets === 'function') {
    sortedTickets = sortTableTickets(sortedTickets, state.tableSortKey, state.tableSortDir || 'asc');
  }

  // Update header sort indicator classes
  document.querySelectorAll('th.sortable-th').forEach(th => {
    th.classList.remove('is-sorted-asc', 'is-sorted-desc');
    if (th.dataset.sortKey === state.tableSortKey) {
      th.classList.add(state.tableSortDir === 'desc' ? 'is-sorted-desc' : 'is-sorted-asc');
    }
  });

  // Calculate pagination boundaries
  const pageSize = (state.tablePageSize === 'ALL') ? totalTickets : (parseInt(state.tablePageSize, 10) || 25);
  const totalPages = Math.max(1, Math.ceil(totalTickets / (pageSize || 1)));

  if (state.tablePage > totalPages) state.tablePage = totalPages;
  if (state.tablePage < 1) state.tablePage = 1;

  const startIndex = (state.tablePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalTickets);
  const pageTickets = (state.tablePageSize === 'ALL') ? sortedTickets : sortedTickets.slice(startIndex, endIndex);

  pageTickets.forEach(t => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('dblclick', () => openTicketPage(t.id));
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTicketContextMenu(e, t.id);
    });
    tr.innerHTML = `
      <td>
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
          <a href="javascript:void(0)" class="card-ticket-no" onclick="event.stopPropagation(); openTicketPage(${t.id})" title="View Details"><strong>${t.ticket_number}</strong></a>
          ${renderTicketPartsBadges(t)}
        </div>
      </td>
      <td>${escapeHtml(t.branch_name || t.outlet_name)}</td>
      <td>${escapeHtml(t.customer_name)}</td>
      <td><span style="display: inline-flex; align-items: center;">${escapeHtml(t.customer_phone || '')}${renderPhoneCopyBtn(t.customer_phone)}</span></td>
      <td>
        <strong>${escapeHtml(t.model || t.vehicle_name)}</strong>
        ${t.color ? `<span class="vehicle-color-tag">${escapeHtml(t.color)}</span>` : ''}
        ${t.vehicle_no ? `<div style="font-size:11px;font-family:var(--font-mono);color:var(--text-subtle);">${escapeHtml(t.vehicle_no)}</div>` : ''}
      </td>
      <td style="font-family:var(--font-mono);font-size:11px;">${escapeHtml(t.chassis_number || '—')}</td>
      <td><span class="stage-pill">#${t.current_stage_id} ${escapeHtml(t.stageName)}</span></td>
      <td><strong>${t.kanbanColumn}</strong></td>
      <td>${new Date(t.current_stage_entered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
      <td><strong>${t.slaElapsedWD} WD</strong></td>
      <td>${t.slaLimitWD ? `${t.slaLimitWD} WD` : '-'}</td>
      <td><span class="sla-pill ${getSlaPillClass(t)}">${renderSlaBadgeIcon(t)}${getSlaText(t)}</span></td>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 6px;">
          <button class="btn-xs" onclick="event.stopPropagation(); openTicketPage(${t.id})">Details</button>
          ${t.status !== 'CLOSED' ? `
            <button type="button" class="btn-circle-advance ${getSlaPillClass(t)}" onclick="event.stopPropagation(); openAdvanceModal(${t.id})" title="Advance to Next Stage">
              <svg class="advance-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="7.5,4.5 18.5,12 7.5,19.5 11.5,12" />
              </svg>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateTablePagination(totalTickets, startIndex, endIndex, totalPages);
}

function updateTablePagination(totalTickets, startIndex, endIndex, totalPages) {
  const infoEl = document.getElementById('tblPaginationInfo');
  const numbersEl = document.getElementById('tblPageNumbers');
  const btnFirst = document.getElementById('btnTblFirstPage');
  const btnPrev = document.getElementById('btnTblPrevPage');
  const btnNext = document.getElementById('btnTblNextPage');
  const btnLast = document.getElementById('btnTblLastPage');

  if (infoEl) {
    if (totalTickets === 0) {
      infoEl.textContent = 'Showing 0 tickets';
    } else {
      infoEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalTickets} tickets (Page ${state.tablePage} of ${totalPages})`;
    }
  }

  const isFirst = state.tablePage <= 1;
  const isLast = state.tablePage >= totalPages || totalTickets === 0;

  if (btnFirst) btnFirst.disabled = isFirst;
  if (btnPrev) btnPrev.disabled = isFirst;
  if (btnNext) btnNext.disabled = isLast;
  if (btnLast) btnLast.disabled = isLast;

  if (!numbersEl) return;
  numbersEl.innerHTML = '';

  if (totalPages <= 1) return;

  // Build smart pagination numbers window
  const cur = state.tablePage;
  const pagesToShow = new Set();
  pagesToShow.add(1);
  pagesToShow.add(totalPages);
  for (let i = Math.max(1, cur - 2); i <= Math.min(totalPages, cur + 2); i++) {
    pagesToShow.add(i);
  }

  const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b);
  let prevP = 0;
  sortedPages.forEach(p => {
    if (prevP > 0 && p - prevP > 1) {
      const ell = document.createElement('span');
      ell.className = 'tp-ellipsis';
      ell.textContent = '…';
      numbersEl.appendChild(ell);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-page-num ${p === cur ? 'active' : ''}`;
    btn.textContent = p;
    btn.title = `Page ${p}`;
    btn.addEventListener('click', () => {
      state.tablePage = p;
      renderTableView();
    });
    numbersEl.appendChild(btn);

    prevP = p;
  });
}

function setupTableSorting() {
  document.querySelectorAll('th.sortable-th').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const key = th.dataset.sortKey;
      if (!key) return;
      if (state.tableSortKey === key) {
        state.tableSortDir = state.tableSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.tableSortKey = key;
        state.tableSortDir = 'asc';
      }
      renderTableView();
    };
  });
}

// ====================================================
// CSV EXPORT UTILITY
// ====================================================
function exportTicketsToCsv() {
  const tickets = state.tickets || [];
  if (tickets.length === 0) {
    showToast('No tickets available to export for current filters.', 'info');
    return;
  }

  const headers = [
    'Ticket #',
    'Branch',
    'Customer Name',
    'Customer Phone',
    'Vehicle Model',
    'Vehicle Reg No',
    'Color',
    'Chassis / VIN',
    'Current Stage #',
    'Current Stage Name',
    'Kanban Column',
    'Stage Entered Date',
    'Aging (Working Days)',
    'Max SLA Limit (WD)',
    'SLA Status',
    'Estimated Cost',
    'Insurer Name',
    'Policy Number',
    'Claim Number',
    'Surveyor Name',
    'Surveyor Phone',
    'Created At'
  ];

  function escapeCsv(val) {
    if (val == null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = tickets.map(t => {
    let slaStatus = 'On Track';
    if (t.isBreached) slaStatus = 'Breached';
    else if (t.isDueSoon) slaStatus = 'Due Soon';

    const enteredDate = t.current_stage_entered_at ?
      new Date(t.current_stage_entered_at).toLocaleDateString('en-GB') : '';
    const createdDate = t.created_at ?
      new Date(t.created_at).toLocaleDateString('en-GB') : '';

    return [
      t.ticket_number || '',
      t.branch_name || t.outlet_name || '',
      t.customer_name || '',
      t.customer_phone || '',
      t.model || t.vehicle_name || '',
      t.vehicle_no || '',
      t.color || '',
      t.chassis_number || '',
      t.current_stage_id != null ? t.current_stage_id : '',
      t.stageName || '',
      t.kanbanColumn || '',
      enteredDate,
      t.slaElapsedWD != null ? t.slaElapsedWD : '',
      t.slaLimitWD != null ? t.slaLimitWD : '',
      slaStatus,
      t.estimated_cost != null ? t.estimated_cost : '',
      t.insurer_name || '',
      t.policy_number || '',
      t.claim_number || '',
      t.surveyor_name || '',
      t.surveyor_phone || '',
      createdDate
    ].map(escapeCsv).join(',');
  });

  const csvContent = '\uFEFF' + [
    headers.map(escapeCsv).join(','),
    ...rows
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const stagePart = (state.selectedStage && state.selectedStage !== 'ALL') ? `_Stage${state.selectedStage}` : '';
  a.href = url;
  a.download = `Honda_Service_Tickets_${dateStr}${stagePart}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Successfully exported ${tickets.length} tickets to CSV`, 'success');
}

// ====================================================
// REUSABLE MULTI-SELECT DROPDOWN COMPONENT
// ====================================================
class MultiSelectDropdown {
  constructor(config) {
    this.containerId = config.containerId;
    this.container = typeof config.containerId === 'string' ? document.getElementById(config.containerId) : config.containerId;
    this.label = config.label || '';
    this.placeholder = config.placeholder || 'All';
    this.iconSvg = config.iconSvg || '';
    this.options = config.options || [];
    this.selected = new Set((config.selected || []).map(String));
    this.onChange = config.onChange || (() => { });
    this.enableSearch = config.enableSearch !== undefined ? config.enableSearch : (this.options.length > 6);
    this.searchQuery = '';
    this.init();
  }

  setOptions(options) {
    this.options = options || [];
    this.enableSearch = this.options.length > 6;
    this.render();
  }

  setSelected(values) {
    this.selected = new Set((values || []).map(String));
    this.updateButton();
    this.updateCheckboxes();
    this.updateFooter();
  }

  getSelected() {
    return Array.from(this.selected);
  }

  init() {
    if (!this.container) return;
    this.render();
    this.bindGlobalEvents();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ms-filter-wrapper';
    this.wrapper = wrapper;

    // Trigger Button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ms-filter-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    this.btn = btn;

    this.updateButton();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    wrapper.appendChild(btn);

    // Dropdown Panel
    const panel = document.createElement('div');
    panel.className = 'ms-dropdown-panel';
    this.panel = panel;

    panel.addEventListener('click', (e) => e.stopPropagation());

    // Header with search & actions
    const header = document.createElement('div');
    header.className = 'ms-dropdown-header';

    if (this.enableSearch) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ms-search-wrap';
      searchWrap.innerHTML = `
        <svg class="ms-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="ms-search-input" placeholder="Search ${escapeHtml(this.label || 'items')}...">
      `;
      const searchInp = searchWrap.querySelector('.ms-search-input');
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.filterOptionsList();
      });
      header.appendChild(searchWrap);
    }

    const actions = document.createElement('div');
    actions.className = 'ms-actions-bar';
    actions.innerHTML = `
      <button type="button" class="ms-action-link btn-select-all">Select All</button>
      <button type="button" class="ms-action-link danger btn-clear-all">Clear</button>
    `;

    actions.querySelector('.btn-select-all').addEventListener('click', () => {
      this.selectAll();
    });
    actions.querySelector('.btn-clear-all').addEventListener('click', () => {
      this.clearAll();
    });
    header.appendChild(actions);
    panel.appendChild(header);

    // Options List
    const listEl = document.createElement('div');
    listEl.className = 'ms-options-list';
    this.listEl = listEl;
    this.renderOptionsList();
    panel.appendChild(listEl);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'ms-dropdown-footer';
    this.footer = footer;
    this.updateFooter();
    panel.appendChild(footer);

    wrapper.appendChild(panel);
    this.container.appendChild(wrapper);
  }

  updateButton() {
    if (!this.btn) return;
    const count = this.selected.size;
    const isAll = count === 0 || count === this.options.length;

    this.btn.classList.toggle('has-filter', count > 0 && !isAll);

    let summaryText = '';
    if (count === 0) {
      summaryText = this.placeholder;
    } else if (count === this.options.length && this.options.length > 1) {
      summaryText = `All ${this.label ? this.label + 's' : 'Items'} (${count})`;
    } else if (count === 1) {
      const selectedId = Array.from(this.selected)[0];
      const opt = this.options.find(o => String(o.id) === String(selectedId));
      summaryText = opt ? opt.label : `1 ${this.label || 'Item'}`;
    } else {
      const firstId = Array.from(this.selected)[0];
      const opt = this.options.find(o => String(o.id) === String(firstId));
      const firstLabel = opt ? opt.label : '';
      summaryText = firstLabel.length > 14 ? `${firstLabel.slice(0, 12)}… +${count - 1}` : `${firstLabel} +${count - 1}`;
    }

    const clearBtnHtml = (count > 0 && !isAll) ? `<button type="button" class="ms-clear-btn" title="Clear filter">&times;</button>` : '';
    const countBadgeHtml = (count > 0 && !isAll) ? `<span class="ms-count-badge">${count}</span>` : '';

    this.btn.innerHTML = `
      ${this.iconSvg ? `<span class="ms-btn-icon">${this.iconSvg}</span>` : ''}
      ${this.label ? `<span class="ms-btn-label">${escapeHtml(this.label)}:</span>` : ''}
      <span class="ms-btn-summary">${escapeHtml(summaryText)}</span>
      ${countBadgeHtml}
      ${clearBtnHtml}
      <span class="ms-chevron">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </span>
    `;

    const clearBtn = this.btn.querySelector('.ms-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAll();
      });
    }
  }

  renderOptionsList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    if (this.options.length === 0) {
      this.listEl.innerHTML = `<div class="ms-empty-notice">No options available</div>`;
      return;
    }

    this.options.forEach(opt => {
      const isChecked = this.selected.has(String(opt.id));
      const item = document.createElement('div');
      item.className = `ms-option-item ${isChecked ? 'selected' : ''}`;
      item.dataset.id = opt.id;

      let dotHtml = '';
      if (opt.dot) dotHtml = `<span class="ms-dot ${escapeHtml(opt.dot)}"></span>`;

      let badgeHtml = '';
      if (opt.badge) badgeHtml = `<span class="ms-option-badge" style="background:#e0f2fe; color:#0369a1;">${escapeHtml(opt.badge)}</span>`;

      let countHtml = '';
      if (opt.count !== undefined) countHtml = `<span class="ms-option-count">${opt.count}</span>`;

      item.innerHTML = `
        <input type="checkbox" class="ms-checkbox" ${isChecked ? 'checked' : ''} tabindex="-1">
        ${dotHtml}
        ${badgeHtml}
        <span class="ms-option-label">${escapeHtml(opt.label)}</span>
        ${countHtml}
      `;

      item.addEventListener('click', (e) => {
        const cb = item.querySelector('.ms-checkbox');
        const nextState = !cb.checked;
        cb.checked = nextState;
        this.toggleItem(opt.id, nextState);
      });

      this.listEl.appendChild(item);
    });
  }

  filterOptionsList() {
    if (!this.listEl) return;
    const items = this.listEl.querySelectorAll('.ms-option-item');
    let visibleCount = 0;
    items.forEach(it => {
      const label = (it.querySelector('.ms-option-label') ? it.querySelector('.ms-option-label').textContent : '').toLowerCase();
      const matches = label.includes(this.searchQuery);
      it.style.display = matches ? 'flex' : 'none';
      if (matches) visibleCount++;
    });

    let emptyMsg = this.listEl.querySelector('.ms-filter-empty');
    if (visibleCount === 0) {
      if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.className = 'ms-empty-notice ms-filter-empty';
        emptyMsg.textContent = 'No matching items found';
        this.listEl.appendChild(emptyMsg);
      }
    } else if (emptyMsg) {
      emptyMsg.remove();
    }
  }

  toggleItem(id, isChecked) {
    const strId = String(id);
    if (isChecked) {
      this.selected.add(strId);
    } else {
      this.selected.delete(strId);
    }
    this.updateButton();
    this.updateCheckboxes();
    this.updateFooter();
    this.onChange(Array.from(this.selected));
  }

  selectAll() {
    this.options.forEach(opt => this.selected.add(String(opt.id)));
    this.updateButton();
    this.updateCheckboxes();
    this.updateFooter();
    this.onChange(Array.from(this.selected));
  }

  clearAll() {
    this.selected.clear();
    this.updateButton();
    this.updateCheckboxes();
    this.updateFooter();
    this.onChange([]);
  }

  updateCheckboxes() {
    if (!this.listEl) return;
    this.listEl.querySelectorAll('.ms-option-item').forEach(it => {
      const id = String(it.dataset.id);
      const isChecked = this.selected.has(id);
      const cb = it.querySelector('.ms-checkbox');
      if (cb) cb.checked = isChecked;
      it.classList.toggle('selected', isChecked);
    });
  }

  updateFooter() {
    if (!this.footer) return;
    const selCount = this.selected.size;
    const totalCount = this.options.length;
    this.footer.innerHTML = `
      <span>${selCount === 0 ? 'Showing all' : `${selCount} of ${totalCount} selected`}</span>
      <span style="color:#2563eb; font-weight:600; cursor:pointer;" class="btn-ms-done">Done</span>
    `;
    const doneBtn = this.footer.querySelector('.btn-ms-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => this.closeDropdown());
    }
  }

  toggleDropdown() {
    const isOpen = this.panel && this.panel.classList.contains('open');
    if (isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    document.querySelectorAll('.ms-dropdown-panel.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.ms-filter-btn.open').forEach(b => b.classList.remove('open'));

    if (this.panel && this.btn) {
      this.panel.classList.add('open');
      this.btn.classList.add('open');

      if (this.enableSearch) {
        const inp = this.panel.querySelector('.ms-search-input');
        if (inp) {
          inp.value = '';
          this.searchQuery = '';
          this.filterOptionsList();
          setTimeout(() => inp.focus(), 50);
        }
      }
    }
  }

  closeDropdown() {
    if (this.panel && this.btn) {
      this.panel.classList.remove('open');
      this.btn.classList.remove('open');
    }
  }

  bindGlobalEvents() {
    if (window._msGlobalBound) return;
    window._msGlobalBound = true;

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ms-filter-wrapper')) {
        document.querySelectorAll('.ms-dropdown-panel.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.ms-filter-btn.open').forEach(b => b.classList.remove('open'));
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.ms-dropdown-panel.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.ms-filter-btn.open').forEach(b => b.classList.remove('open'));
      }
    });
  }
}

window.MultiSelectDropdown = MultiSelectDropdown;

function initFilterDropdowns() {
  // 1. SLA Multi-Select Filter
  const slaContainer = document.getElementById('slaFilterContainer');
  if (slaContainer && !window.msSlaFilter) {
    window.msSlaFilter = new MultiSelectDropdown({
      containerId: 'slaFilterContainer',
      label: 'SLA',
      placeholder: 'All SLA Statuses',
      iconSvg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
      options: [
        { id: 'BREACHED', label: 'Breached', dot: 'red' },
        { id: 'DUE_SOON', label: 'Due Soon (≤ 1 WD)', dot: 'amber' },
        { id: 'WITHIN_SLA', label: 'On Track', dot: 'green' },
        { id: 'COMPLETED', label: 'Completed', dot: 'gray' }
      ],
      selected: state.selectedSlas || [],
      onChange: (values) => {
        state.selectedSlas = values;
        state.selectedSla = values.length > 0 ? values.join(',') : 'ALL';
        refreshTickets();
      }
    });
  }

  // 2. Branch Multi-Select Filter
  const outletContainer = document.getElementById('outletFilterContainer');
  if (outletContainer && !window.msOutletFilter) {
    window.msOutletFilter = new MultiSelectDropdown({
      containerId: 'outletFilterContainer',
      label: 'Branch',
      placeholder: 'All Branches',
      iconSvg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
      options: (state.outlets || []).map(o => ({ id: o.id, label: o.name + (o.code ? ` (${o.code})` : '') })),
      selected: state.selectedOutlets || [],
      onChange: (values) => {
        state.selectedOutlets = values;
        state.selectedOutlet = values.length > 0 ? values.join(',') : 'ALL';
        refreshTickets();
      }
    });
  }

  // 3. Stage Multi-Select Filter (Top controls bar)
  const stageContainer = document.getElementById('stageFilterContainer');
  if (stageContainer && !window.msStageFilter) {
    window.msStageFilter = new MultiSelectDropdown({
      containerId: 'stageFilterContainer',
      label: 'Stage',
      placeholder: 'All Stages (1–13)',
      iconSvg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
      options: (state.stages || []).map(s => ({ id: s.id, label: `Stage ${s.id}: ${s.name}`, badge: `S${s.id}` })),
      selected: state.selectedStages || [],
      enableSearch: true,
      onChange: (values) => {
        state.selectedStages = values;
        state.selectedStage = values.length > 0 ? values.join(',') : 'ALL';
        state.tablePage = 1;
        refreshTickets();
      }
    });
  }

  // 4. Customer Branch Multi-Select Filter
  const custBranchContainer = document.getElementById('custBranchFilterContainer');
  if (custBranchContainer && !window.msCustBranchFilter) {
    window.msCustBranchFilter = new MultiSelectDropdown({
      containerId: 'custBranchFilterContainer',
      label: 'Branch',
      placeholder: 'All Branches',
      iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
      options: (state.outlets || []).map(o => ({ id: o.id, label: o.name })),
      selected: state.customerBranchFilters || [],
      onChange: (values) => {
        state.customerBranchFilters = values;
        state.customerBranchFilter = values.length > 0 ? values.join(',') : '';
        filterCustomersList();
      }
    });
  }
}

// ====================================================
// EVENT LISTENERS & KEYBOARD SHORTCUTS
// ====================================================
function setupEventListeners() {
  // Initialize multi-select filter components
  initFilterDropdowns();

  // Sort Order Filter (Default: SLA descending)
  const sortSelect = document.getElementById('sortFilter');
  if (sortSelect) {
    sortSelect.value = state.sortBy || 'sla_desc';
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      state.tableSortKey = null; // Clear table header sort override so global sort takes effect
      if (Array.isArray(state.tickets) && state.tickets.length > 0) {
        state.tickets = sortTicketsList(state.tickets, state.sortBy);
        renderCurrentView();
      }
      refreshTickets();
    });
  }

  // Setup click-to-sort on Table view headers
  setupTableSorting();

  // Backward compatibility fallback for legacy select elements if present
  const outletFilter = document.getElementById('outletFilter');
  if (outletFilter) {
    outletFilter.addEventListener('change', (e) => {
      state.selectedOutlet = e.target.value;
      refreshTickets();
    });
  }

  const slaFilter = document.getElementById('slaFilter');
  if (slaFilter) {
    slaFilter.addEventListener('change', (e) => {
      state.selectedSla = e.target.value;
      refreshTickets();
    });
  }

  const stageFilter = document.getElementById('stageFilter');
  if (stageFilter) {
    stageFilter.addEventListener('change', (e) => {
      state.selectedStage = e.target.value;
      refreshTickets();
    });
  }

  // Table View Compact Date Range Filter
  const tblDateField = document.getElementById('tblDateField');
  const tblDatePreset = document.getElementById('tblDatePreset');
  const tblCustomDateWrap = document.getElementById('tblCustomDateWrap');
  const tblDateStart = document.getElementById('tblDateStart');
  const tblDateEnd = document.getElementById('tblDateEnd');
  const btnTblDateClear = document.getElementById('btnTblDateClear');

  function getISODateStr(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function applyDatePreset(preset) {
    state.tableDatePreset = preset;
    const now = new Date();

    if (preset === 'ALL') {
      state.tableDateStart = '';
      state.tableDateEnd = '';
      if (tblCustomDateWrap) tblCustomDateWrap.style.display = 'none';
      if (btnTblDateClear) btnTblDateClear.style.display = 'none';
      if (tblDateStart) tblDateStart.value = '';
      if (tblDateEnd) tblDateEnd.value = '';
    } else if (preset === 'TODAY') {
      const todayStr = getISODateStr(now);
      state.tableDateStart = todayStr;
      state.tableDateEnd = todayStr;
      if (tblCustomDateWrap) tblCustomDateWrap.style.display = 'none';
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      if (tblDateStart) tblDateStart.value = todayStr;
      if (tblDateEnd) tblDateEnd.value = todayStr;
    } else if (preset === 'YESTERDAY') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = getISODateStr(yest);
      state.tableDateStart = yestStr;
      state.tableDateEnd = yestStr;
      if (tblCustomDateWrap) tblCustomDateWrap.style.display = 'none';
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      if (tblDateStart) tblDateStart.value = yestStr;
      if (tblDateEnd) tblDateEnd.value = yestStr;
    } else if (preset === 'THIS_WEEK') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const monStr = getISODateStr(monday);
      const todayStr = getISODateStr(now);
      state.tableDateStart = monStr;
      state.tableDateEnd = todayStr;
      if (tblCustomDateWrap) tblCustomDateWrap.style.display = 'none';
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      if (tblDateStart) tblDateStart.value = monStr;
      if (tblDateEnd) tblDateEnd.value = todayStr;
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayStr = getISODateStr(firstDay);
      const todayStr = getISODateStr(now);
      state.tableDateStart = firstDayStr;
      state.tableDateEnd = todayStr;
      if (tblCustomDateWrap) tblCustomDateWrap.style.display = 'none';
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      if (tblDateStart) tblDateStart.value = firstDayStr;
      if (tblDateEnd) tblDateEnd.value = todayStr;
    } else if (preset === 'CUSTOM') {
      if (tblCustomDateWrap) tblCustomDateWrap.style.display = 'inline-flex';
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      state.tableDateStart = tblDateStart ? tblDateStart.value : '';
      state.tableDateEnd = tblDateEnd ? tblDateEnd.value : '';
    }
  }

  if (tblDateField) {
    tblDateField.addEventListener('change', (e) => {
      state.tableDateField = e.target.value;
      if (state.tableDateStart || state.tableDateEnd) {
        state.tablePage = 1;
        refreshTickets();
      }
    });
  }

  if (tblDatePreset) {
    tblDatePreset.addEventListener('change', (e) => {
      applyDatePreset(e.target.value);
      state.tablePage = 1;
      refreshTickets();
    });
  }

  if (tblDateStart) {
    tblDateStart.addEventListener('change', (e) => {
      state.tableDateStart = e.target.value;
      if (state.tableDatePreset !== 'CUSTOM') {
        state.tableDatePreset = 'CUSTOM';
        if (tblDatePreset) tblDatePreset.value = 'CUSTOM';
      }
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      state.tablePage = 1;
      refreshTickets();
    });
  }

  if (tblDateEnd) {
    tblDateEnd.addEventListener('change', (e) => {
      state.tableDateEnd = e.target.value;
      if (state.tableDatePreset !== 'CUSTOM') {
        state.tableDatePreset = 'CUSTOM';
        if (tblDatePreset) tblDatePreset.value = 'CUSTOM';
      }
      if (btnTblDateClear) btnTblDateClear.style.display = 'inline-flex';
      state.tablePage = 1;
      refreshTickets();
    });
  }

  if (btnTblDateClear) {
    btnTblDateClear.addEventListener('click', () => {
      if (tblDatePreset) tblDatePreset.value = 'ALL';
      applyDatePreset('ALL');
      state.tablePage = 1;
      refreshTickets();
    });
  }

  // EOD Scope Switcher (Today vs All-Time)
  const btnEodScopeToday = document.getElementById('btnEodScopeToday');
  const btnEodScopeAllTime = document.getElementById('btnEodScopeAllTime');
  if (btnEodScopeToday) {
    btnEodScopeToday.addEventListener('click', () => {
      loadEodSummaryData('today');
    });
  }
  if (btnEodScopeAllTime) {
    btnEodScopeAllTime.addEventListener('click', () => {
      loadEodSummaryData('all');
    });
  }

  // Table Rows Per Page Selector
  const tblPageSize = document.getElementById('tblPageSize');
  if (tblPageSize) {
    tblPageSize.value = state.tablePageSize;
    tblPageSize.addEventListener('change', (e) => {
      state.tablePageSize = e.target.value;
      state.tablePage = 1;
      renderTableView();
    });
  }

  // Download as CSV Button
  const btnExportCsv = document.getElementById('btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportTicketsToCsv);
  }

  // Table Pagination Navigation Buttons
  const btnFirst = document.getElementById('btnTblFirstPage');
  if (btnFirst) {
    btnFirst.addEventListener('click', () => {
      if (state.tablePage > 1) {
        state.tablePage = 1;
        renderTableView();
      }
    });
  }

  const btnPrev = document.getElementById('btnTblPrevPage');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.tablePage > 1) {
        state.tablePage--;
        renderTableView();
      }
    });
  }

  const btnNext = document.getElementById('btnTblNextPage');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const pageSize = (state.tablePageSize === 'ALL') ? state.tickets.length : (parseInt(state.tablePageSize, 10) || 25);
      const totalPages = Math.max(1, Math.ceil(state.tickets.length / (pageSize || 1)));
      if (state.tablePage < totalPages) {
        state.tablePage++;
        renderTableView();
      }
    });
  }

  const btnLast = document.getElementById('btnTblLastPage');
  if (btnLast) {
    btnLast.addEventListener('click', () => {
      const pageSize = (state.tablePageSize === 'ALL') ? state.tickets.length : (parseInt(state.tablePageSize, 10) || 25);
      const totalPages = Math.max(1, Math.ceil(state.tickets.length / (pageSize || 1)));
      if (state.tablePage < totalPages) {
        state.tablePage = totalPages;
        renderTableView();
      }
    });
  }

  // Live Search (Debounced)
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value;
      refreshTickets();
    }, 250);
  });

  // View Switcher Buttons
  document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      state.activeView = view;

      document.getElementById('kanbanView').style.display = view === 'kanban' ? 'block' : 'none';
      document.getElementById('pipelineView').style.display = view === 'pipeline' ? 'block' : 'none';
      document.getElementById('tableView').style.display = view === 'table' ? 'block' : 'none';

      renderCurrentView();
    });
  });

  // Modal Open Buttons
  document.getElementById('btnNewTicket').addEventListener('click', openNewTicketModal);
  document.getElementById('btnEodReport').addEventListener('click', () => openEodReportModal('mentions'));

  // Dual-Section Alert Modal Tabs
  document.querySelectorAll('[data-alert-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchAlertTab(btn.dataset.alertTab);
    });
  });

  // Mentions Filter Buttons
  const btnFilterAll = document.getElementById('btnFilterMentionsAll');
  const btnFilterUnread = document.getElementById('btnFilterMentionsUnread');
  if (btnFilterAll && btnFilterUnread) {
    btnFilterAll.addEventListener('click', () => {
      btnFilterAll.classList.add('active');
      btnFilterUnread.classList.remove('active');
      currentNotificationFilter = 'all';
      renderNotificationsList();
    });
    btnFilterUnread.addEventListener('click', () => {
      btnFilterUnread.classList.add('active');
      btnFilterAll.classList.remove('active');
      currentNotificationFilter = 'unread';
      renderNotificationsList();
    });
  }

  // Mark all notifications read
  const btnMarkAll = document.getElementById('btnMarkAllMentionsRead');
  if (btnMarkAll) {
    btnMarkAll.addEventListener('click', markAllNotificationsRead);
  }

  // Drawer Tabs (Timeline vs Notes)
  document.querySelectorAll('[data-drawer-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.drawerTab;
      document.querySelectorAll('[data-drawer-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const timeline = document.getElementById('drawerTimeline');
      const notes = document.getElementById('drawerNotesPane');
      if (tab === 'notes') {
        if (timeline) timeline.style.display = 'none';
        if (notes) notes.style.display = 'block';
      } else {
        if (timeline) timeline.style.display = 'block';
        if (notes) notes.style.display = 'none';
      }
    });
  });

  // Note Composer for Dedicated Ticket Page
  const btnSubmitTicketComment = document.getElementById('btnSubmitTicketComment');
  if (btnSubmitTicketComment) {
    btnSubmitTicketComment.addEventListener('click', async () => {
      const ticketId = state.currentEditingTicket?.id;
      const input = document.getElementById('inputNewTicketComment');
      const content = input ? input.value.trim() : '';
      if (!content) {
        showToast('Please enter a note before posting.', 'info');
        return;
      }
      btnSubmitTicketComment.disabled = true;
      try {
        await submitComment(ticketId, content, null);
        if (input) input.value = '';
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSubmitTicketComment.disabled = false;
      }
    });
  }

  // Note Composer for Drawer
  const btnSubmitDrawerComment = document.getElementById('btnSubmitDrawerComment');
  if (btnSubmitDrawerComment) {
    btnSubmitDrawerComment.addEventListener('click', async () => {
      const ticketId = state.currentEditingTicket?.id;
      const input = document.getElementById('inputDrawerComment');
      const content = input ? input.value.trim() : '';
      if (!content) {
        showToast('Please enter a note before posting.', 'info');
        return;
      }
      btnSubmitDrawerComment.disabled = true;
      try {
        await submitComment(ticketId, content, null);
        if (input) input.value = '';
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSubmitDrawerComment.disabled = false;
      }
    });
  }

  // Helper button to insert @ mention
  const btnComposerMention = document.getElementById('btnComposerMention');
  if (btnComposerMention) {
    btnComposerMention.addEventListener('click', () => {
      const input = document.getElementById('inputNewTicketComment');
      if (!input) return;
      input.focus();
      const val = input.value;
      const space = val.length > 0 && !val.endsWith(' ') ? ' ' : '';
      input.value = val + space + '@';
      input.dispatchEvent(new Event('input'));
    });
  }

  // Setup Mention Autocomplete Typeahead
  setupMentionAutocomplete('inputNewTicketComment', 'mentionDropdownBox');

  // Modal Close Buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      closeModal(modalId);
    });
  });

  // Drawer Close Button & Backdrop
  const drawerEl = document.getElementById('drawerDetail');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => {
      if (drawerEl) drawerEl.style.display = 'none';
      document.body.style.overflow = '';
    });
  }
  if (drawerEl) {
    drawerEl.addEventListener('click', (e) => {
      if (e.target === drawerEl) {
        drawerEl.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }

  // Drawer Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).style.display = 'block';
    });
  });

  // New Ticket Form Submit
  document.getElementById('formNewTicket').addEventListener('submit', handleNewTicketSubmit);

  // Stage Advance Form Submit
  document.getElementById('formAdvanceStage').addEventListener('submit', handleAdvanceStageSubmit);

  // Pipeline Bypass Form Submit
  document.getElementById('formBypassPipeline').addEventListener('submit', handleBypassSubmit);

  // Closed Column Controls (Collapse & Limit Pills)
  const toggleClosedBtn = document.getElementById('btnToggleClosedCol');
  if (toggleClosedBtn) {
    toggleClosedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const col = document.getElementById('colClosed');
      col.classList.toggle('col-collapsed');
      const isCollapsed = col.classList.contains('col-collapsed');
      toggleClosedBtn.textContent = isCollapsed ? '▸' : '▾';
    });
  }

  // Limit pill buttons in Closed column
  document.querySelectorAll('#closedPillGroup .topn-pill, #closedPillGroup .limit-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.closedLimit = btn.dataset.limit;
      document.querySelectorAll('#closedPillGroup .topn-pill, #closedPillGroup .limit-pill').forEach(b => {
        b.classList.toggle('active', b.dataset.limit === state.closedLimit);
      });
      renderKanbanBoard();
    });
  });

  // Kanban Columns Drag-and-Drop Listeners
  ['colOpen', 'colInProgress', 'colClosed'].forEach(colId => {
    const colEl = document.getElementById(colId);
    if (!colEl) return;

    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      colEl.classList.add('kanban-col-dragover');
    });
    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('kanban-col-dragover');
    });
    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      colEl.classList.remove('kanban-col-dragover');
      try {
        const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
        if (!raw) return;
        const data = JSON.parse(raw);
        handleKanbanDrop(data.ticketId, colEl.dataset.column);
      } catch (err) {
        console.error('Kanban drop error:', err);
      }
    });
  });

  // Edit Ticket Form Submit & Delete Action (if present)
  const formEdit = document.getElementById('formEditTicket');
  if (formEdit) {
    formEdit.addEventListener('submit', handleEditTicketSubmit);
  }
  const btnDeleteTicket = document.getElementById('btnDeleteTicket');
  if (btnDeleteTicket) {
    btnDeleteTicket.addEventListener('click', handleDeleteTicket);
  }

  // Dedicated Ticket Page Action Listeners
  const tpBtnBack = document.getElementById('tpBtnBack');
  if (tpBtnBack) {
    tpBtnBack.addEventListener('click', () => switchMainView('board'));
  }

  const tpBtnEdit = document.getElementById('tpBtnEdit');
  if (tpBtnEdit) {
    tpBtnEdit.addEventListener('click', () => {
      toggleCardInlineEdit('customer', true);
      const custInput = document.getElementById('tpInputCustName');
      if (custInput) {
        custInput.focus();
        custInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  const tpBtnAdvance = document.getElementById('tpBtnAdvance');
  if (tpBtnAdvance) {
    tpBtnAdvance.addEventListener('click', () => {
      if (state.currentEditingTicket) openAdvanceModal(state.currentEditingTicket.id);
    });
  }

  const tpBtnBypass = document.getElementById('tpBtnBypass');
  if (tpBtnBypass) {
    tpBtnBypass.addEventListener('click', () => {
      if (state.currentEditingTicket) openBypassModal(state.currentEditingTicket.id);
    });
  }

  const tpBtnDelete = document.getElementById('tpBtnDelete');
  if (tpBtnDelete) {
    tpBtnDelete.addEventListener('click', handleDeleteTicketFromPage);
  }

  // Copy Buttons on Dedicated Ticket Page
  const tpBtnCopyTicketNo = document.getElementById('tpBtnCopyTicketNo');
  if (tpBtnCopyTicketNo) {
    tpBtnCopyTicketNo.addEventListener('click', (e) => {
      e.stopPropagation();
      const num = document.getElementById('tpTicketNumber')?.textContent;
      copyToClipboardWithFeedback(num, 'Ticket Number');
    });
  }

  const tpBtnCopyPhone = document.getElementById('tpBtnCopyPhone');
  if (tpBtnCopyPhone) {
    tpBtnCopyPhone.addEventListener('click', (e) => {
      e.stopPropagation();
      const ph = document.getElementById('tpCustomerPhoneDisp')?.textContent;
      copyToClipboardWithFeedback(ph, 'Customer Phone');
    });
  }

  const tpBtnCopyChassis = document.getElementById('tpBtnCopyChassis');
  if (tpBtnCopyChassis) {
    tpBtnCopyChassis.addEventListener('click', (e) => {
      e.stopPropagation();
      const ch = document.getElementById('tpChassisNumberDisp')?.textContent;
      copyToClipboardWithFeedback(ch, 'Chassis / VIN');
    });
  }

  const tpBtnCopySurveyorPhone = document.getElementById('tpBtnCopySurveyorPhone');
  if (tpBtnCopySurveyorPhone) {
    tpBtnCopySurveyorPhone.addEventListener('click', (e) => {
      e.stopPropagation();
      const sph = document.getElementById('tpSurveyorPhoneDisp')?.textContent;
      copyToClipboardWithFeedback(sph, 'Surveyor Phone');
    });
  }

  // Safe Edit Ticket Modal Listeners
  const formEditTicketPage = document.getElementById('formEditTicketPage');
  if (formEditTicketPage) {
    formEditTicketPage.addEventListener('submit', handleEditTicketPageSubmit);
  }

  const meditBtnToggleLock = document.getElementById('meditBtnToggleLock');
  if (meditBtnToggleLock) {
    meditBtnToggleLock.addEventListener('click', toggleCrmFieldsLock);
  }

  // Parts Status & Delay Note Form Listeners
  const formPartsNote = document.getElementById('formPartsNote');
  if (formPartsNote) {
    formPartsNote.addEventListener('submit', handlePartsNoteSubmit);
  }
  const btnPartsNoteClear = document.getElementById('btnPartsNoteClear');
  if (btnPartsNoteClear) {
    btnPartsNoteClear.addEventListener('click', () => {
      const ticketId = document.getElementById('partsNoteTicketId')?.value;
      if (ticketId) clearPartsNote(ticketId);
    });
  }
  document.querySelectorAll('#modalPartsNote .preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const prefix = btn.dataset.prefix;
      const textarea = document.getElementById('partsNoteTextInput');
      if (!textarea) return;
      if (!textarea.value.trim()) {
        textarea.value = prefix;
      } else if (!textarea.value.includes(prefix)) {
        textarea.value = prefix + ' - ' + textarea.value;
      }
      textarea.focus();
    });
  });

  const tpBtnPartsNote = document.getElementById('tpBtnPartsNote');
  if (tpBtnPartsNote) {
    tpBtnPartsNote.addEventListener('click', () => {
      if (state.currentEditingTicket) openPartsNoteModal(state.currentEditingTicket.id);
    });
  }

  // EOD Action
  document.getElementById('btnTriggerEodPush').addEventListener('click', triggerEodReportAction);
  document.getElementById('btnHidePreview').addEventListener('click', () => {
    document.getElementById('eodPayloadPreview').style.display = 'none';
  });

  // Setup Autocomplete on New Ticket Inputs
  // Setup Autocomplete on New Ticket Inputs
  setupCustomerAutocomplete();

  // Setup Alt+F Lightweight Suggestive Search
  setupSuggestiveSearch();

  // Rollback Stage Form Submit
  const formRollback = document.getElementById('formRollbackStage');
  if (formRollback) {
    formRollback.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticketId = document.getElementById('rollbackTicketId').value;
      const targetStageId = parseInt(document.getElementById('rollbackTargetStageId').value, 10);
      const confirmText = document.getElementById('rollbackConfirmInput').value.trim();

      try {
        const res = await fetch(`/api/tickets/${ticketId}/rollback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetStageId, confirmText })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to rollback stage');
        }
        closeModal('modalRollbackStage');
        showToast('Ticket rolled back successfully. Subsequent entries cleared.', 'success');
        await refreshTickets();
        if (state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
          openDetailDrawer(ticketId);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Skip Stages Form Submit
  const formSkip = document.getElementById('formSkipStages');
  if (formSkip) {
    formSkip.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticketId = document.getElementById('skipTicketId').value;
      const targetStageId = parseInt(document.getElementById('skipTargetStageId').value, 10);
      const reason = document.getElementById('skipReasonInput').value.trim();

      try {
        const res = await fetch(`/api/tickets/${ticketId}/skip-to-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetStageId, reason })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to skip stages');
        }
        closeModal('modalSkipStages');
        showToast('Stages fast-forwarded successfully. Skipped stages marked in timeline.', 'success');
        await refreshTickets();
        if (state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
          openDetailDrawer(ticketId);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Right-Click Context Menu Listeners
  const ctxViewPage = document.getElementById('ctxActionViewPage');
  if (ctxViewPage) {
    ctxViewPage.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) openTicketPage(tid);
    });
  }

  const ctxTimeline = document.getElementById('ctxActionTimeline');
  if (ctxTimeline) {
    ctxTimeline.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) openDetailDrawer(tid, 'timeline');
    });
  }

  const ctxComment = document.getElementById('ctxActionComment');
  if (ctxComment) {
    ctxComment.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) openDetailDrawer(tid, 'notes');
    });
  }

  const ctxBypass = document.getElementById('ctxActionBypass');
  if (ctxBypass) {
    ctxBypass.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) openBypassModal(tid);
    });
  }

  const ctxPartsOrder = document.getElementById('ctxActionPartsOrder');
  if (ctxPartsOrder) {
    ctxPartsOrder.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) openManagePartsModal(tid);
    });
  }

  const ctxPartsArrival = document.getElementById('ctxActionPartsArrivalDetails');
  if (ctxPartsArrival) {
    ctxPartsArrival.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) openPartsArrivalDetailsModal(tid);
    });
  }

  const ctxDelete = document.getElementById('ctxActionDelete');
  if (ctxDelete) {
    ctxDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = currentContextMenuTicketId;
      closeTicketContextMenu();
      if (tid) window.deleteTicket(tid);
    });
  }

  // Hook up Manage Parts modal Add button & Mark All Arrived button
  const btnMgmtAdd = document.getElementById('btnMgmtAddPart');
  if (btnMgmtAdd) {
    btnMgmtAdd.addEventListener('click', async () => {
      const ticketId = document.getElementById('managePartsTicketId')?.value;
      if (!ticketId) return;

      const nameInp = document.getElementById('mgmtNewPartName');
      const codeInp = document.getElementById('mgmtNewPartCode');
      const qtyInp = document.getElementById('mgmtNewPartQty');
      const costInp = document.getElementById('mgmtNewPartCost');

      const name = nameInp ? nameInp.value.trim() : '';
      if (!name) {
        showToast('Please enter part item name', 'warning');
        if (nameInp) nameInp.focus();
        return;
      }

      const code = codeInp ? codeInp.value.trim() : null;
      const qty = qtyInp ? Math.max(1, Number(qtyInp.value) || 1) : 1;
      const cost = costInp ? Math.max(0, Number(costInp.value) || 0) : 0;

      try {
        const targetTicket = (state.tickets || []).find(t => String(t.id) === String(ticketId));
        const initStatus = (targetTicket && Number(targetTicket.current_stage_id) >= 6) ? 'ORDERED' : 'PENDING_ORDER';

        const res = await fetch(`/api/tickets/${ticketId}/parts/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            part_name: name,
            part_code: code,
            quantity: qty,
            unit_cost: cost,
            total_cost: qty * cost,
            part_status: initStatus
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add part');
        }
        showToast(`Added part: ${name}`, 'success');
        if (nameInp) nameInp.value = '';
        if (codeInp) codeInp.value = '';
        if (costInp) costInp.value = '';
        if (qtyInp) qtyInp.value = '1';
        await refreshManagePartsTable(ticketId);
        await refreshTickets();
        if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
          openTicketPage(ticketId);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const btnMgmtAllArrived = document.getElementById('btnMgmtMarkAllArrived');
  if (btnMgmtAllArrived) {
    btnMgmtAllArrived.addEventListener('click', async () => {
      const ticketId = document.getElementById('managePartsTicketId')?.value;
      if (!ticketId) return;

      try {
        const res = await fetch(`/api/tickets/${ticketId}/parts/batch-arrival`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (!res.ok) throw new Error('Failed to mark parts arrived');
        showToast('✓ All parts marked as arrived with timestamp', 'success');
        await refreshManagePartsTable(ticketId);
        await refreshTickets();
        if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
          openTicketPage(ticketId);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Close context menu on outside click or window scroll
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ticketContextMenu')) {
      closeTicketContextMenu();
    }
  });
  window.addEventListener('scroll', closeTicketContextMenu, true);
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Alt+F: Focus Suggestive Search Input in Top Nav
    if (e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
      }
    }

    // Alt+N or Ctrl+N: New Ticket
    if ((e.altKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openNewTicketModal();
    }

    // Ctrl+B: Toggle Navigation Sidebar
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleSidebar();
    }

    // Escape: Close active modal or drawer or search box
    if (e.key === 'Escape') {
      closeAllModals();
    }

    // Ctrl+Enter: Submit active form
    if (e.ctrlKey && e.key === 'Enter') {
      const activeModal = document.querySelector('.modal-overlay[style*="display: flex"]');
      if (activeModal) {
        const form = activeModal.querySelector('form');
        if (form) {
          form.requestSubmit();
        }
      }
    }
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  const drawer = document.getElementById('drawerDetail');
  if (drawer) drawer.style.display = 'none';
  document.body.style.overflow = '';
  const searchSuggest = document.getElementById('searchSuggestBox');
  if (searchSuggest) searchSuggest.style.display = 'none';
  hideAllSuggestions();
  closeTicketContextMenu();
}

// ====================================================
// LIGHTWEIGHT SUGGESTIVE SEARCH (ALT+F)
// ====================================================
function setupSuggestiveSearch() {
  const searchInput = document.getElementById('searchInput');
  const suggestBox = document.getElementById('searchSuggestBox');
  if (!searchInput || !suggestBox) return;

  let activeIndex = -1;

  function getSuggestions(query) {
    const q = query.toLowerCase().trim();
    const suggestions = new Map();

    state.tickets.forEach(t => {
      if (t.ticket_number && t.ticket_number.toLowerCase().includes(q)) {
        suggestions.set(`ticket:${t.ticket_number}`, { text: t.ticket_number, type: 'Ticket #' });
      }
      if (t.customer_name && t.customer_name.toLowerCase().includes(q)) {
        suggestions.set(`cust:${t.customer_name}`, { text: t.customer_name, type: 'Customer' });
      }
      if (t.customer_phone && t.customer_phone.includes(q)) {
        suggestions.set(`phone:${t.customer_phone}`, { text: t.customer_phone, type: 'Phone' });
      }
      if (t.vehicle_name && t.vehicle_name.toLowerCase().includes(q)) {
        suggestions.set(`veh:${t.vehicle_name}`, { text: t.vehicle_name, type: 'Model' });
      }
      if (t.model && t.model.toLowerCase().includes(q)) {
        suggestions.set(`model:${t.model}`, { text: t.model, type: 'Model' });
      }
      if (t.color && t.color.toLowerCase().includes(q)) {
        suggestions.set(`color:${t.color}`, { text: t.color, type: 'Color' });
      }
      if (t.vehicle_no && t.vehicle_no.toLowerCase().includes(q)) {
        suggestions.set(`reg:${t.vehicle_no}`, { text: t.vehicle_no, type: 'Reg No' });
      }
      if (t.chassis_number && t.chassis_number.toLowerCase().includes(q)) {
        suggestions.set(`vin:${t.chassis_number}`, { text: t.chassis_number, type: 'VIN' });
      }
      if (t.stageName && t.stageName.toLowerCase().includes(q)) {
        suggestions.set(`stage:${t.stageName}`, { text: t.stageName, type: 'Stage' });
      }
      if (t.outlet_name && t.outlet_name.toLowerCase().includes(q)) {
        suggestions.set(`branch:${t.outlet_name}`, { text: t.outlet_name, type: 'Branch' });
      }
      if (t.branch_name && t.branch_name.toLowerCase().includes(q)) {
        suggestions.set(`branch:${t.branch_name}`, { text: t.branch_name, type: 'Branch' });
      }
    });

    return Array.from(suggestions.values()).slice(0, 8);
  }

  function renderSuggestions(query) {
    const items = getSuggestions(query);
    if (items.length === 0) {
      suggestBox.style.display = 'none';
      return;
    }

    suggestBox.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'search-suggest-header';
    header.textContent = `Word Suggestions (${items.length})`;
    suggestBox.appendChild(header);

    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'search-suggest-item' + (idx === activeIndex ? ' active' : '');
      row.innerHTML = `
        <span style="font-weight: 600; font-size: 12.5px; color: var(--text-main);">${escapeHtml(item.text)}</span>
        <span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-subtle); background: var(--bg-subtle); padding: 1.5px 6px; border-radius: 3px; border: 1px solid var(--border-medium);">${item.type}</span>
      `;
      row.addEventListener('click', () => {
        searchInput.value = item.text;
        state.searchQuery = item.text;
        suggestBox.style.display = 'none';
        refreshTickets();
      });
      suggestBox.appendChild(row);
    });

    suggestBox.style.display = 'block';
  }

  searchInput.addEventListener('input', () => {
    activeIndex = -1;
    const q = searchInput.value.trim();
    state.searchQuery = q;
    refreshTickets();
    if (q.length > 0) {
      renderSuggestions(q);
    } else {
      suggestBox.style.display = 'none';
    }
  });

  searchInput.addEventListener('focus', () => {
    const q = searchInput.value.trim();
    if (q.length > 0) {
      renderSuggestions(q);
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = suggestBox.querySelectorAll('.search-suggest-item');
    if (e.key === 'ArrowDown') {
      if (items.length === 0 || suggestBox.style.display === 'none') return;
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'ArrowUp') {
      if (items.length === 0 || suggestBox.style.display === 'none') return;
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].click();
      } else {
        suggestBox.style.display = 'none';
      }
    } else if (e.key === 'Escape') {
      suggestBox.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-group')) {
      suggestBox.style.display = 'none';
    }
  });
}

function openRollbackModal(ticket, targetStageId) {
  const modal = document.getElementById('modalRollbackStage');
  if (!modal) return;

  const targetStageConfig = state.stages.find(s => s.id === targetStageId);
  const targetStageName = targetStageConfig ? targetStageConfig.name : `Stage #${targetStageId}`;

  document.getElementById('rollbackTicketId').value = ticket.id;
  document.getElementById('rollbackTargetStageId').value = targetStageId;

  document.getElementById('rollbackWarningText').innerHTML = `
    Moving ticket <strong>${ticket.ticket_number}</strong> backwards from <strong>#${ticket.current_stage_id} (${escapeHtml(ticket.stageName)})</strong> to <strong>#${targetStageId} (${escapeHtml(targetStageName)})</strong> will <strong>PERMANENTLY ERASE</strong> all progress, estimates, survey entries, and stage logs entered after Stage #${targetStageId}.
  `;

  const input = document.getElementById('rollbackConfirmInput');
  const btn = document.getElementById('btnConfirmRollback');
  input.value = '';
  btn.disabled = true;

  input.oninput = () => {
    btn.disabled = (input.value.trim().toUpperCase() !== 'CONFIRM');
  };

  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}

function openSkipModal(ticket, targetStageId) {
  const modal = document.getElementById('modalSkipStages');
  if (!modal) return;

  const targetStageConfig = state.stages.find(s => s.id === targetStageId);
  const targetStageName = targetStageConfig ? targetStageConfig.name : `Stage #${targetStageId}`;

  document.getElementById('skipTicketId').value = ticket.id;
  document.getElementById('skipTargetStageId').value = targetStageId;

  document.getElementById('skipWarningText').innerHTML = `
    You are skipping ticket <strong>${ticket.ticket_number}</strong> from <strong>#${ticket.current_stage_id} (${escapeHtml(ticket.stageName)})</strong> directly to <strong>#${targetStageId} (${escapeHtml(targetStageName)})</strong>.
    Intermediate stages (#${ticket.current_stage_id + 1} to #${targetStageId - 1}) will be marked as <strong>SKIPPED</strong> in the timeline.
  `;

  modal.style.display = 'flex';
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
  hideAllSuggestions();
}

// ====================================================
// RECIPROCAL AUTOCOMPLETE FOR CUSTOMERS & VEHICLES
// ====================================================
function setupCustomerAutocomplete() {
  // Customer & Identification inputs (Name, Phone, Plate No, VIN)
  const customerInputs = [
    { el: document.getElementById('newCustomerName'), box: document.getElementById('suggestCustomerName') },
    { el: document.getElementById('newCustomerPhone'), box: document.getElementById('suggestCustomerPhone') },
    { el: document.getElementById('newVehicleNo'), box: document.getElementById('suggestVehicleNo') },
    { el: document.getElementById('newChassisNumber'), box: document.getElementById('suggestChassisNumber') }
  ];

  customerInputs.forEach(({ el, box }) => {
    if (!el || !box) return;
    let timer;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      const val = el.value.trim();
      if (val.length < 2) {
        box.style.display = 'none';
        return;
      }

      timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/lookup/customers?q=${encodeURIComponent(val)}`);
          const results = await res.json();
          renderCustomerSuggestions(results, box);
        } catch (err) {
          console.error('Customer autocomplete error:', err);
        }
      }, 200);
    });

    el.addEventListener('blur', () => {
      setTimeout(() => { box.style.display = 'none'; }, 250);
    });
  });

  // Dedicated Vehicle Model Input
  const vehModelInput = document.getElementById('newVehicleName');
  const vehModelBox = document.getElementById('suggestVehicleName');
  if (vehModelInput && vehModelBox) {
    let vehTimer;
    const fetchVehicles = () => {
      clearTimeout(vehTimer);
      const val = vehModelInput.value.trim();
      const custPhone = (document.getElementById('newCustomerPhone')?.value || '').trim();
      vehTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/lookup/vehicle-models?q=${encodeURIComponent(val)}&customerPhone=${encodeURIComponent(custPhone)}`);
          const results = await res.json();
          renderVehicleSuggestions(results, vehModelBox);
        } catch (err) {
          console.error('Vehicle model lookup error:', err);
        }
      }, 120);
    };

    vehModelInput.addEventListener('input', fetchVehicles);
    vehModelInput.addEventListener('focus', fetchVehicles);
    vehModelInput.addEventListener('blur', () => {
      setTimeout(() => { vehModelBox.style.display = 'none'; }, 250);
    });
  }

  // Dedicated Vehicle Color Input
  const colorInput = document.getElementById('newVehicleColor');
  const colorBox = document.getElementById('suggestVehicleColor');
  if (colorInput && colorBox) {
    let colorTimer;
    const fetchColors = () => {
      clearTimeout(colorTimer);
      const val = colorInput.value.trim();
      const currentModel = (document.getElementById('newVehicleName')?.value || '').trim();
      colorTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/lookup/vehicle-colors?model=${encodeURIComponent(currentModel)}`);
          let colors = await res.json();
          if (val) {
            colors = colors.filter(c => c.toLowerCase().includes(val.toLowerCase()));
          }
          renderColorSuggestions(colors, colorBox);
        } catch (err) {
          console.error('Color lookup error:', err);
        }
      }, 100);
    };

    colorInput.addEventListener('input', fetchColors);
    colorInput.addEventListener('focus', fetchColors);
    colorInput.addEventListener('blur', () => {
      setTimeout(() => { colorBox.style.display = 'none'; }, 250);
    });
  }
}

function positionSuggestionBox(box) {
  if (!box || !box.parentElement) return;
  const rect = box.parentElement.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 220) {
    box.classList.add('suggest-up');
  } else {
    box.classList.remove('suggest-up');
  }
}

function renderCustomerSuggestions(list, box) {
  if (!list || list.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.innerHTML = '';
  list.forEach(item => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <div class="sugg-primary">${escapeHtml(item.customer_name)} • ${escapeHtml(item.primary_phone)}</div>
      <div class="sugg-secondary">${item.model || item.vehicle_name ? escapeHtml(item.model || item.vehicle_name) : 'Vehicle'}${item.color ? ' [' + escapeHtml(item.color) + ']' : ''} ${item.vehicle_no ? `[${escapeHtml(item.vehicle_no)}]` : ''} • VIN: ${item.chassis_no ? escapeHtml(item.chassis_no) : 'N/A'}</div>
    `;

    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Reciprocal auto-fill of all linked fields!
      document.getElementById('newCustomerName').value = item.customer_name || '';
      document.getElementById('newCustomerPhone').value = item.primary_phone || '';
      if (item.model || item.vehicle_name) document.getElementById('newVehicleName').value = item.model || item.vehicle_name;
      if (item.color) {
        const colEl = document.getElementById('newVehicleColor');
        if (colEl) colEl.value = item.color;
      }
      if (item.vehicle_no) document.getElementById('newVehicleNo').value = item.vehicle_no;
      if (item.chassis_no) document.getElementById('newChassisNumber').value = item.chassis_no;

      hideAllSuggestions();
      showToast(`Autofilled profile for ${item.customer_name}`, 'info');
    });

    box.appendChild(div);
  });

  positionSuggestionBox(box);
  box.style.display = 'block';
}

function renderVehicleSuggestions(list, box) {
  if (!list || list.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.innerHTML = '';
  list.forEach(item => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';

    if (item.is_customer_vehicle) {
      div.innerHTML = `
        <div class="sugg-primary" style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: 700; color: var(--honda-red, #dc2626);">${escapeHtml(item.model)} ${item.vehicle_no ? `[${escapeHtml(item.vehicle_no)}]` : ''}</span>
          <span class="badge" style="font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 6px; background: #e0f2fe; color: #0369a1;">Customer's Vehicle</span>
        </div>
        <div class="sugg-secondary">Color: ${item.color ? escapeHtml(item.color) : 'Not specified'} • VIN: ${item.chassis_no ? escapeHtml(item.chassis_no) : 'N/A'}</div>
      `;

      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const modelEl = document.getElementById('newVehicleName');
        const colorEl = document.getElementById('newVehicleColor');
        const plateEl = document.getElementById('newVehicleNo');
        const vinEl = document.getElementById('newChassisNumber');

        if (modelEl) modelEl.value = item.model;
        if (colorEl && item.color) colorEl.value = item.color;
        if (plateEl && item.vehicle_no) plateEl.value = item.vehicle_no;
        if (vinEl && item.chassis_no) vinEl.value = item.chassis_no;

        hideAllSuggestions();
        showToast(`Selected customer's vehicle: ${item.model}`, 'info');
      });
    } else {
      const colorsSnippet = item.common_colors && item.common_colors.length
        ? ` • Colors: ${escapeHtml(item.common_colors.slice(0, 3).join(', '))}`
        : '';
      const fleetSnippet = item.count ? ` (${item.count} in fleet)` : '';

      div.innerHTML = `
        <div class="sugg-primary" style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: 600;">${escapeHtml(item.model)}</span>
          <span class="badge" style="font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 6px; background: var(--bg-subtle); border: 1px solid var(--border-light); color: var(--text-subtle);">${escapeHtml(item.category || 'Two-Wheeler')}</span>
        </div>
        <div class="sugg-secondary">${escapeHtml(item.family || 'Honda')}${colorsSnippet}${fleetSnippet}</div>
      `;

      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const modelEl = document.getElementById('newVehicleName');
        if (modelEl) modelEl.value = item.model;

        // If color input is empty and vehicle has 1 prominent color, suggest or fill
        const colorEl = document.getElementById('newVehicleColor');
        if (colorEl && !colorEl.value.trim() && item.common_colors && item.common_colors.length === 1) {
          colorEl.value = item.common_colors[0];
        }

        hideAllSuggestions();
      });
    }

    box.appendChild(div);
  });

  positionSuggestionBox(box);
  box.style.display = 'block';
}

function renderColorSuggestions(list, box) {
  if (!list || list.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.innerHTML = '';
  list.slice(0, 8).forEach(col => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `<div class="sugg-primary" style="font-size: 12px;">${escapeHtml(col)}</div>`;

    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const colorEl = document.getElementById('newVehicleColor');
      if (colorEl) colorEl.value = col;
      hideAllSuggestions();
    });

    box.appendChild(div);
  });

  positionSuggestionBox(box);
  box.style.display = 'block';
}

function hideAllSuggestions() {
  document.querySelectorAll('.suggestions-box').forEach(b => b.style.display = 'none');
}

// ====================================================
// NEW TICKET INTAKE
// ====================================================
function openNewTicketModal() {
  const modal = document.getElementById('modalNewTicket');
  document.getElementById('formNewTicket').reset();

  // Set default arrival time to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('newArrivalDate').value = now.toISOString().slice(0, 16);

  modal.style.display = 'flex';
  setTimeout(() => {
    document.getElementById('newCustomerName').focus();
  }, 100);
}

async function handleNewTicketSubmit(e) {
  e.preventDefault();
  if (state.isSubmittingTicket) return;

  const submitBtn = document.getElementById('btnSubmitNewTicket') || (e.target ? e.target.querySelector('button[type="submit"]') : null);
  const origBtnText = submitBtn ? submitBtn.innerHTML : '';

  state.isSubmittingTicket = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> <span>Creating Ticket...</span>';
  }
  showGlobalLoader();

  const payload = {
    outletId: document.getElementById('newOutletId').value,
    arrivalDate: document.getElementById('newArrivalDate').value,
    customerName: document.getElementById('newCustomerName').value,
    customerPhone: document.getElementById('newCustomerPhone').value,
    vehicleName: document.getElementById('newVehicleName').value,
    model: document.getElementById('newVehicleName').value,
    color: document.getElementById('newVehicleColor') ? document.getElementById('newVehicleColor').value : null,
    vehicleNo: document.getElementById('newVehicleNo').value,
    chassisNumber: document.getElementById('newChassisNumber').value
  };

  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create ticket');
    }

    const created = await res.json();
    closeModal('modalNewTicket');
    showToast(`Created Ticket ${created.ticket_number} (Stage 1: Vehicle Arrival)`, 'success');
    await refreshTickets();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    state.isSubmittingTicket = false;
    hideGlobalLoader();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnText;
    }
  }
}

// ====================================================
// PHYSICAL STOCK & LOCATOR HOVER HELPERS
// ====================================================
function renderPartStockHoverPill(part, currentCost = null) {
  if (!part) return '';
  const stockQty = Number(part.stock_qty || 0);
  const locText = part.locators ? String(part.locators).trim() : '';
  const stockClass = stockQty > 3 ? 'in-stock' : (stockQty > 0 ? 'low-stock' : 'out-stock');
  const pillText = stockQty > 0 ? `${stockQty} in stock` : 'Out of stock';

  return `
    <div class="part-stock-pill-wrap" tabindex="0" title="Physical Inventory: ${stockQty} in stock${locText ? ' • Locators: ' + escapeHtml(locText) : ''}. Click QTY to pick warehouse locators and batch prices.">
      <span class="part-stock-pill ${stockClass}">
        <span class="stock-dot"></span>
        <span class="stock-pill-text">${pillText}</span>
        ${locText ? `<span class="stock-pill-loc-icon">📍</span>` : ''}
      </span>
    </div>
  `;
}

function renderPartUnregisteredPill() {
  return `
    <div class="part-stock-pill-wrap" tabindex="0">
      <span class="part-stock-pill not-catalog">
        <span class="stock-dot"></span>
        <span class="stock-pill-text">Catalog Only</span>
      </span>
    </div>
  `;
}

// ====================================================
// WAREHOUSE LOCATORS & BATCH QUANTITY PICKER
// ====================================================
let activeLocatorPickerEl = null;
let activeLocatorBackdropEl = null;

function closePartLocatorPicker() {
  if (activeLocatorPickerEl) {
    activeLocatorPickerEl.remove();
    activeLocatorPickerEl = null;
  }
  if (activeLocatorBackdropEl) {
    activeLocatorBackdropEl.remove();
    activeLocatorBackdropEl = null;
  }
}

async function openPartLocatorPicker({
  tr = null,
  qtyInput,
  costInput,
  nameInput,
  partCode = '',
  recalculateTotal = () => {}
}) {
  closePartLocatorPicker();

  const code = partCode || tr?.dataset?.partCode || nameInput?.dataset?.selectedCode || '';
  const name = nameInput?.value?.trim() || '';

  if (!name && !code) {
    showToast('Please search and select a part from the catalog first.', 'info');
    return;
  }

  let reqQty = Math.max(1, parseInt(qtyInput?.value, 10) || 1);
  const currentUnitCost = parseFloat(costInput?.value) || 0;

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'part-loc-picker-backdrop';
  backdrop.addEventListener('click', closePartLocatorPicker);
  document.body.appendChild(backdrop);
  activeLocatorBackdropEl = backdrop;

  // Create popover container
  const popover = document.createElement('div');
  popover.className = 'part-loc-picker-popover';
  popover.innerHTML = `
    <div class="plp-header">
      <div>
        <div class="plp-title">📦 Pick Locators & Batch Stock</div>
        <div class="plp-part-title">
          ${escapeHtml(name)}
          ${code ? `<span class="plp-sku-badge">${escapeHtml(code)}</span>` : ''}
        </div>
      </div>
      <button type="button" class="plp-btn-close">&times;</button>
    </div>
    <div style="padding: 24px; text-align: center; color: #64748b;">
      <div class="spinner-sm" style="display:inline-block; margin-bottom: 8px;"></div>
      <div style="font-size: 11.5px; font-weight: 600;">Loading warehouse locators with stock...</div>
    </div>
  `;
  document.body.appendChild(popover);
  activeLocatorPickerEl = popover;

  // Smart position anchored to qtyInput
  function updatePosition() {
    if (!popover || !qtyInput) return;
    const rect = qtyInput.getBoundingClientRect();
    const popoverWidth = Math.min(420, window.innerWidth - 24);
    popover.style.width = `${popoverWidth}px`;

    let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
    if (left < 12) left = 12;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }

    let top = rect.bottom + 8;
    const estHeight = 400;
    if (top + estHeight > window.innerHeight && rect.top > estHeight) {
      top = Math.max(10, rect.top - estHeight - 8);
    }
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }
  updatePosition();

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closePartLocatorPicker();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  popover.querySelector('.plp-btn-close').addEventListener('click', closePartLocatorPicker);

  // Fetch positive quantity locators for this part
  let locators = [];
  try {
    const res = await fetch(`/api/lookup/part-locators?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`);
    if (res.ok) {
      locators = await res.json();
    }
  } catch (err) {
    console.error('Failed to load part locators:', err);
  }

  // Filter to strictly ensure quantity > 0
  locators = (locators || []).filter(l => Number(l.available_qty) > 0);
  const totalAvailableStock = locators.reduce((sum, l) => sum + (Number(l.available_qty) || 0), 0);

  // Initialize pick allocation for each locator
  let remainingToAllocate = reqQty;
  locators.forEach(loc => {
    loc.available_qty = Number(loc.available_qty) || 0;
    loc.unit_price = Number(loc.unit_price) || currentUnitCost || 0;
    if (remainingToAllocate > 0) {
      const take = Math.min(loc.available_qty, remainingToAllocate);
      loc.pick_qty = take;
      remainingToAllocate -= take;
    } else {
      loc.pick_qty = 0;
    }
  });

  function renderPicker() {
    const totalPicked = locators.reduce((sum, l) => sum + (l.pick_qty || 0), 0);
    let totalCost = 0;
    locators.forEach(l => {
      if (l.pick_qty > 0) {
        totalCost += l.pick_qty * l.unit_price;
      }
    });

    let avgUnitPrice = 0;
    if (totalPicked > 0) {
      avgUnitPrice = totalCost / totalPicked;
    } else if (locators.length > 0) {
      avgUnitPrice = locators[0].unit_price;
    } else {
      avgUnitPrice = currentUnitCost;
    }

    let pickClass = 'is-matched';
    if (totalPicked < reqQty) pickClass = 'is-under';
    else if (totalPicked > reqQty) pickClass = 'is-over';

    const locatorsHtml = locators.length > 0 ? locators.map((loc, idx) => {
      const isChecked = (loc.pick_qty || 0) > 0;
      return `
        <div class="plp-loc-row ${isChecked ? 'is-selected' : ''}" data-idx="${idx}">
          <label class="plp-check-wrap">
            <input type="checkbox" class="plp-loc-check" data-idx="${idx}" ${isChecked ? 'checked' : ''}>
          </label>
          <div class="plp-loc-info">
            <span class="plp-loc-name" title="${escapeHtml(loc.locator)}">📍 ${escapeHtml(loc.locator)}</span>
            <span class="plp-loc-avail-pill">
              <span class="stock-dot"></span> ${loc.available_qty} in stock
            </span>
          </div>
          <div class="plp-price-col">
            <span class="plp-unit-price">₹${Number(loc.unit_price).toLocaleString('en-IN')}</span>
            <span class="plp-price-label">batch price</span>
          </div>
          <div class="plp-pick-stepper">
            <button type="button" class="plp-pqty-btn" data-action="dec" data-idx="${idx}">−</button>
            <input type="number" class="plp-pick-qty-input" data-idx="${idx}" min="0" max="${loc.available_qty}" value="${loc.pick_qty || 0}">
            <button type="button" class="plp-pqty-btn" data-action="inc" data-idx="${idx}">+</button>
          </div>
        </div>
      `;
    }).join('') : `
      <div class="plp-empty-locators">
        <div class="plp-empty-loc-title">No Physical Locators with Stock</div>
        <div style="font-size: 11px;">There is currently 0 stock recorded in warehouse bins for this item. You can specify the required quantity above and set the unit price manually.</div>
      </div>
    `;

    popover.innerHTML = `
      <div class="plp-header">
        <div>
          <div class="plp-title">📦 Pick Locators & Batch Stock</div>
          <div class="plp-part-title">
            ${escapeHtml(name)}
            ${code ? `<span class="plp-sku-badge">${escapeHtml(code)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="plp-btn-close">&times;</button>
      </div>

      <div class="plp-summary-bar">
        <div class="plp-stat-item">
          <span class="plp-stat-label">Stock Available</span>
          <span class="plp-stat-val val-stock">${totalAvailableStock} in stock</span>
        </div>
        <div class="plp-stat-item">
          <span class="plp-stat-label">Required Qty</span>
          <div class="plp-stepper">
            <button type="button" class="plp-step-btn" data-step="-1">−</button>
            <input type="number" class="plp-req-qty-input" min="1" value="${reqQty}">
            <button type="button" class="plp-step-btn" data-step="1">+</button>
          </div>
        </div>
        <div class="plp-stat-item">
          <span class="plp-stat-label">Selected Pick</span>
          <span class="plp-stat-val val-picked ${pickClass}">
            ${totalPicked} / ${reqQty}
          </span>
        </div>
      </div>

      <div class="plp-body">
        <div class="plp-section-header">
          <span>Warehouse Locators (${locators.length} with stock):</span>
          ${locators.length > 1 ? `<button type="button" class="plp-quick-action-btn" id="plpAutoFillBtn">Auto-fill to Required</button>` : ''}
        </div>
        <div class="plp-locators-list">
          ${locatorsHtml}
        </div>
      </div>

      <div class="plp-calc-bar">
        <div class="plp-calc-text">
          <span class="plp-calc-title">Average Unit Price (Selected):</span>
          <span class="plp-calc-sub">${totalPicked > 0 ? `Based on ${totalPicked} units across selected locators` : `Default catalog price`}</span>
        </div>
        <div class="plp-avg-val">₹${avgUnitPrice.toFixed(2)}</div>
      </div>

      <div class="plp-footer">
        <div class="plp-hint-text">💡 User can edit the unit price manually in the row anytime.</div>
        <div class="plp-actions">
          <button type="button" class="btn btn-outline btn-compact plp-btn-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-compact plp-btn-apply">
            Apply to Row
          </button>
        </div>
      </div>
    `;

    // Re-bind close & cancel
    popover.querySelector('.plp-btn-close').addEventListener('click', closePartLocatorPicker);
    popover.querySelector('.plp-btn-cancel').addEventListener('click', closePartLocatorPicker);

    // Required Qty Stepper
    const reqInput = popover.querySelector('.plp-req-qty-input');
    popover.querySelectorAll('.plp-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.step, 10);
        reqQty = Math.max(1, reqQty + delta);
        renderPicker();
      });
    });
    if (reqInput) {
      reqInput.addEventListener('change', () => {
        reqQty = Math.max(1, parseInt(reqInput.value, 10) || 1);
        renderPicker();
      });
    }

    // Auto-fill button
    const autoFillBtn = popover.querySelector('#plpAutoFillBtn');
    if (autoFillBtn) {
      autoFillBtn.addEventListener('click', () => {
        let remaining = reqQty;
        locators.forEach(l => {
          if (remaining > 0) {
            const take = Math.min(l.available_qty, remaining);
            l.pick_qty = take;
            remaining -= take;
          } else {
            l.pick_qty = 0;
          }
        });
        renderPicker();
      });
    }

    // Locator Checkbox toggle
    popover.querySelectorAll('.plp-loc-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.idx, 10);
        const loc = locators[idx];
        if (cb.checked) {
          const currentlyPicked = locators.reduce((s, l, i) => i !== idx ? s + (l.pick_qty || 0) : s, 0);
          const rem = Math.max(1, reqQty - currentlyPicked);
          loc.pick_qty = Math.min(loc.available_qty, rem);
        } else {
          loc.pick_qty = 0;
        }
        renderPicker();
      });
    });

    // Pick Qty Stepper (+ / -)
    popover.querySelectorAll('.plp-pqty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const action = btn.dataset.action;
        const loc = locators[idx];
        if (action === 'inc') {
          if (loc.pick_qty < loc.available_qty) {
            loc.pick_qty = (loc.pick_qty || 0) + 1;
          }
        } else if (action === 'dec') {
          if (loc.pick_qty > 0) {
            loc.pick_qty = (loc.pick_qty || 0) - 1;
          }
        }
        renderPicker();
      });
    });

    // Pick Qty direct input
    popover.querySelectorAll('.plp-pick-qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx, 10);
        const loc = locators[idx];
        let val = parseInt(input.value, 10) || 0;
        if (val < 0) val = 0;
        if (val > loc.available_qty) val = loc.available_qty;
        loc.pick_qty = val;
        renderPicker();
      });
    });

    // Apply button
    popover.querySelector('.plp-btn-apply').addEventListener('click', () => {
      const finalPickedQty = locators.reduce((sum, l) => sum + (l.pick_qty || 0), 0);
      const finalQty = Math.max(1, reqQty);

      if (qtyInput) {
        qtyInput.value = finalQty;
        qtyInput.classList.add('price-updated-flash');
        setTimeout(() => qtyInput.classList.remove('price-updated-flash'), 800);
      }

      if (costInput) {
        costInput.value = avgUnitPrice > 0 ? parseFloat(avgUnitPrice.toFixed(2)) : (costInput.value || 0);
        costInput.classList.add('price-updated-flash');
        setTimeout(() => costInput.classList.remove('price-updated-flash'), 800);
      }

      // Update locator summary tag on row
      const pickedLocs = locators.filter(l => (l.pick_qty || 0) > 0);
      if (tr) {
        const locTagEl = tr.querySelector('.part-row-loc-summary-tag');
        if (locTagEl) {
          if (pickedLocs.length > 0) {
            const summaryStr = pickedLocs.map(l => `${l.locator} (${l.pick_qty})`).join(', ');
            locTagEl.innerHTML = `📍 ${escapeHtml(pickedLocs.length === 1 ? `${pickedLocs[0].locator} (${pickedLocs[0].pick_qty})` : `${pickedLocs.length} Locators`)}`;
            locTagEl.title = `Picked from: ${summaryStr}`;
            locTagEl.style.display = 'inline-flex';
          } else {
            locTagEl.style.display = 'none';
          }
        }
        tr.dataset.pickedLocators = JSON.stringify(pickedLocs);
      }

      recalculateTotal();
      closePartLocatorPicker();
      showToast(`✓ Qty set to ${finalQty} • Avg Price: ₹${avgUnitPrice.toFixed(2)}`, 'success');
    });
  }

  renderPicker();
}


// ====================================================
// REUSABLE ROW-BY-ROW PARTS TABLE BUILDER
// ====================================================
function setupPartsTableBuilder({
  tbodyEl,
  totalValEl,
  costInputEl,
  addBtnEl,
  initialParts = []
}) {
  if (!tbodyEl) return { getParts: () => [] };

  tbodyEl.innerHTML = '';

  function recalculateTotal() {
    let subtotal = 0;
    const rows = tbodyEl.querySelectorAll('tr.part-builder-row');
    rows.forEach(tr => {
      const qtyInput = tr.querySelector('.part-row-qty');
      const costInput = tr.querySelector('.part-row-cost');
      const amountSpan = tr.querySelector('.part-row-amount');
      const qty = Math.max(1, parseFloat(qtyInput?.value) || 1);
      const unitCost = Math.max(0, parseFloat(costInput?.value) || 0);
      const rowTotal = Math.round(qty * unitCost);
      if (amountSpan) amountSpan.textContent = '₹' + rowTotal.toLocaleString('en-IN');
      subtotal += rowTotal;
    });

    if (totalValEl) {
      totalValEl.textContent = '₹' + Math.round(subtotal).toLocaleString('en-IN');
    }
    if (costInputEl && (!costInputEl.value || costInputEl.value == 0 || costInputEl.dataset.autocalc === 'true')) {
      costInputEl.value = Math.round(subtotal);
      costInputEl.dataset.autocalc = 'true';
    }
    return subtotal;
  }

  function addRow(partData = {}) {
    const tr = document.createElement('tr');
    tr.className = 'part-builder-row';

    const pName = partData.part_name || '';
    const pCode = partData.part_code || '';
    const pQty = partData.quantity !== undefined ? partData.quantity : 1;
    const pCost = partData.unit_cost !== undefined ? partData.unit_cost : 0;
    const pTotal = Math.round(pQty * pCost);

    if (pCode) tr.dataset.partCode = pCode;

    tr.innerHTML = `
      <td style="position: relative;">
        <div class="part-row-input-wrap">
          <input type="text" class="part-row-input part-row-name" placeholder="Search part #, name, or locator..." value="${escapeHtml(String(pName))}" autocomplete="off" data-selected-code="${escapeHtml(String(pCode))}">
          <span class="part-row-db-action"></span>
        </div>
        <div class="suggestions-box part-sugg-dropdown" style="display:none;"></div>
      </td>
      <td style="text-align: center;">
        <div class="part-qty-cell-wrap">
          <input type="number" class="part-row-input part-row-qty part-row-qty-trigger" value="${pQty}" min="1" step="1" style="text-align: center;" title="Click to pick warehouse locators and batch stock">
          <span class="part-row-loc-summary-tag" style="display:none;" title="Assigned warehouse locators"></span>
        </div>
      </td>
      <td style="text-align: right;">
        <input type="number" class="part-row-input part-row-cost" value="${pCost}" min="0" step="any" style="text-align: right;">
      </td>
      <td style="text-align: right;">
        <span class="part-row-amount">₹${pTotal.toLocaleString('en-IN')}</span>
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-part-row-remove" title="Remove part row">&times;</button>
      </td>
    `;

    const nameInput = tr.querySelector('.part-row-name');
    const suggBox = tr.querySelector('.part-sugg-dropdown');
    const dbActionEl = tr.querySelector('.part-row-db-action');
    const qtyInput = tr.querySelector('.part-row-qty');
    const costInput = tr.querySelector('.part-row-cost');
    const removeBtn = tr.querySelector('.btn-part-row-remove');

    // Populate existing picked locators if present
    if (partData.picked_locators) {
      try {
        const picked = typeof partData.picked_locators === 'string' ? JSON.parse(partData.picked_locators) : partData.picked_locators;
        if (Array.isArray(picked) && picked.length > 0) {
          tr.dataset.pickedLocators = JSON.stringify(picked);
          const locTagEl = tr.querySelector('.part-row-loc-summary-tag');
          if (locTagEl) {
            const summaryStr = picked.map(l => `${l.locator} (${l.pick_qty})`).join(', ');
            locTagEl.innerHTML = `📍 ${escapeHtml(picked.length === 1 ? `${picked[0].locator} (${picked[0].pick_qty})` : `${picked.length} Locators`)}`;
            locTagEl.title = `Picked from: ${summaryStr}`;
            locTagEl.style.display = 'inline-flex';
          }
        }
      } catch (e) { }
    }

    async function checkPartInDb(partName, partCode) {
      if (!partName && !partCode) return null;
      const cleanName = (partName || '').trim().toLowerCase();
      const cleanCode = (partCode || '').trim().toLowerCase();

      if (state.parts && state.parts.length > 0) {
        const found = state.parts.find(p =>
          (cleanCode && (p.part_code || '').toLowerCase() === cleanCode) ||
          (cleanName && (p.part_name || '').toLowerCase() === cleanName) ||
          (cleanName && (p.part_code || '').toLowerCase() === cleanName)
        );
        if (found) return found;
      }
      try {
        const term = cleanCode || cleanName;
        const res = await fetch(`/api/lookup/parts?q=${encodeURIComponent(term)}`);
        if (res.ok) {
          const list = await res.json();
          return list.find(p =>
            (cleanCode && (p.part_code || '').toLowerCase() === cleanCode) ||
            (cleanName && (p.part_name || '').toLowerCase() === cleanName) ||
            (cleanName && (p.part_code || '').toLowerCase() === cleanName)
          ) || null;
        }
      } catch (e) { }
      return null;
    }

    async function updatePartDbStatus(partName) {
      if (!dbActionEl) return;
      const clean = (partName || '').trim();
      if (!clean) {
        dbActionEl.innerHTML = '';
        nameInput.classList.remove('is-invalid-catalog');
        return;
      }
      const existingCode = nameInput.dataset.selectedCode || tr.dataset.partCode;
      const matched = await checkPartInDb(clean, existingCode);
      if (matched) {
        nameInput.classList.remove('is-invalid-catalog');
        nameInput.dataset.selectedCode = matched.part_code || '';
        tr.dataset.partCode = matched.part_code || '';
        dbActionEl.innerHTML = renderPartStockHoverPill(matched, costInput ? costInput.value : null);

        // Clicking the stock pill opens the locator picker!
        const pillWrap = dbActionEl.querySelector('.part-stock-pill-wrap');
        if (pillWrap) {
          pillWrap.style.cursor = 'pointer';
          pillWrap.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPartLocatorPicker({ tr, qtyInput, costInput, nameInput, recalculateTotal });
          });
        }
      } else {
        // Enforce strict catalog only rule: not in catalog
        nameInput.classList.add('is-invalid-catalog');
        dbActionEl.innerHTML = renderPartUnregisteredPill();
      }
    }

    async function showSuggestions(query) {
      try {
        const cleanQuery = (query || '').trim();
        const res = await fetch(`/api/lookup/parts?q=${encodeURIComponent(cleanQuery)}`);
        if (!res.ok) return;
        const parts = await res.json();
        suggBox.innerHTML = '';

        if (parts.length > 0) {
          parts.forEach(p => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'part-sugg-item';

            const stockQty = Number(p.stock_qty || 0);
            const stockClass = stockQty > 3 ? 'in-stock' : (stockQty > 0 ? 'low-stock' : 'out-stock');
            const stockText = stockQty > 0 ? `x${stockQty} in stock` : 'Out of stock';

            let pVariants = [];
            if (p.price_variants) {
              try {
                pVariants = typeof p.price_variants === 'string' ? JSON.parse(p.price_variants) : p.price_variants;
              } catch (e) {}
            }
            pVariants = Array.isArray(pVariants) ? pVariants.filter(v => v && typeof v.price === 'number' && v.price > 0) : [];

            let priceHtml = `₹${Number(p.default_cost || 0).toLocaleString('en-IN')}`;
            if (pVariants.length > 1) {
              const prices = pVariants.map(v => v.price).sort((a, b) => a - b);
              const minP = prices[0];
              const maxP = prices[prices.length - 1];
              if (minP !== maxP) {
                priceHtml = `₹${minP.toLocaleString('en-IN')} - ₹${maxP.toLocaleString('en-IN')}`;
              }
              priceHtml += `<div style="font-size: 9.5px; color: #2563eb; font-weight: 700; margin-top: 1px;">${pVariants.length} batch prices</div>`;
            }

            itemDiv.innerHTML = `
              <div class="part-sugg-left">
                <div class="part-sugg-top">
                  <span class="part-sugg-code">${escapeHtml(p.part_code || 'NO SKU')}</span>
                  <span class="part-sugg-desc" title="${escapeHtml(p.part_name || '')}">${escapeHtml(p.part_name || '')}</span>
                </div>
                <div class="part-sugg-bottom">
                  ${p.locators ? `<span class="part-sugg-loc" title="Warehouse Bins / Rack">📍 ${escapeHtml(p.locators)}</span>` : '<span style="font-size:10px; color:#94a3b8;">No Locator</span>'}
                </div>
              </div>
              <div class="part-sugg-right">
                <div class="part-sugg-price">${priceHtml}</div>
                <div class="part-sugg-stock ${stockClass}">${stockText}</div>
              </div>
            `;

            itemDiv.addEventListener('mousedown', (e) => {
              e.preventDefault();
              nameInput.value = p.part_name;
              nameInput.dataset.selectedCode = p.part_code || '';
              tr.dataset.partCode = p.part_code || '';
              costInput.value = p.default_cost || 0;
              nameInput.classList.remove('is-invalid-catalog');
              suggBox.style.display = 'none';
              updatePartDbStatus(p.part_name);
              recalculateTotal();
              // Open locator picker when selecting part from dropdown
              openPartLocatorPicker({ tr, qtyInput, costInput, nameInput, recalculateTotal });
            });
            suggBox.appendChild(itemDiv);
          });
        } else {
          // Explicit message when no catalog match is found
          const emptyNotice = document.createElement('div');
          emptyNotice.style.cssText = 'padding: 12px; font-size: 11.5px; color: #64748b; text-align: center; background: #f8fafc;';
          emptyNotice.innerHTML = `
            <div style="font-weight: 600; color: #475569; margin-bottom: 2px;">No matching physical stock items</div>
            <div style="font-size: 10.5px; color: #94a3b8;">Custom parts cannot be typed directly. Please select from the catalog.</div>
          `;
          suggBox.appendChild(emptyNotice);
        }

        suggBox.style.display = 'block';
      } catch (err) {
        console.error('Parts suggestions error:', err);
      }
    }

    nameInput.addEventListener('focus', () => {
      showSuggestions(nameInput.value);
    });

    nameInput.addEventListener('click', () => {
      showSuggestions(nameInput.value);
    });

    let debounceTimer = null;
    nameInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      nameInput.dataset.selectedCode = '';
      debounceTimer = setTimeout(() => {
        showSuggestions(nameInput.value);
        updatePartDbStatus(nameInput.value);
      }, 120);
    });

    nameInput.addEventListener('blur', () => {
      setTimeout(() => {
        suggBox.style.display = 'none';
        updatePartDbStatus(nameInput.value);
      }, 250);
    });

    if (pName) {
      updatePartDbStatus(pName);
    }

    qtyInput.addEventListener('click', () => {
      openPartLocatorPicker({ tr, qtyInput, costInput, nameInput, recalculateTotal });
    });
    qtyInput.addEventListener('focus', () => {
      if (!activeLocatorPickerEl) {
        openPartLocatorPicker({ tr, qtyInput, costInput, nameInput, recalculateTotal });
      }
    });
    qtyInput.addEventListener('input', recalculateTotal);

    const locSummaryTag = tr.querySelector('.part-row-loc-summary-tag');
    if (locSummaryTag) {
      locSummaryTag.addEventListener('click', (e) => {
        e.stopPropagation();
        openPartLocatorPicker({ tr, qtyInput, costInput, nameInput, recalculateTotal });
      });
    }

    costInput.addEventListener('input', () => {
      if (costInputEl) costInputEl.dataset.autocalc = 'true';
      recalculateTotal();
    });

    removeBtn.addEventListener('click', () => {
      tr.remove();
      recalculateTotal();
      if (tbodyEl.children.length === 0) {
        addRow(); // Keep at least one empty row ready
      }
    });

    tbodyEl.appendChild(tr);
    recalculateTotal();
    return tr;
  }

  // Populate initial rows or 1 blank row
  if (Array.isArray(initialParts) && initialParts.length > 0) {
    initialParts.forEach(p => addRow(p));
  } else {
    addRow();
  }

  if (addBtnEl) {
    addBtnEl.onclick = () => {
      const newTr = addRow();
      const input = newTr.querySelector('.part-row-name');
      if (input) input.focus();
    };
  }

  if (costInputEl) {
    costInputEl.addEventListener('input', () => {
      costInputEl.dataset.autocalc = 'false';
    });
  }

  return {
    recalculateTotal,
    addRow,
    getParts: () => {
      const rows = tbodyEl.querySelectorAll('tr.part-builder-row');
      const parts = [];
      let hasInvalidCatalogPart = false;

      rows.forEach(tr => {
        const input = tr.querySelector('.part-row-name');
        const name = input?.value?.trim();
        const code = input?.dataset.selectedCode || tr.dataset.partCode || null;
        const qty = parseFloat(tr.querySelector('.part-row-qty')?.value) || 1;
        const cost = parseFloat(tr.querySelector('.part-row-cost')?.value) || 0;

        let pickedLocators = null;
        if (tr.dataset.pickedLocators) {
          try {
            pickedLocators = JSON.parse(tr.dataset.pickedLocators);
          } catch (e) {
            pickedLocators = null;
          }
        }

        if (name) {
          if (input.classList.contains('is-invalid-catalog')) {
            hasInvalidCatalogPart = true;
          }
          parts.push({
            part_name: name,
            part_code: code,
            quantity: qty,
            unit_cost: cost,
            total_cost: Math.round(qty * cost),
            picked_locators: (pickedLocators && pickedLocators.length > 0) ? pickedLocators : null
          });
        }
      });

      if (hasInvalidCatalogPart) {
        showToast('Please select all parts from the Physical Stock Catalog dropdown', 'warning');
      }

      return parts;
    }
  };
}

// ====================================================
// STAGE PROGRESSION / ADVANCE
// ====================================================
window.openAdvanceModal = async function (ticketOrId, requestedTargetStageId = null) {
  const ticketId = (typeof ticketOrId === 'object' && ticketOrId !== null) ? ticketOrId.id : Number(ticketOrId);
  let ticket = state.tickets.find(t => t.id === ticketId) || (state.currentEditingTicket && state.currentEditingTicket.id === ticketId ? state.currentEditingTicket : null);
  if (!ticket) return;

  // Fetch fresh ticket details to guarantee parts are loaded
  try {
    const res = await fetch(`/api/tickets/${ticketId}`);
    if (res.ok) {
      const freshTicket = await res.json();
      ticket = { ...ticket, ...freshTicket };
      const idx = state.tickets.findIndex(t => t.id === ticketId);
      if (idx !== -1) state.tickets[idx] = ticket;
      if (state.currentEditingTicket && state.currentEditingTicket.id === ticketId) {
        state.currentEditingTicket = ticket;
      }
    }
  } catch (e) {
    console.error('Failed to fetch fresh ticket for advance modal:', e);
  }

  document.getElementById('advanceTicketId').value = ticket.id;
  const currentStageId = ticket.current_stage_id;

  // Determine next stage
  let nextStageId = requestedTargetStageId ? Number(requestedTargetStageId) : null;
  if (!nextStageId) {
    nextStageId = currentStageId + 1;
    if (currentStageId === 5 && !ticket.parts_order_required) {
      nextStageId = 8; // Jump to Work Start if parts order not required
    } else if (currentStageId === 10 && !ticket.resurvey_required) {
      nextStageId = 12; // Jump to Customer Delivery if resurvey not required
    }
  }

  document.getElementById('advanceTargetStageId').value = nextStageId;

  const currentStageConfig = state.stages.find(s => s.id === currentStageId);
  const nextStageConfig = state.stages.find(s => s.id === nextStageId);

  // If skipping stages forward, display an informational alert in the modal
  let skipNoticeHtml = '';
  if (nextStageId > currentStageId + 1) {
    const skippedNames = [];
    for (let s = currentStageId + 1; s < nextStageId; s++) {
      const cfg = state.stages.find(st => st.id === s);
      skippedNames.push(`#${s} ${cfg ? cfg.name : ''}`);
    }
    skipNoticeHtml = `
      <div class="alert-box" style="background:#f1f5f9;border:1px solid #cbd5e1;color:#475569;margin-bottom:14px;font-size:12px;border-radius:4px;padding:10px 12px;">
        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>Advancing to <strong>#${nextStageId} (${nextStageConfig ? nextStageConfig.name : ''})</strong>. Bypassed stages (<strong>${skippedNames.join(', ')}</strong>) will be recorded as <strong>Skipped</strong> (grey dot in timeline).</span>
      </div>
    `;
  }

  document.getElementById('advanceModalTitle').textContent = `Advance to Stage #${nextStageId}: ${nextStageConfig ? nextStageConfig.name : ''}`;
  document.getElementById('advanceModalSub').textContent = `Current Stage: #${currentStageId} ${currentStageConfig ? currentStageConfig.name : ''} • Ticket ${ticket.ticket_number}`;

  // Dynamically build required input fields for this specific transition
  const dynamicContainer = document.getElementById('advanceDynamicFields');
  dynamicContainer.innerHTML = skipNoticeHtml + buildAdvanceDynamicFields(nextStageId, ticket);

  // Attach autocomplete for parts, insurers, or surveyors if relevant
  setupStageSpecificAutocomplete(nextStageId, ticket);

  document.getElementById('modalAdvanceStage').style.display = 'flex';
};

function buildAdvanceDynamicFields(nextStageId, ticket) {
  if (nextStageId === 2) {
    // Stage 2: Estimate Preparation (Row by row parts addition)
    return `

      <div class="parts-builder-section" style="margin-bottom: 12px;">
        <div class="parts-builder-header">
          <label style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.3px;">
            Damaged Parts
          </label>
          <span style="font-size: 11px; color: #94a3b8;">Add damaged parts row by row (optional)</span>
        </div>
        <div class="table-container" style="margin-top: 6px; margin-bottom: 8px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); overflow: visible;">
          <table class="parts-builder-table" id="advPartsTable">
            <thead>
              <tr>
                <th style="width: 44%;">Part Item / Description</th>
                <th style="width: 14%; text-align: center;">Qty</th>
                <th style="width: 20%; text-align: right;">Unit Price (₹)</th>
                <th style="width: 22%; text-align: right;">Amount (₹)</th>
                <th style="width: 36px; text-align: center;"></th>
              </tr>
            </thead>
            <tbody id="advPartsTableBody">
            </tbody>
          </table>
        </div>
        <div class="parts-builder-actions">
          <button type="button" class="btn btn-outline btn-xs" id="advBtnAddPartRow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Part Item</span>
          </button>
          <div class="parts-total-summary">
            <span class="parts-total-label">Parts Subtotal:</span>
            <span class="parts-total-val" id="advPartsTotalVal">₹0</span>
          </div>
        </div>
      </div>
      <div class="form-group" style="margin-top: 10px;">
        <label for="advJobNotes">Additional Job Remarks / Labor Scope (Optional)</label>
        <textarea id="advJobNotes" class="form-textarea" rows="2" placeholder="e.g. Front bumper overhaul, painting & refinishing..."></textarea>
      </div>
      <div class="form-group">
        <label for="advEstimatedCost">Estimated Repair Cost (₹) <span class="req">*</span></label>
        <input type="number" id="advEstimatedCost" class="form-input" placeholder="e.g. 15000" step="any" required>
      </div>
    `;
  }

  if (nextStageId === 3) {
    // Stage 3: Insurance Intimation
    return `
      <div class="form-group rel-pos">
        <label for="advInsuranceCompany">Insurance Company Name <span class="req">*</span></label>
        <input type="text" id="advInsuranceCompany" class="form-input" placeholder="e.g. ICICI Lombard General Insurance" required>
        <div class="suggestions-box" id="suggestInsurers"></div>
      </div>
    `;
  }

  if (nextStageId === 4) {
    // Stage 4: Survey
    return `
      <div class="form-group rel-pos">
        <label for="advSurveyorName">Surveyor Name <span class="req">*</span></label>
        <input type="text" id="advSurveyorName" class="form-input" placeholder="e.g. Rajesh Sharma" required>
        <div class="suggestions-box" id="suggestSurveyors"></div>
      </div>
      <div class="form-group">
        <label for="advSurveyorPhone">Surveyor Phone Number <span class="req">*</span></label>
        <input type="tel" id="advSurveyorPhone" class="form-input" placeholder="e.g. +91 98201 44552" required>
      </div>
    `;
  }

  if (nextStageId === 5) {
    // Stage 5: Approval
    const partsList = (ticket && Array.isArray(ticket.parts)) ? ticket.parts : [];
    let partsChecklistHtml = '';

    if (partsList.length > 0) {
      let iaCount = 0;
      const rowsHtml = partsList.map(p => {
        const isIa = p.insurance_approved === 1 || p.company_approved === 1;
        if (isIa) iaCount++;
        const cost = Number(p.total_cost || (p.quantity * (p.unit_cost || 0)));
        return `
          <div class="stage-part-row" data-part-id="${p.id}">
            <div class="stage-part-info">
              <span class="stage-part-name">${escapeHtml(p.part_name)} ${p.part_code ? `(${escapeHtml(p.part_code)})` : ''}</span>
              <span class="stage-part-cost">Qty: ${p.quantity || 1} • ₹${cost.toLocaleString('en-IN')}</span>
            </div>
            <label class="stage-part-checkbox">
              <input type="checkbox" class="adv-part-ia-cb" ${isIa ? 'checked' : ''}>
              <span>Insurance Approved</span>
            </label>
          </div>
        `;
      }).join('');

      const pcaCount = partsList.length - iaCount;

      partsChecklistHtml = `
        <div class="stage-advance-parts-approval-card">
          <div class="header-title">
            <span>Parts Coverage Approval</span>
            <span id="advStage5Stats" style="font-size: 11px; font-weight: 700; color: #047857;">
              Insurance Approved: ${iaCount} | Customer to Bear (PCA): ${pcaCount} | Total: ${partsList.length}
            </span>
          </div>
          <div class="subtext">
            Mark parts approved by Insurance Company. Unchecked parts will automatically be flagged as <strong>Pending Customer Approval (PCA)</strong> to be borne by the customer out-of-pocket.
          </div>
          <div class="stage-parts-checklist" id="advPartsApprovalChecklist">
            ${rowsHtml}
          </div>
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; font-weight: 600; color: #92400e;">
              <input type="checkbox" id="advApprovalExemptCb" ${ticket.customer_approval_exempt ? 'checked' : ''}>
              <span>Workshop Exemption (Order & Start Work without Customer Pre-Approval)</span>
            </label>
          </div>
        </div>
      `;
    } else {
      partsChecklistHtml = `
        <div class="alert-box" style="background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;margin-bottom:12px;">
          No parts registered in estimate. You can proceed with labor-only repair approval.
        </div>
      `;
    }

    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;margin-bottom:12px;">
        <strong>Surveyor Approval Confirmation:</strong> Mark Insurance Approved parts below.
      </div>
      ${partsChecklistHtml}
      <div class="form-group" style="margin-top: 10px;">
        <label for="advJobNotes">Approval / Surveyor Remarks (Optional)</label>
        <textarea id="advJobNotes" class="form-textarea" rows="2" placeholder="e.g. Surveyor approved front bumper replacement under claim, minor clips to customer..."></textarea>
      </div>
    `;
  }

  if (nextStageId === 6) {
    // Stage 6: Parts Order (Review approved parts to order, mark critical to start, check claim and customer approvals)
    const partsList = (ticket && Array.isArray(ticket.parts)) ? ticket.parts : [];
    let partsChecklistHtml = '';

    if (partsList.length > 0) {
      let approvedCount = 0;
      let criticalCount = 0;

      const rowsHtml = partsList.map(p => {
        const isIa = p.insurance_approved === 1 || p.company_approved === 1;
        const custStatus = (p.customer_approval_status || '').toUpperCase();
        const isExempt = ticket.customer_approval_exempt === 1 || custStatus === 'EXEMPT';
        const isCustApproved = custStatus === 'APPROVED';
        const isCrit = p.is_critical_to_start === 1;
        const isAlreadyOrdered = (p.part_status && p.part_status.toUpperCase() === 'ORDERED') && Number(ticket.current_stage_id) >= 6;
        const isApprovedToOrder = isIa || isCustApproved || isExempt || isAlreadyOrdered;

        if (isApprovedToOrder) approvedCount++;
        if (isCrit) criticalCount++;

        const cost = Number(p.total_cost || (p.quantity * (p.unit_cost || 0)));

        const claimBadge = isIa
          ? `<span class="tag-part-lifecycle tag-ia" style="font-size: 10px;" title="Approved under insurance claim"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:2px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Claim Approved</span>`
          : `<span class="tag-part-lifecycle" style="font-size: 10px; background:#fff7ed; color:#c2410c; border:1px solid #fed7aa;" title="Not covered under insurance claim">Claim: Not Covered</span>`;

        let custBadge = '';
        if (isIa) {
          custBadge = `<span class="tag-part-lifecycle" style="font-size: 10px; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;" title="No customer payment required">Covered by Claim</span>`;
        } else if (isCustApproved) {
          custBadge = `<span class="tag-part-lifecycle tag-ca" style="font-size: 10px;" title="Customer approved out-of-pocket payment">Cust. Approved (CA)</span>`;
        } else if (isExempt) {
          custBadge = `<span class="tag-part-lifecycle tag-exempt" style="font-size: 10px;" title="Workshop exemption active">Exempt</span>`;
        } else {
          custBadge = `
            <div style="display:inline-flex;align-items:center;gap:4px;">
              <span class="tag-part-lifecycle tag-pca" style="font-size: 10px;" title="Pending customer approval">Pending Cust. (PCA)</span>
              <label style="font-size:10px;color:#4338ca;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:3px;margin:0;background:#eef2ff;padding:1px 5px;border-radius:3px;border:1px solid #c7d2fe;" title="Tick to record customer approval now">
                <input type="checkbox" class="adv-cust-approved-cb" data-part-id="${p.id}" style="width:12px;height:12px;accent-color:#4f46e5;cursor:pointer;">
                <span>Approve</span>
              </label>
            </div>
          `;
        }

        return `
          <div class="stage-part-order-row ${!isApprovedToOrder ? 'row-not-ordered' : ''}" data-part-id="${p.id}">
            <div class="stage-part-order-left">
              <input type="checkbox" class="adv-order-approved-cb" id="advOrderPart_${p.id}" data-part-id="${p.id}" ${isApprovedToOrder ? 'checked' : ''} title="Tick to approve ordering this part">
              <div class="stage-part-info">
                <label for="advOrderPart_${p.id}" class="stage-part-name" style="cursor:pointer;margin:0;">${escapeHtml(p.part_name)} ${p.part_code ? `(${escapeHtml(p.part_code)})` : ''}</label>
                <span class="stage-part-cost">Qty: ${p.quantity || 1} • ₹${cost.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div class="stage-part-order-badges">
              ${claimBadge}
              ${custBadge}
            </div>
            <div class="stage-part-order-right">
              <label class="stage-part-critical-label" title="Mark if this part is strictly required before starting repair work (Stage 8)">
                <input type="checkbox" class="adv-part-critical-cb" data-part-id="${p.id}" ${isCrit ? 'checked' : ''}>
                <span>Critical to Start</span>
              </label>
            </div>
          </div>
        `;
      }).join('');

      partsChecklistHtml = `
        <div class="stage-advance-parts-order-card">
          <div class="header-title">
            <span>Parts Order & Procurement Approval</span>
            <span id="advStage6Stats" style="font-size: 11px; font-weight: 700; color: #1e40af;">
              Approved to Order: ${approvedCount} / ${partsList.length} | Critical to Start: ${criticalCount}
            </span>
          </div>
          <div class="adv-order-subtext">
            Tick parts <strong>Approved to Order</strong>. Parts tagged <strong>Critical to Start</strong> must arrive before work start (Stage 8).
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px;padding:4px 2px;border-bottom:1px solid #e2e8f0;font-size:11.5px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;color:#334155;margin:0;">
              <input type="checkbox" id="advCheckAllApprovedToOrder" ${approvedCount === partsList.length ? 'checked' : ''} style="width:14px;height:14px;accent-color:#2563eb;cursor:pointer;">
              <span>Select All Approved to Order</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;color:#92400e;margin:0;">
              <input type="checkbox" id="advOrderExemptCb" ${ticket.customer_approval_exempt ? 'checked' : ''} style="width:14px;height:14px;accent-color:#d97706;cursor:pointer;">
              <span>Workshop Exemption (Proceed without customer approval)</span>
            </label>
          </div>
          <div class="stage-parts-order-checklist" id="advPartsOrderChecklist">
            ${rowsHtml}
          </div>
        </div>
      `;
    } else {
      partsChecklistHtml = `
        <div class="alert-box" style="background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;margin-bottom:12px;">
          No parts registered on this ticket estimate. You can add extra items below if required.
        </div>
      `;
    }

    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;margin-bottom:12px;">
        <strong>Parts Order Placement:</strong> Review parts to be ordered, tick approved items, and flag critical components. SLA allows max 5 working days.
      </div>
      ${partsChecklistHtml}
      <div class="parts-builder-section" style="margin-bottom: 12px;">
        <div class="parts-builder-header">
          <label style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.3px;">
            + Add Additional Parts (Unestimated Items)
          </label>
          <span style="font-size: 11px; color: #94a3b8;">Add extra components if needed</span>
        </div>
        <div class="table-container" style="margin-top: 6px; margin-bottom: 8px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); overflow: visible;">
          <table class="parts-builder-table" id="advPartsTable">
            <thead>
              <tr>
                <th style="width: 44%;">Part Item / Description</th>
                <th style="width: 14%; text-align: center;">Qty</th>
                <th style="width: 20%; text-align: right;">Unit Price (₹)</th>
                <th style="width: 22%; text-align: right;">Amount (₹)</th>
                <th style="width: 36px; text-align: center;"></th>
              </tr>
            </thead>
            <tbody id="advPartsTableBody">
            </tbody>
          </table>
        </div>
        <div class="parts-builder-actions">
          <button type="button" class="btn btn-outline btn-xs" id="advBtnAddPartRow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Part Item</span>
          </button>
          <div class="parts-total-summary">
            <span class="parts-total-label">Extra Parts Subtotal:</span>
            <span class="parts-total-val" id="advPartsTotalVal">₹0</span>
          </div>
        </div>
      </div>
      <div class="form-group" style="margin-top: 10px;">
        <label for="advJobNotes">Order / Supplier Remarks (Optional)</label>
        <textarea id="advJobNotes" class="form-textarea" rows="2" placeholder="e.g. Purchase order PO-2026-881 placed with Honda Central Depot..."></textarea>
      </div>
      <div class="form-group">
        <label for="advEstimatedCost">Estimated Cost / Order Total (₹)</label>
        <input type="number" id="advEstimatedCost" class="form-input" placeholder="0" step="any">
      </div>
    `;
  }

  if (nextStageId === 7) {
    // Stage 7: Parts Arrival (Enforces ticking all parts to proceed)
    const allTicketParts = (ticket && Array.isArray(ticket.parts)) ? ticket.parts : [];
    const partsList = allTicketParts.filter(p => (p.part_status || '').toUpperCase() === 'ORDERED' || (p.part_status || '').toUpperCase() === 'ARRIVED');
    const hasParts = partsList.length > 0;

    let partsChecklistHtml = '';
    if (hasParts) {
      const arrivedCount = partsList.filter(p => p.part_status === 'ARRIVED').length;
      const allArrived = arrivedCount === partsList.length;

      const rowsHtml = partsList.map((p, idx) => {
        const isArrived = p.part_status === 'ARRIVED';
        const arrivedTimeFormatted = p.arrived_at
          ? new Date(p.arrived_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';

        return `
          <label class="checklist-row ${isArrived ? 'row-checked' : ''}" for="advPartCb_${p.id}">
            <input type="checkbox" id="advPartCb_${p.id}" class="part-check-item" value="${p.id}" ${isArrived ? 'checked' : ''}>
            <div class="checklist-row-details">
              <div>
                <span class="checklist-part-title">${escapeHtml(p.part_name)}</span>
                ${p.part_code ? `<span class="checklist-part-code">(${escapeHtml(p.part_code)})</span>` : ''}
                ${isArrived && arrivedTimeFormatted ? `<span class="tag-arrived-time"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Logged: ${arrivedTimeFormatted}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="checklist-qty-pill">Qty: ${p.quantity || 1}</span>
                <span class="${isArrived ? 'badge-part-arrived' : 'badge-part-ordered'}">
                  ${isArrived ? 'ARRIVED' : 'ORDERED'}
                </span>
              </div>
            </div>
          </label>
        `;
      }).join('');

      partsChecklistHtml = `
        <div class="parts-arrival-checklist" id="advPartsArrivalChecklist">
          <div class="checklist-header">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;margin:0;">
              <input type="checkbox" id="advCheckAllParts" ${allArrived ? 'checked' : ''}>
              <span>Select / Tick All Parts as Arrived</span>
            </label>
            <span id="advPartsArrivalCounter" style="font-size:11px;color:#64748b;font-weight:600;">
              ${arrivedCount} / ${partsList.length} Arrived
            </span>
          </div>
          <div class="checklist-items-wrap">
            ${rowsHtml}
          </div>
        </div>
        <div class="checklist-progress-bar-wrap ${allArrived ? 'all-done' : 'has-pending'}" id="advPartsValidationMsg">
          ${allArrived
          ? '✓ All parts have been verified as arrived. Ready to transition into Parts Arrival.'
          : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Only when ticking all parts will it proceed to Parts Arrival (${partsList.length - arrivedCount} pending).`}
        </div>
      `;
    } else {
      partsChecklistHtml = `
        <div class="parts-arrival-checklist" id="advPartsArrivalChecklist">
          <div class="checklist-header">
            <span>Parts Verification</span>
          </div>
          <div style="padding:12px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="advNoPartsConfirm" class="part-check-item" value="0">
              <span style="font-size:13px;font-weight:500;">Confirm all required parts & materials have arrived at the workshop</span>
            </label>
          </div>
        </div>
        <div class="checklist-progress-bar-wrap has-pending" id="advPartsValidationMsg">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Please tick confirmation checkbox above to proceed to Parts Arrival.
        </div>
      `;
    }

    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;margin-bottom:10px;">
        <strong>Parts Arrival Verification:</strong> SLA allows max 10 working days. Tick all ordered parts to verify receipt and advance to Stage 7.
      </div>
      ${partsChecklistHtml}
      <div class="form-group" style="margin-top:10px;">
        <label for="advPartsArrivalNotes">Arrival Verification / Storage Location Remarks (Optional)</label>
        <textarea id="advPartsArrivalNotes" class="form-textarea" rows="2" placeholder="e.g. All parts received, inspected against invoice and stored in Bay 2 parts rack."></textarea>
      </div>
    `;
  }

  if (nextStageId === 8) {
    // Stage 8: Work Start
    return `
      <div class="alert-box" style="background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;">
        Confirm repair work has commenced on the vehicle.
      </div>
    `;
  }

  if (nextStageId === 9) {
    // Stage 9: Work Complete
    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;margin-bottom:10px;">
        All body/mechanical repair work completed. Vehicle is ready for invoicing or pickup.
      </div>
      <div class="info-callout" style="margin-top:0;">
        <span>If customer pays directly before insurance settlement and takes the vehicle, use <strong>Bypass & Close</strong> instead.</span>
      </div>
    `;
  }

  if (nextStageId === 10) {
    // Stage 10: Invoice
    return `
      <div class="form-group">
        <label>
          <input type="checkbox" id="advResurveyRequired" ${ticket.resurvey_required ? 'checked' : ''}>
          <strong>Surveyor Resurvey Required?</strong> (Check if insurance company requires post-repair physical inspection)
        </label>
      </div>
    `;
  }

  if (nextStageId === 11) {
    // Stage 11: Resurvey
    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;">
        Log surveyor completion of final resurvey inspection.
      </div>
    `;
  }

  if (nextStageId === 12) {
    // Stage 12: Waiting Customer Delivery
    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;">
        Vehicle repair & billing complete. Vehicle is staging and waiting for customer delivery/pickup. SLA allows max 15 working days.
      </div>
    `;
  }

  if (nextStageId === 13) {
    // Stage 13: Customer Delivery
    return `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;">
        Mark vehicle delivered to customer. This will mark final SLA complete and close the ticket.
      </div>
    `;
  }

  return `<p>Proceed to next operational stage?</p>`;
}

function setupStageSpecificAutocomplete(nextStageId, ticket) {
  // Stage 2 & Stage 6: Parts Autocomplete & Row-by-Row Table Builder
  if (nextStageId === 2 || nextStageId === 6) {
    const tbodyEl = document.getElementById('advPartsTableBody');
    const totalValEl = document.getElementById('advPartsTotalVal');
    const costInputEl = document.getElementById('advEstimatedCost');
    const addBtnEl = document.getElementById('advBtnAddPartRow');

    let initialParts = (ticket && Array.isArray(ticket.parts) && ticket.parts.length > 0) ? ticket.parts : [];
    if (initialParts.length === 0 && ticket && ticket.damaged_parts) {
      const legacyParts = ticket.damaged_parts.split(',').map(s => s.trim()).filter(Boolean);
      if (legacyParts.length > 0) {
        initialParts = legacyParts.map(p => ({ part_name: p, quantity: 1, unit_cost: 0 }));
      }
    }

    state.advPartsBuilder = setupPartsTableBuilder({
      tbodyEl,
      totalValEl,
      costInputEl,
      addBtnEl,
      initialParts
    });

    if (ticket && ticket.estimated_cost && costInputEl) {
      costInputEl.value = ticket.estimated_cost;
    }
  }

  // Stage 3: Insurer Autocomplete
  if (nextStageId === 3) {
    const insInput = document.getElementById('advInsuranceCompany');
    const insBox = document.getElementById('suggestInsurers');
    if (insInput && insBox) {
      insInput.addEventListener('input', async () => {
        const val = insInput.value.trim();
        if (val.length < 2) { insBox.style.display = 'none'; return; }
        const res = await fetch(`/api/lookup/insurers?q=${encodeURIComponent(val)}`);
        const insurers = await res.json();
        if (insurers.length > 0) {
          insBox.innerHTML = '';
          insurers.forEach(ins => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<div class="sugg-primary">${ins.name}</div><div class="sugg-secondary">${ins.contact_info || ''}</div>`;
            div.addEventListener('mousedown', (e) => {
              e.preventDefault();
              insInput.value = ins.name;
              insBox.style.display = 'none';
            });
            insBox.appendChild(div);
          });
          positionSuggestionBox(insBox);
          insBox.style.display = 'block';
        } else {
          insBox.style.display = 'none';
        }
      });
      insInput.addEventListener('blur', () => { setTimeout(() => { insBox.style.display = 'none'; }, 250); });
    }
  }

  // Stage 4: Surveyor Autocomplete
  if (nextStageId === 4) {
    const survInput = document.getElementById('advSurveyorName');
    const survPhone = document.getElementById('advSurveyorPhone');
    const survBox = document.getElementById('suggestSurveyors');
    if (survInput && survBox) {
      survInput.addEventListener('input', async () => {
        const val = survInput.value.trim();
        const res = await fetch(`/api/lookup/surveyors?q=${encodeURIComponent(val)}`);
        const surveyors = await res.json();
        if (surveyors.length > 0) {
          survBox.innerHTML = '';
          surveyors.forEach(s => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<div class="sugg-primary">${s.name}</div><div class="sugg-secondary">${s.phone}</div>`;
            div.addEventListener('mousedown', (e) => {
              e.preventDefault();
              survInput.value = s.name;
              if (survPhone) survPhone.value = s.phone;
              survBox.style.display = 'none';
            });
            survBox.appendChild(div);
          });
          positionSuggestionBox(survBox);
          survBox.style.display = 'block';
        } else {
          survBox.style.display = 'none';
        }
      });
      survInput.addEventListener('blur', () => { setTimeout(() => { survBox.style.display = 'none'; }, 250); });
    }
  }

  // Stage 5: Live Counter Updates for Insurance Approval Checklist
  if (nextStageId === 5) {
    const checkItems = document.querySelectorAll('#advPartsApprovalChecklist .adv-part-ia-cb');
    const statsEl = document.getElementById('advStage5Stats');
    const updateStats = () => {
      const total = checkItems.length;
      let ia = 0;
      checkItems.forEach(cb => { if (cb.checked) ia++; });
      const pca = total - ia;
      if (statsEl) {
        statsEl.textContent = `Insurance Approved: ${ia} | Customer to Bear (PCA): ${pca} | Total: ${total}`;
      }
    };
    checkItems.forEach(cb => cb.addEventListener('change', updateStats));
  }

  // Stage 6: Live Counter & Toggle Updates for Parts Order Placement
  if (nextStageId === 6) {
    const orderCbs = document.querySelectorAll('#advPartsOrderChecklist .adv-order-approved-cb');
    const critCbs = document.querySelectorAll('#advPartsOrderChecklist .adv-part-critical-cb');
    const selectAllCb = document.getElementById('advCheckAllApprovedToOrder');
    const statsEl = document.getElementById('advStage6Stats');

    const updateStats = () => {
      const total = orderCbs.length;
      let approved = 0;
      let crit = 0;
      orderCbs.forEach(cb => {
        if (cb.checked) approved++;
        const row = cb.closest('.stage-part-order-row');
        if (row) {
          if (cb.checked) row.classList.remove('row-not-ordered');
          else row.classList.add('row-not-ordered');
        }
      });
      critCbs.forEach(cb => { if (cb.checked) crit++; });

      if (statsEl) {
        statsEl.textContent = `Approved to Order: ${approved} / ${total} | Critical to Start: ${crit}`;
      }
      if (selectAllCb) {
        selectAllCb.checked = total > 0 && approved === total;
      }
    };

    orderCbs.forEach(cb => cb.addEventListener('change', updateStats));
    critCbs.forEach(cb => cb.addEventListener('change', updateStats));

    if (selectAllCb) {
      selectAllCb.addEventListener('change', () => {
        const isChecked = selectAllCb.checked;
        orderCbs.forEach(cb => { cb.checked = isChecked; });
        updateStats();
      });
    }
  }

  // Stage 7: Parts Arrival Checklist Logic & Advance Button Gatekeeper
  if (nextStageId === 7) {
    const confirmBtn = document.getElementById('btnConfirmAdvance');
    const selectAllCb = document.getElementById('advCheckAllParts');
    const checkItems = document.querySelectorAll('#advPartsArrivalChecklist input.part-check-item');
    const validationMsg = document.getElementById('advPartsValidationMsg');
    const counterEl = document.getElementById('advPartsArrivalCounter');

    const updateChecklistState = () => {
      const total = checkItems.length;
      if (total === 0) {
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      const checked = Array.from(checkItems).filter(cb => cb.checked);
      const allChecked = checked.length === total;

      if (selectAllCb) selectAllCb.checked = allChecked;
      if (counterEl) counterEl.textContent = `${checked.length} / ${total} Arrived`;

      checkItems.forEach(cb => {
        const row = cb.closest('.checklist-row');
        if (row) {
          if (cb.checked) row.classList.add('row-checked');
          else row.classList.remove('row-checked');
        }
      });

      if (allChecked) {
        if (confirmBtn) confirmBtn.disabled = false;
        if (validationMsg) {
          validationMsg.className = 'checklist-progress-bar-wrap all-done';
          validationMsg.innerHTML = '✓ All parts verified as arrived. Ready to proceed to Parts Arrival.';
        }
      } else {
        if (confirmBtn) confirmBtn.disabled = true;
        const remaining = total - checked.length;
        if (validationMsg) {
          validationMsg.className = 'checklist-progress-bar-wrap has-pending';
          validationMsg.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Only when ticking all parts will it proceed to Parts Arrival (${remaining} remaining).`;
        }
      }
    };

    if (selectAllCb) {
      selectAllCb.addEventListener('change', () => {
        checkItems.forEach(cb => { cb.checked = selectAllCb.checked; });
        updateChecklistState();
      });
    }

    checkItems.forEach(cb => {
      cb.addEventListener('change', updateChecklistState);
    });

    // Run immediately to set initial button state
    updateChecklistState();
  } else {
    // For non-stage-7 steps, guarantee the advance button is active
    const confirmBtn = document.getElementById('btnConfirmAdvance');
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

async function handleAdvanceStageSubmit(e) {
  e.preventDefault();
  if (state.isAdvancingStage) return;

  const ticketId = document.getElementById('advanceTicketId').value;
  const targetStageId = Number(document.getElementById('advanceTargetStageId').value);

  const advanceBtn = document.getElementById('btnConfirmAdvance');
  const origBtnText = advanceBtn ? advanceBtn.innerHTML : '';

  state.isAdvancingStage = true;
  if (advanceBtn) {
    advanceBtn.disabled = true;
    advanceBtn.innerHTML = '<span class="btn-spinner"></span> <span>Advancing...</span>';
  }
  showGlobalLoader();

  const payload = { targetStageId };

  if (targetStageId === 5) {
    const partRows = document.querySelectorAll('#advPartsApprovalChecklist .stage-part-row');
    if (partRows.length > 0) {
      const partsApproval = [];
      partRows.forEach(row => {
        const partId = Number(row.dataset.partId);
        const insApprovedCb = row.querySelector('.adv-part-ia-cb');
        const isIa = insApprovedCb ? insApprovedCb.checked : false;
        partsApproval.push({
          id: partId,
          insurance_approved: isIa ? 1 : 0,
          company_approved: isIa ? 1 : 0,
          customer_approval_status: isIa ? 'NONE' : 'PENDING'
        });
      });
      payload.partsApproval = partsApproval;
      payload.partsOrderRequired = partsApproval.length > 0;
    }
    const exemptCb = document.getElementById('advApprovalExemptCb');
    if (exemptCb) {
      payload.customerApprovalExempt = exemptCb.checked;
    }
  }

  if (targetStageId === 6) {
    const orderRows = document.querySelectorAll('#advPartsOrderChecklist .stage-part-order-row');
    if (orderRows.length > 0) {
      const partsApproval = [];
      orderRows.forEach(row => {
        const partId = Number(row.dataset.partId);
        const orderApprovedCb = row.querySelector('.adv-order-approved-cb');
        const criticalCb = row.querySelector('.adv-part-critical-cb');
        const custApproveCb = row.querySelector('.adv-cust-approved-cb');

        const isApprovedToOrder = orderApprovedCb ? orderApprovedCb.checked : true;
        const isCritical = criticalCb ? criticalCb.checked : false;

        const updateItem = {
          id: partId,
          part_status: isApprovedToOrder ? 'ORDERED' : 'ON_HOLD',
          is_critical_to_start: isCritical ? 1 : 0
        };

        if (custApproveCb && custApproveCb.checked) {
          updateItem.customer_approval_status = 'APPROVED';
        }

        partsApproval.push(updateItem);
      });
      payload.partsApproval = partsApproval;
      payload.partsOrderRequired = partsApproval.some(p => p.part_status === 'ORDERED');
    }

    const orderExemptCb = document.getElementById('advOrderExemptCb');
    if (orderExemptCb) {
      payload.customerApprovalExempt = orderExemptCb.checked;
    }
  }

  if (targetStageId === 7) {
    const checkItems = Array.from(document.querySelectorAll('#advPartsArrivalChecklist input.part-check-item:checked'));
    payload.arrivedPartIds = checkItems.map(cb => Number(cb.value)).filter(id => id > 0);
    const arrivalNotes = document.getElementById('advPartsArrivalNotes')?.value?.trim();
    if (arrivalNotes) {
      payload.notes = arrivalNotes;
    }
  }

  if ((targetStageId === 2 || targetStageId === 6) && state.advPartsBuilder) {
    const parts = state.advPartsBuilder.getParts();
    payload.parts = parts;
    const notes = document.getElementById('advJobNotes')?.value?.trim() || '';
    if (parts.length > 0) {
      const summary = parts.map(p => `${p.part_name} (x${p.quantity})`).join(', ');
      payload.damagedParts = notes ? `${summary} • ${notes}` : summary;
    } else if (notes) {
      payload.damagedParts = notes;
    }
  } else {
    const partsEl = document.getElementById('advDamagedParts') || document.getElementById('advPartsOrdered');
    if (partsEl) payload.damagedParts = partsEl.value;
  }

  const costEl = document.getElementById('advEstimatedCost');
  if (costEl && costEl.value !== '') payload.estimatedCost = Number(costEl.value);

  const insEl = document.getElementById('advInsuranceCompany');
  if (insEl) payload.insuranceCompany = insEl.value;

  const survNameEl = document.getElementById('advSurveyorName');
  if (survNameEl) payload.surveyorName = survNameEl.value;

  const survPhoneEl = document.getElementById('advSurveyorPhone');
  if (survPhoneEl) payload.surveyorPhone = survPhoneEl.value;

  const partsReqEl = document.getElementById('advPartsRequired');
  if (partsReqEl) payload.partsOrderRequired = partsReqEl.checked;

  const resurvReqEl = document.getElementById('advResurveyRequired');
  if (resurvReqEl) payload.resurveyRequired = resurvReqEl.checked;

  try {
    const res = await fetch(`/api/tickets/${ticketId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to advance stage');
    }

    const updated = await res.json();
    state.lastAdvancedTicketId = updated.id;
    setTimeout(() => { state.lastAdvancedTicketId = null; }, 3000);
    closeModal('modalAdvanceStage');

    const stageCfg = (state.stages || []).find(s => s.id === updated.current_stage_id);
    const stageLabel = stageCfg ? `Stage #${updated.current_stage_id}: ${stageCfg.name}` : `Stage #${updated.current_stage_id} Advanced`;

    showToast(`Ticket ${updated.ticket_number} advanced to Stage ${updated.current_stage_id}`, 'success');
    if (typeof triggerStageProgressCursorAnimation === 'function') {
      triggerStageProgressCursorAnimation(null, null, stageLabel);
    }
    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      openTicketPage(ticketId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    state.isAdvancingStage = false;
    hideGlobalLoader();
    if (advanceBtn) {
      advanceBtn.disabled = false;
      advanceBtn.innerHTML = origBtnText;
    }
  }
}

// ====================================================
// PIPELINE BYPASS & EARLY DELIVERY
// ====================================================
window.openBypassModal = function (ticketId) {
  document.getElementById('bypassTicketId').value = ticketId;
  const input = document.getElementById('bypassConfirmInput');
  const btn = document.getElementById('btnConfirmBypass');
  if (input && btn) {
    input.value = '';
    btn.disabled = true;
    input.oninput = () => {
      btn.disabled = (input.value.trim().toUpperCase() !== 'CONFIRM');
    };
  }
  document.getElementById('modalBypassPipeline').style.display = 'flex';
  if (input) setTimeout(() => input.focus(), 50);
};

async function handleBypassSubmit(e) {
  e.preventDefault();
  const ticketId = document.getElementById('bypassTicketId').value;
  const reason = document.getElementById('bypassReason').value;
  const notes = document.getElementById('bypassNotes').value;
  const confirmText = document.getElementById('bypassConfirmInput').value.trim();

  if (confirmText.toUpperCase() !== 'CONFIRM') {
    showToast('Please type CONFIRM to proceed', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/tickets/${ticketId}/bypass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, notes, confirmText })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to bypass ticket');
    }

    const updated = await res.json();
    state.lastAdvancedTicketId = updated.id;
    setTimeout(() => { state.lastAdvancedTicketId = null; }, 3000);
    closeModal('modalBypassPipeline');
    showToast(`Ticket ${updated.ticket_number} bypassed & closed (Vehicle Delivered)`, 'success');
    if (typeof triggerStageProgressCursorAnimation === 'function') {
      triggerStageProgressCursorAnimation(null, null, 'Vehicle Delivered ✓');
    }
    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      openTicketPage(ticketId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// DEDICATED INDIVIDUAL TICKET PAGE CONTROLLER
// ====================================================
window.openTicketPage = async function (ticketId) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}`);
    if (!res.ok) throw new Error('Failed to fetch ticket details');
    const ticket = await res.json();
    state.currentEditingTicket = ticket;

    // Header values
    const numEl = document.getElementById('tpTicketNumber');
    if (numEl) numEl.textContent = ticket.ticket_number;
    const branchEl = document.getElementById('tpBranchName');
    if (branchEl) branchEl.textContent = (ticket.branch_name || ticket.outlet_name || 'Honda Branch').replace('Honda ', '');

    // Quick Status Ribbon
    const stageBadge = document.getElementById('tpStageBadge');
    if (stageBadge) stageBadge.textContent = `#${ticket.current_stage_id} ${ticket.stageName || ''}`;

    const slaBadge = document.getElementById('tpSlaBadge');
    const slaTextEl = document.getElementById('tpSlaText');
    if (slaBadge && slaTextEl) {
      slaBadge.className = `tp-sla-badge ${getSlaPillClass(ticket)}`;
      slaTextEl.innerHTML = `${renderSlaBadgeIcon(ticket)}${getSlaText(ticket)}`;
    }

    const agingEl = document.getElementById('tpAgingText');
    if (agingEl) {
      const stageConfig = state.stages.find(s => s.id === ticket.current_stage_id);
      const elapsedWD = Number(ticket.stageElapsedWD !== undefined ? ticket.stageElapsedWD : ticket.slaElapsedWD) || 0;
      if (ticket.status === 'CLOSED' || ticket.current_stage_id === 13) {
        agingEl.textContent = `${elapsedWD} WD Total (Closed)`;
      } else if (stageConfig && stageConfig.slaLimitWD) {
        agingEl.textContent = `${elapsedWD} / ${stageConfig.slaLimitWD} WD`;
      } else {
        agingEl.textContent = `${elapsedWD} WD`;
      }
    }

    // Action button states
    const btnAdvance = document.getElementById('tpBtnAdvance');
    if (btnAdvance) {
      btnAdvance.style.display = ticket.status !== 'CLOSED' ? 'inline-flex' : 'none';
      btnAdvance.className = `btn btn-compact tp-btn-advance ${getSlaPillClass(ticket)}`;
      btnAdvance.innerHTML = `
        <span>Next Stage</span>
        <span class="tp-advance-arrow-circle">
          <svg class="advance-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="7.5,4.5 18.5,12 7.5,19.5 11.5,12" />
          </svg>
        </span>
      `;
    }
    const btnBypass = document.getElementById('tpBtnBypass');
    if (btnBypass) {
      btnBypass.style.display = ticket.status === 'IN_PROGRESS' ? 'inline-flex' : 'none';
    }

    // Populate Clean Read-Only Display Cards
    const tpIdEl = document.getElementById('tpId');
    if (tpIdEl) tpIdEl.value = ticket.id;

    // 1. Customer & Contact
    const custName = ticket.customer_name || '—';
    const custPhone = ticket.customer_phone || '—';
    const initials = custName !== '—' ? custName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : 'HC';
    const initialsEl = document.getElementById('tpCustomerInitials');
    if (initialsEl) initialsEl.textContent = initials || 'HC';
    const nameEl = document.getElementById('tpCustomerNameDisp');
    if (nameEl) nameEl.textContent = custName;
    const phoneDispEl = document.getElementById('tpCustomerPhoneDisp');
    if (phoneDispEl) phoneDispEl.textContent = custPhone;
    const phoneLink = document.getElementById('tpCustomerPhoneLink');
    if (phoneLink) {
      phoneLink.href = custPhone && custPhone !== '—' ? `tel:${custPhone.replace(/\D/g, '')}` : 'javascript:void(0)';
    }

    // 2. Vehicle Specification
    const vehicleModel = ticket.model || ticket.vehicle_name || 'Honda Vehicle';
    const tagEl = document.getElementById('tpVehicleModelTag');
    if (tagEl) tagEl.textContent = vehicleModel;
    const modelDispEl = document.getElementById('tpVehicleNameDisp');
    if (modelDispEl) modelDispEl.textContent = vehicleModel;

    const vColor = ticket.color || 'Unspecified';
    const colorDispEl = document.getElementById('tpVehicleColorDisp');
    if (colorDispEl) colorDispEl.textContent = vColor;
    const colorDot = document.getElementById('tpVehicleColorDot');
    if (colorDot) {
      colorDot.style.backgroundColor = getColorSwatchHex(vColor);
    }

    const regPlate = ticket.vehicle_no || 'Not Registered';
    const regDispEl = document.getElementById('tpVehicleNoDisp');
    if (regDispEl) {
      regDispEl.textContent = regPlate;
      if (!ticket.vehicle_no) {
        regDispEl.classList.add('unregistered');
      } else {
        regDispEl.classList.remove('unregistered');
      }
    }

    const chassisNum = ticket.chassis_number || '—';
    const chassisDispEl = document.getElementById('tpChassisNumberDisp');
    if (chassisDispEl) chassisDispEl.textContent = chassisNum;

    // 3. Estimates & Damaged Parts Breakdown
    const estCost = Number(ticket.estimated_cost) || 0;
    const costDispEl = document.getElementById('tpEstimatedCostDisp');
    if (costDispEl) costDispEl.textContent = estCost.toLocaleString('en-IN');

    // Parts Note / Delay Minimal Tag in Card 3
    const noteWrap = document.getElementById('tpPartsNoteWrap');
    if (noteWrap) {
      if (ticket.parts_status_note && ticket.parts_status_note.trim()) {
        noteWrap.innerHTML = `
          <div class="tp-note-tag-minimal" onclick="openPartsNoteModal(${ticket.id})" title="Click to edit or clear note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            <span class="tp-note-tag-text">${escapeHtml(ticket.parts_status_note)}</span>
            <span class="tp-note-tag-edit">Edit</span>
          </div>
        `;
      } else {
        noteWrap.innerHTML = '';
      }
    }

    const btnPartsNote = document.getElementById('tpBtnPartsNote');
    if (btnPartsNote) {
      const hasNote = Boolean(ticket.parts_status_note && ticket.parts_status_note.trim());
      btnPartsNote.classList.toggle('has-note', hasNote);
      btnPartsNote.title = hasNote ? `Hold Note: ${ticket.parts_status_note} (Click to edit)` : 'Add parts delay / paint job note';
    }

    const partsContainer = document.getElementById('tpPartsContainer');
    if (partsContainer) {
      if (Array.isArray(ticket.parts) && ticket.parts.length > 0) {
        let partsTotal = 0;
        const rowsHtml = ticket.parts.map(p => {
          const qty = Math.max(1, p.quantity || 1);
          const unit = Number(p.unit_cost || 0);
          const total = Number(p.total_cost !== undefined ? p.total_cost : (qty * unit));
          partsTotal += total;

          const isIa = p.insurance_approved === 1 || p.company_approved === 1;
          const custStatus = (p.customer_approval_status || (isIa ? 'NONE' : 'PENDING')).toUpperCase();
          const isArrived = (p.part_status || '').toUpperCase() === 'ARRIVED';

          let apprBadge = '';
          const isDrawerAfterApproval = Number(ticket.current_stage_id) > 5;
          if (isIa) apprBadge = `<span class="tag-part-lifecycle tag-ia" style="font-size: 10px;">Insurance Approved</span>`;
          else if (!isDrawerAfterApproval) apprBadge = `<span class="tag-part-lifecycle" style="font-size: 10px; background:#f8fafc; color:#64748b; border: 1px solid #cbd5e1;">Awaiting Approval</span>`;
          else if (custStatus === 'APPROVED') apprBadge = `<span class="tag-part-lifecycle tag-ca" style="font-size: 10px;">Cust. Approved (CA)</span>`;
          else if (custStatus === 'EXEMPT' || ticket.customer_approval_exempt === 1) apprBadge = `<span class="tag-part-lifecycle tag-exempt" style="font-size: 10px;">Exempt</span>`;
          else apprBadge = `<span class="tag-part-lifecycle tag-pca" style="font-size: 10px;">Pending Cust. (PCA)</span>`;

          const isOrdered = (p.part_status || '').toUpperCase() === 'ORDERED' && Number(ticket.current_stage_id) >= 6;
          const isHold = (p.part_status || '').toUpperCase() === 'ON_HOLD';

          const delivBadge = isArrived
            ? `<span class="badge-part-arrived" style="font-size: 10px; padding: 2px 6px;">ARRIVED</span>`
            : (isOrdered
              ? `<span class="badge-part-ordered" style="font-size: 10px; padding: 2px 6px;">ORDERED</span>`
              : (isHold
                ? `<span class="badge-part-on-hold" style="font-size: 10px; padding: 2px 6px;">ON HOLD</span>`
                : `<span class="badge-part-pending-order" style="font-size: 10px; padding: 2px 6px;">PENDING ORDER</span>`));

          const matchedCatalog = (state.parts && state.parts.length > 0)
            ? state.parts.find(cp =>
              (p.part_code && (cp.part_code || '').toLowerCase() === p.part_code.toLowerCase()) ||
              (p.part_name && (cp.part_name || '').toLowerCase() === p.part_name.toLowerCase())
            )
            : null;

          return `
            <tr>
              <td style="font-weight: 600; color: #1e293b;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <div>
                    ${escapeHtml(p.part_name || 'Part Item')}
                    ${p.part_code ? `<span style="font-size: 11px; color: #64748b; margin-left: 6px;">(${escapeHtml(p.part_code)})</span>` : ''}
                  </div>
                  ${matchedCatalog ? renderPartStockHoverPill(matchedCatalog) : ''}
                </div>
              </td>
              <td style="text-align: center;"><span class="badge badge-qty" style="background:#f1f5f9; color:#334155; font-weight:700; padding:2px 7px; border-radius:10px; font-size:11px;">${qty}</span></td>
              <td style="text-align: right; font-family: var(--font-mono); color:#475569;">₹${unit.toLocaleString('en-IN')}</td>
              <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #0f172a;">₹${total.toLocaleString('en-IN')}</td>
              <td style="text-align: center;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
                  ${apprBadge}
                  ${delivBadge}
                </div>
              </td>
            </tr>
          `;
        }).join('');

        let notesHtml = '';
        if (ticket.damaged_parts && ticket.damaged_parts.trim()) {
          const autoSummary = ticket.parts.map(p => `${p.part_name} (x${p.quantity})`).join(', ');
          if (ticket.damaged_parts !== autoSummary) {
            notesHtml = `<div class="tp-scope-notes"><strong>Scope & Remarks:</strong> ${escapeHtml(ticket.damaged_parts)}</div>`;
          }
        }

        partsContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: #475569;">Parts & Materials (${ticket.parts.length})</span>
              ${renderTicketPartsBadges(ticket)}
            </div>
            <button type="button" class="btn btn-outline btn-xs" onclick="openPartsApprovalModal(${ticket.id})">
              Manage Approvals
            </button>
          </div>
          <table class="tp-parts-table">
            <thead>
              <tr>
                <th style="width: 38%;">Part Item / Component</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 16%; text-align: right;">Unit Price</th>
                <th style="width: 16%; text-align: right;">Total</th>
                <th style="width: 20%; text-align: center;">Approval & Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="text-align: right; font-weight: 700; color: #64748b; font-size: 11.5px;">Parts Subtotal:</td>
                <td style="text-align: right; font-family: var(--font-mono); font-weight: 800; color: #15803d; font-size: 13px;">₹${partsTotal.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          ${notesHtml}
        `;
      } else {
        partsContainer.innerHTML = `
          <span class="tp-prop-label">Damaged Parts & Scope of Work</span>
          <div class="tp-scope-box" id="tpDamagedPartsDisp">
            ${ticket.damaged_parts && ticket.damaged_parts.trim() ? escapeHtml(ticket.damaged_parts) : '<span class="tp-empty-hint">No damaged parts or scope logged yet.</span>'}
          </div>
        `;
      }
    }

    // 4. Insurance & Surveyor
    const insName = ticket.insurance_company || '—';
    const insDispEl = document.getElementById('tpInsuranceCompanyDisp');
    if (insDispEl) insDispEl.textContent = insName;
    const insBadge = document.getElementById('tpInsuranceBadge');
    if (insBadge) {
      insBadge.textContent = ticket.insurance_company ? 'Insurance Claim' : 'Self / Cashless';
    }

    const survName = ticket.surveyor_name || '—';
    const survDispEl = document.getElementById('tpSurveyorNameDisp');
    if (survDispEl) survDispEl.textContent = survName;

    const survPhone = ticket.surveyor_phone || '—';
    const survPhoneDispEl = document.getElementById('tpSurveyorPhoneDisp');
    if (survPhoneDispEl) survPhoneDispEl.textContent = survPhone;
    const survPhoneLink = document.getElementById('tpSurveyorPhoneLink');
    if (survPhoneLink) {
      survPhoneLink.href = survPhone && survPhone !== '—' ? `tel:${survPhone.replace(/\D/g, '')}` : 'javascript:void(0)';
    }

    // Progressive Card Visibility based on Stage & Data Presence
    const cardEstimates = document.getElementById('tpCardEstimates');
    if (cardEstimates) {
      const showEstimates = (ticket.current_stage_id >= 2) ||
        (ticket.estimated_cost && Number(ticket.estimated_cost) > 0) ||
        (ticket.parts && ticket.parts.length > 0) ||
        (ticket.damaged_parts && ticket.damaged_parts.trim());
      cardEstimates.style.display = showEstimates ? 'block' : 'none';
    }

    const cardInsurance = document.getElementById('tpCardInsurance');
    if (cardInsurance) {
      const showInsurance = (ticket.current_stage_id >= 3) ||
        Boolean(ticket.insurance_company && ticket.insurance_company.trim()) ||
        Boolean(ticket.surveyor_name && ticket.surveyor_name.trim());
      cardInsurance.style.display = showInsurance ? 'block' : 'none';
    }

    // Reset all cards to view mode when opening ticket
    resetAllTicketCardModes();

    // Bind inline card edit events and autocomplete
    setupInlineCardEditing(ticket);

    // Render interactive 13-stage timeline stepper
    renderTicketPageTimeline(ticket);

    // Load collaborative notes & threaded comments
    loadTicketComments(ticket.id);

    // Switch main view to dedicated ticket page
    switchMainView('ticket-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainArea = document.querySelector('.app-main-area');
    if (mainArea) {
      mainArea.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function renderTicketPageTimeline(ticket) {
  const container = document.getElementById('tpTimelineStepper');
  if (!container) return;
  container.innerHTML = '';

  state.stages.forEach(st => {
    const isCurrent = st.id === ticket.current_stage_id && ticket.status !== 'CLOSED';
    const isDone = st.id < ticket.current_stage_id || ticket.status === 'CLOSED';

    const log = (ticket.logs || []).find(l => l.stage_id === st.id);
    let isSkipped = log && log.sla_status === 'SKIPPED';

    if (!isSkipped && (st.id === 6 || st.id === 7) && ticket.parts_order_required === 0 && ticket.current_stage_id > 5) {
      isSkipped = true;
    }
    if (!isSkipped && st.id === 11 && ticket.resurvey_required === 0 && ticket.current_stage_id >= 12) {
      isSkipped = true;
    }
    if (!isSkipped && isDone && !log && st.id !== 1) {
      isSkipped = true;
    }

    let stepClass = 'step-pending';
    let iconContent = `${st.id}`;
    if (isSkipped) {
      stepClass = 'step-skipped';
      iconContent = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';
    } else if (isCurrent) {
      stepClass = 'step-active';
      iconContent = '<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"></circle></svg>';
    } else if (isDone || log) {
      stepClass = 'step-done';
      iconContent = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }

    let statusText = '';
    let timeText = '';
    if (isSkipped) {
      statusText = '<span style="color:#64748b;font-style:italic;">Skipped / Bypassed</span>';
    } else if (isCurrent) {
      statusText = `<span style="color:#d97706;font-weight:600;">Active Stage (${ticket.stageElapsedWD} WD)</span>`;
      if (log && log.entered_at) {
        timeText = `Entered: ${new Date(log.entered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
      }
    } else if (isDone || log) {
      statusText = `<span style="color:#16a34a;font-weight:600;">Completed (${log ? log.elapsed_wd : 0} WD)</span>`;
      if (log && log.entered_at) {
        timeText = `Entered: ${new Date(log.entered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
        if (log.completed_at) {
          timeText += ` • Finished: ${new Date(log.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
        }
      }
    } else {
      statusText = '<span style="color:#94a3b8;">Pending</span>';
      if (st.slaLimitWD) statusText += ` <span style="font-size:11px;color:#94a3b8;">(Max ${st.slaLimitWD} WD)</span>`;
    }

    let dataSnippet = '';
    if (!isSkipped) {
      if (st.id === 2 && (ticket.estimated_cost || ticket.damaged_parts)) {
        dataSnippet = `₹${(Number(ticket.estimated_cost) || 0).toLocaleString('en-IN')}${ticket.damaged_parts ? ' • ' + escapeHtml(ticket.damaged_parts) : ''}`;
      } else if (st.id === 3 && ticket.insurance_company) {
        dataSnippet = `Insurer: ${escapeHtml(ticket.insurance_company)}`;
      } else if (st.id === 4 && ticket.surveyor_name) {
        dataSnippet = `Surveyor: ${escapeHtml(ticket.surveyor_name)}${ticket.surveyor_phone ? ' (' + escapeHtml(ticket.surveyor_phone) + ')' : ''}`;
      } else if (st.id === 6 && ticket.damaged_parts) {
        dataSnippet = `Parts: ${escapeHtml(ticket.damaged_parts)}`;
      } else if (st.id === 7 && (ticket.parts_arrival_date || (ticket.parts && ticket.parts.length > 0) || isDone || isCurrent)) {
        dataSnippet = `<span class="clickable-parts-arrival-link" onclick="event.stopPropagation(); openPartsArrivalDetailsModal(${ticket.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Parts Arrival Details (Right-click or click)</span>`;
      } else if (log && log.notes) {
        dataSnippet = escapeHtml(log.notes);
      }
    }

    const item = document.createElement('div');
    item.className = `tp-step-item ${stepClass}`;
    if (st.id === 7) {
      item.style.cursor = 'pointer';
      item.title = 'Right-click or click to view Parts Arrival details with logged times';
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPartsArrivalDetailsModal(ticket.id);
      });
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('a')) {
          openPartsArrivalDetailsModal(ticket.id);
        }
      });
    }
    item.innerHTML = `
      <div class="tp-step-node">${iconContent}</div>
      <div class="tp-step-content">
        <div class="tp-step-head">
          <span class="tp-step-name">#${st.id} ${escapeHtml(st.name)}</span>
          <span class="tp-step-badge tp-badge-${stepClass.replace('step-', '')}">${statusText}</span>
        </div>
        ${timeText ? `<div class="tp-step-meta">${timeText}</div>` : ''}
        ${dataSnippet ? `<div class="tp-step-data-box">${dataSnippet}</div>` : ''}
      </div>
    `;
    container.appendChild(item);
  });
}

function getColorSwatchHex(colorName) {
  if (!colorName) return '#94a3b8';
  const c = colorName.toLowerCase();
  if (c.includes('red') || c.includes('cherry') || c.includes('radiant')) return '#dc2626';
  if (c.includes('white') || c.includes('taffeta') || c.includes('pearl') || c.includes('platinum')) return '#f8fafc';
  if (c.includes('black') || c.includes('crystal') || c.includes('midnight')) return '#0f172a';
  if (c.includes('gray') || c.includes('grey') || c.includes('steel') || c.includes('axis') || c.includes('meteoroid')) return '#64748b';
  if (c.includes('silver') || c.includes('lunar') || c.includes('alabaster')) return '#cbd5e1';
  if (c.includes('blue') || c.includes('obsidian') || c.includes('cosmic')) return '#2563eb';
  if (c.includes('brown') || c.includes('golden')) return '#78350f';
  return '#94a3b8';
}

function copyToClipboardWithFeedback(text, label = 'Copied') {
  if (!text || text === '—' || text === 'NOT REGISTERED') {
    showToast('No valid value to copy', 'info');
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`✓ ${label} copied to clipboard!`, 'success');
    }).catch(() => {
      fallbackCopy(text, label);
    });
  } else {
    fallbackCopy(text, label);
  }
}

function fallbackCopy(text, label) {
  try {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast(`✓ ${label} copied to clipboard!`, 'success');
  } catch (err) {
    showToast(`Failed to copy: ${text}`, 'error');
  }
}

// ====================================================
// PROGRESSIVE TICKET CARDS & INLINE CARD EDITING SYSTEM
// ====================================================

function resetAllTicketCardModes() {
  ['customer', 'vehicle', 'estimates', 'insurance'].forEach(type => {
    toggleCardInlineEdit(type, false);
  });
}

function toggleCardInlineEdit(cardType, isEditing) {
  const cap = cardType.charAt(0).toUpperCase() + cardType.slice(1);
  const viewEl = document.getElementById(`tp${cap}ViewBody`);
  const editEl = document.getElementById(`tp${cap}EditBody`);
  const btnEdit = document.getElementById(`tpBtnEdit${cap}`);

  if (viewEl) viewEl.style.display = isEditing ? 'none' : 'block';
  if (editEl) editEl.style.display = isEditing ? 'block' : 'none';
  if (btnEdit) btnEdit.classList.toggle('active', isEditing);
}

window.toggleCardInlineEdit = toggleCardInlineEdit;

function setupInlineCardEditing(ticket) {
  if (!ticket) return;

  // 1. CUSTOMER CARD
  const btnEditCustomer = document.getElementById('tpBtnEditCustomer');
  const btnCancelCustomer = document.getElementById('tpBtnCancelEditCustomer');
  const btnSaveCustomer = document.getElementById('tpBtnSaveCustomer');
  const inputCustName = document.getElementById('tpInputCustName');
  const inputCustPhone = document.getElementById('tpInputCustPhone');
  const inputSwitchCust = document.getElementById('tpInputSwitchCustomer');
  const switchCustBox = document.getElementById('tpSwitchCustomerSuggestions');

  if (inputCustName) inputCustName.value = ticket.customer_name || '';
  if (inputCustPhone) inputCustPhone.value = ticket.customer_phone || '';
  if (inputSwitchCust) inputSwitchCust.value = '';

  if (btnEditCustomer) {
    btnEditCustomer.onclick = () => {
      const isCurrentlyEditing = document.getElementById('tpCustomerEditBody')?.style.display === 'block';
      toggleCardInlineEdit('customer', !isCurrentlyEditing);
      if (!isCurrentlyEditing && inputCustName) inputCustName.focus();
    };
  }
  if (btnCancelCustomer) {
    btnCancelCustomer.onclick = () => toggleCardInlineEdit('customer', false);
  }

  // Quick Switch Customer Typeahead
  if (inputSwitchCust && switchCustBox) {
    let switchDebounce = null;
    inputSwitchCust.oninput = () => {
      clearTimeout(switchDebounce);
      const val = inputSwitchCust.value.trim();
      if (val.length < 2) {
        switchCustBox.style.display = 'none';
        return;
      }
      switchDebounce = setTimeout(async () => {
        try {
          const res = await fetch(`/api/lookup/customers?q=${encodeURIComponent(val)}`);
          if (!res.ok) return;
          const matches = await res.json();
          if (matches && matches.length > 0) {
            switchCustBox.innerHTML = '';
            matches.forEach(c => {
              const div = document.createElement('div');
              div.className = 'suggestion-item';
              div.innerHTML = `
                <div class="sugg-primary">${escapeHtml(c.customer_name)} <span style="font-size:11px;color:#64748b;margin-left:6px;">(${escapeHtml(c.primary_phone || '')})</span></div>
                <div class="sugg-secondary">${escapeHtml(c.model || c.vehicle_name || 'Honda Vehicle')} • ${escapeHtml(c.vehicle_no || 'No Plate')}</div>
              `;
              div.onmousedown = (e) => {
                e.preventDefault();
                // Auto populate customer fields
                if (inputCustName) inputCustName.value = c.customer_name;
                if (inputCustPhone) inputCustPhone.value = c.primary_phone;
                // Also auto populate vehicle fields if present
                const vm = document.getElementById('tpInputVehicleModel');
                if (vm && (c.model || c.vehicle_name)) vm.value = c.model || c.vehicle_name;
                const vc = document.getElementById('tpInputVehicleColor');
                if (vc && c.color) vc.value = c.color;
                const vn = document.getElementById('tpInputVehicleNo');
                if (vn && c.vehicle_no) vn.value = c.vehicle_no;
                const vch = document.getElementById('tpInputChassis');
                if (vch && c.chassis_no) vch.value = c.chassis_no;

                inputSwitchCust.value = `${c.customer_name} (${c.primary_phone})`;
                switchCustBox.style.display = 'none';
                showToast(`✓ Selected ${c.customer_name}. Click Save to apply switch.`, 'info');
              };
              switchCustBox.appendChild(div);
            });
            positionSuggestionBox(switchCustBox);
            switchCustBox.style.display = 'block';
          } else {
            switchCustBox.style.display = 'none';
          }
        } catch (err) {
          console.error('Customer lookup error:', err);
        }
      }, 150);
    };

    inputSwitchCust.onblur = () => {
      setTimeout(() => { switchCustBox.style.display = 'none'; }, 250);
    };
  }

  if (btnSaveCustomer) {
    btnSaveCustomer.onclick = async () => {
      const name = inputCustName?.value?.trim();
      const phone = inputCustPhone?.value?.trim();
      if (!name || !phone) {
        showToast('Customer Name and Primary Phone are required', 'error');
        return;
      }
      btnSaveCustomer.disabled = true;
      btnSaveCustomer.textContent = 'Saving...';
      try {
        const res = await fetch(`/api/tickets/${ticket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: name,
            customerPhone: phone,
            syncCrm: true
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update customer');
        }
        showToast('✓ Customer profile updated', 'success');
        await refreshTickets();
        await openTicketPage(ticket.id);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (btnSaveCustomer) {
          btnSaveCustomer.disabled = false;
          btnSaveCustomer.textContent = 'Save Customer';
        }
      }
    };
  }

  // 2. VEHICLE CARD
  const btnEditVehicle = document.getElementById('tpBtnEditVehicle');
  const btnCancelVehicle = document.getElementById('tpBtnCancelEditVehicle');
  const btnSaveVehicle = document.getElementById('tpBtnSaveVehicle');
  const inputModel = document.getElementById('tpInputVehicleModel');
  const inputColor = document.getElementById('tpInputVehicleColor');
  const inputNo = document.getElementById('tpInputVehicleNo');
  const inputChassis = document.getElementById('tpInputChassis');

  if (inputModel) inputModel.value = ticket.model || ticket.vehicle_name || '';
  if (inputColor) inputColor.value = ticket.color || '';
  if (inputNo) inputNo.value = ticket.vehicle_no || '';
  if (inputChassis) inputChassis.value = ticket.chassis_number || '';

  if (btnEditVehicle) {
    btnEditVehicle.onclick = () => {
      const isCurrentlyEditing = document.getElementById('tpVehicleEditBody')?.style.display === 'block';
      toggleCardInlineEdit('vehicle', !isCurrentlyEditing);
      if (!isCurrentlyEditing && inputModel) inputModel.focus();
    };
  }
  if (btnCancelVehicle) {
    btnCancelVehicle.onclick = () => toggleCardInlineEdit('vehicle', false);
  }

  if (btnSaveVehicle) {
    btnSaveVehicle.onclick = async () => {
      const model = inputModel?.value?.trim();
      if (!model) {
        showToast('Vehicle Model name is required', 'error');
        return;
      }
      btnSaveVehicle.disabled = true;
      btnSaveVehicle.textContent = 'Saving...';
      try {
        const res = await fetch(`/api/tickets/${ticket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleName: model,
            model: model,
            color: inputColor?.value?.trim() || '',
            vehicleNo: inputNo?.value?.trim() || '',
            chassisNumber: inputChassis?.value?.trim() || '',
            syncCrm: true
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update vehicle');
        }
        showToast('✓ Vehicle specifications updated', 'success');
        await refreshTickets();
        await openTicketPage(ticket.id);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (btnSaveVehicle) {
          btnSaveVehicle.disabled = false;
          btnSaveVehicle.textContent = 'Save Vehicle';
        }
      }
    };
  }

  // 3. ESTIMATES & SCOPE CARD
  const btnEditEstimates = document.getElementById('tpBtnEditEstimates');
  const btnCancelEstimates = document.getElementById('tpBtnCancelEditEstimates');
  const btnSaveEstimates = document.getElementById('tpBtnSaveEstimates');
  const inputJobNotes = document.getElementById('tpInputJobNotes');
  const inputCost = document.getElementById('tpInputEstimatedCost');
  const inlineTbody = document.getElementById('tpInlinePartsTableBody');
  const inlineTotalVal = document.getElementById('tpInlinePartsTotalVal');
  const btnAddInlinePart = document.getElementById('tpBtnInlineAddPartRow');

  if (inputJobNotes) inputJobNotes.value = ticket.damaged_parts || '';
  if (inputCost) inputCost.value = ticket.estimated_cost || 0;

  if (btnEditEstimates) {
    btnEditEstimates.onclick = () => {
      const isCurrentlyEditing = document.getElementById('tpEstimatesEditBody')?.style.display === 'block';
      toggleCardInlineEdit('estimates', !isCurrentlyEditing);
      if (!isCurrentlyEditing) {
        let initialParts = (ticket.parts && ticket.parts.length > 0) ? ticket.parts : [];
        if (initialParts.length === 0 && ticket.damaged_parts) {
          const legacy = ticket.damaged_parts.split(',').map(s => s.trim()).filter(Boolean);
          if (legacy.length > 0) initialParts = legacy.map(p => ({ part_name: p, quantity: 1, unit_cost: 0 }));
        }
        state.tpInlinePartsBuilder = setupPartsTableBuilder({
          tbodyEl: inlineTbody,
          totalValEl: inlineTotalVal,
          costInputEl: inputCost,
          addBtnEl: btnAddInlinePart,
          initialParts
        });
      }
    };
  }
  if (btnCancelEstimates) {
    btnCancelEstimates.onclick = () => toggleCardInlineEdit('estimates', false);
  }

  if (btnSaveEstimates) {
    btnSaveEstimates.onclick = async () => {
      const parts = state.tpInlinePartsBuilder ? state.tpInlinePartsBuilder.getParts() : [];
      const notes = inputJobNotes?.value?.trim() || '';
      let damagedPartsSummary = notes;
      if (parts.length > 0) {
        const summary = parts.map(p => `${p.part_name} (x${p.quantity})`).join(', ');
        damagedPartsSummary = notes ? `${summary} • ${notes}` : summary;
      }
      btnSaveEstimates.disabled = true;
      btnSaveEstimates.textContent = 'Saving...';
      try {
        const res = await fetch(`/api/tickets/${ticket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parts,
            damagedParts: damagedPartsSummary,
            estimatedCost: Number(inputCost?.value) || 0
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update estimates');
        }
        showToast('✓ Estimates & damaged parts updated', 'success');
        await refreshTickets();
        await openTicketPage(ticket.id);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (btnSaveEstimates) {
          btnSaveEstimates.disabled = false;
          btnSaveEstimates.textContent = 'Save Estimates';
        }
      }
    };
  }

  // 4. INSURANCE & SURVEYOR CARD
  const btnEditInsurance = document.getElementById('tpBtnEditInsurance');
  const btnCancelInsurance = document.getElementById('tpBtnCancelEditInsurance');
  const btnSaveInsurance = document.getElementById('tpBtnSaveInsurance');
  const inputInsCompany = document.getElementById('tpInputInsuranceCompany');
  const inputSurvName = document.getElementById('tpInputSurveyorName');
  const inputSurvPhone = document.getElementById('tpInputSurveyorPhone');
  const suggestInsurersBox = document.getElementById('tpSuggestInsurers');
  const suggestSurveyorsBox = document.getElementById('tpSuggestSurveyors');

  if (inputInsCompany) inputInsCompany.value = ticket.insurance_company || '';
  if (inputSurvName) inputSurvName.value = ticket.surveyor_name || '';
  if (inputSurvPhone) inputSurvPhone.value = ticket.surveyor_phone || '';

  if (btnEditInsurance) {
    btnEditInsurance.onclick = () => {
      const isCurrentlyEditing = document.getElementById('tpInsuranceEditBody')?.style.display === 'block';
      toggleCardInlineEdit('insurance', !isCurrentlyEditing);
      if (!isCurrentlyEditing && inputInsCompany) inputInsCompany.focus();
    };
  }
  if (btnCancelInsurance) {
    btnCancelInsurance.onclick = () => toggleCardInlineEdit('insurance', false);
  }

  // Insurers lookup typeahead
  if (inputInsCompany && suggestInsurersBox) {
    inputInsCompany.oninput = async () => {
      const val = inputInsCompany.value.trim();
      if (val.length < 2) { suggestInsurersBox.style.display = 'none'; return; }
      try {
        const res = await fetch(`/api/lookup/insurers?q=${encodeURIComponent(val)}`);
        const insurers = await res.json();
        if (insurers && insurers.length > 0) {
          suggestInsurersBox.innerHTML = '';
          insurers.forEach(ins => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<div class="sugg-primary">${escapeHtml(ins.name)}</div><div class="sugg-secondary">${escapeHtml(ins.contact_info || '')}</div>`;
            div.onmousedown = (e) => {
              e.preventDefault();
              inputInsCompany.value = ins.name;
              suggestInsurersBox.style.display = 'none';
            };
            suggestInsurersBox.appendChild(div);
          });
          positionSuggestionBox(suggestInsurersBox);
          suggestInsurersBox.style.display = 'block';
        } else {
          suggestInsurersBox.style.display = 'none';
        }
      } catch (err) { }
    };
    inputInsCompany.onblur = () => { setTimeout(() => { suggestInsurersBox.style.display = 'none'; }, 250); };
  }

  // Surveyors lookup typeahead
  if (inputSurvName && suggestSurveyorsBox) {
    inputSurvName.oninput = async () => {
      const val = inputSurvName.value.trim();
      if (val.length < 2) { suggestSurveyorsBox.style.display = 'none'; return; }
      try {
        const ins = inputInsCompany ? inputInsCompany.value.trim() : '';
        const res = await fetch(`/api/lookup/surveyors?q=${encodeURIComponent(val)}&insurerName=${encodeURIComponent(ins)}`);
        const surveyors = await res.json();
        if (surveyors && surveyors.length > 0) {
          suggestSurveyorsBox.innerHTML = '';
          surveyors.forEach(s => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<div class="sugg-primary">${escapeHtml(s.name)}</div><div class="sugg-secondary">${escapeHtml(s.phone)}</div>`;
            div.onmousedown = (e) => {
              e.preventDefault();
              inputSurvName.value = s.name;
              if (inputSurvPhone) inputSurvPhone.value = s.phone;
              suggestSurveyorsBox.style.display = 'none';
            };
            suggestSurveyorsBox.appendChild(div);
          });
          positionSuggestionBox(suggestSurveyorsBox);
          suggestSurveyorsBox.style.display = 'block';
        } else {
          suggestSurveyorsBox.style.display = 'none';
        }
      } catch (err) { }
    };
    inputSurvName.onblur = () => { setTimeout(() => { suggestSurveyorsBox.style.display = 'none'; }, 250); };
  }

  if (btnSaveInsurance) {
    btnSaveInsurance.onclick = async () => {
      btnSaveInsurance.disabled = true;
      btnSaveInsurance.textContent = 'Saving...';
      try {
        const res = await fetch(`/api/tickets/${ticket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insuranceCompany: inputInsCompany?.value?.trim() || '',
            surveyorName: inputSurvName?.value?.trim() || '',
            surveyorPhone: inputSurvPhone?.value?.trim() || '',
            syncCrm: true
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update insurance details');
        }
        showToast('✓ Insurance & surveyor details updated', 'success');
        await refreshTickets();
        await openTicketPage(ticket.id);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (btnSaveInsurance) {
          btnSaveInsurance.disabled = false;
          btnSaveInsurance.textContent = 'Save Insurance';
        }
      }
    };
  }
}

// Open Safe Edit Ticket Modal (Legacy fallback)
window.openEditTicketPageModal = async function (ticketId) {
  let ticket = (state.tickets || []).find(t => t.id == ticketId) || state.currentEditingTicket;
  if (!ticket) return;

  // Guarantee parts are loaded
  if (!ticket.parts) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (res.ok) {
        const freshTicket = await res.json();
        ticket = { ...ticket, ...freshTicket };
        if (state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
          state.currentEditingTicket = ticket;
        }
      }
    } catch (e) {
      console.error('Failed to fetch ticket parts for edit modal:', e);
    }
  }

  const editId = document.getElementById('meditTicketId');
  if (editId) editId.value = ticket.id;

  const titleEl = document.getElementById('meditModalTitle');
  if (titleEl) titleEl.textContent = `Edit Details • ${ticket.ticket_number}`;

  const branchBadge = document.getElementById('meditBranchBadge');
  if (branchBadge) branchBadge.textContent = (ticket.branch_name || ticket.outlet_name || 'Workshop').replace('Honda ', '');

  // Section 1: Operational Service Scope (Safe to edit)
  const meditTbody = document.getElementById('meditPartsTableBody');
  const meditTotalVal = document.getElementById('meditPartsTotalVal');
  const meditCostInput = document.getElementById('meditEstimatedCost');
  const meditAddBtn = document.getElementById('meditBtnAddPartRow');
  const meditNotes = document.getElementById('meditJobNotes');

  let initialParts = (ticket.parts && ticket.parts.length > 0) ? ticket.parts : [];
  if (initialParts.length === 0 && ticket.damaged_parts) {
    const legacyParts = ticket.damaged_parts.split(',').map(s => s.trim()).filter(Boolean);
    if (legacyParts.length > 0) {
      initialParts = legacyParts.map(p => ({ part_name: p, quantity: 1, unit_cost: 0 }));
    }
  }

  state.meditPartsBuilder = setupPartsTableBuilder({
    tbodyEl: meditTbody,
    totalValEl: meditTotalVal,
    costInputEl: meditCostInput,
    addBtnEl: meditAddBtn,
    initialParts
  });

  if (meditNotes) {
    meditNotes.value = ticket.damaged_parts || '';
  }
  if (meditCostInput) {
    meditCostInput.value = ticket.estimated_cost || 0;
  }
  const icEl = document.getElementById('meditInsuranceCompany');
  if (icEl) icEl.value = ticket.insurance_company || '';
  const snEl = document.getElementById('meditSurveyorName');
  if (snEl) snEl.value = ticket.surveyor_name || '';
  const spEl = document.getElementById('meditSurveyorPhone');
  if (spEl) spEl.value = ticket.surveyor_phone || '';

  // Section 2: Master CRM Records (Guarded)
  const cnEl = document.getElementById('meditCustomerName');
  if (cnEl) cnEl.value = ticket.customer_name || '';
  const cpEl = document.getElementById('meditCustomerPhone');
  if (cpEl) cpEl.value = ticket.customer_phone || '';
  const vnEl = document.getElementById('meditVehicleName');
  if (vnEl) vnEl.value = ticket.model || ticket.vehicle_name || '';
  const vcEl = document.getElementById('meditVehicleColor');
  if (vcEl) vcEl.value = ticket.color || '';
  const vrEl = document.getElementById('meditVehicleNo');
  if (vrEl) vrEl.value = ticket.vehicle_no || '';
  const chEl = document.getElementById('meditChassisNumber');
  if (chEl) chEl.value = ticket.chassis_number || '';

  // Always reset to locked state when opening modal
  setCrmFieldsLocked(true);

  openModal('modalEditTicketPage');
};

function toggleCrmFieldsLock() {
  const phoneField = document.getElementById('meditCustomerPhone');
  const isCurrentlyLocked = phoneField ? phoneField.disabled : true;
  setCrmFieldsLocked(!isCurrentlyLocked);
}

function setCrmFieldsLocked(locked) {
  const crmInputs = document.querySelectorAll('#modalEditTicketPage .crm-field');
  crmInputs.forEach(input => {
    input.disabled = locked;
  });

  const badge = document.getElementById('meditCrmLockStatusBadge');
  const btnIcon = document.getElementById('meditLockBtnIcon');
  const btnText = document.getElementById('meditLockBtnText');
  const syncWrap = document.getElementById('meditCrmSyncWrap');

  const lockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  const unlockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;

  if (locked) {
    if (badge) {
      badge.textContent = 'Locked for Safety';
      badge.className = 'badge badge-crm';
    }
    if (btnIcon) btnIcon.innerHTML = unlockSvg;
    if (btnText) btnText.textContent = 'Unlock Master Fields';
    if (syncWrap) syncWrap.style.display = 'none';
  } else {
    if (badge) {
      badge.textContent = 'Unlocked (Master Edits Active)';
      badge.className = 'badge badge-crm unlocked';
    }
    if (btnIcon) btnIcon.innerHTML = lockSvg;
    if (btnText) btnText.textContent = 'Re-lock Fields';
    if (syncWrap) syncWrap.style.display = 'block';
  }
}

async function handleEditTicketPageSubmit(e) {
  if (e) e.preventDefault();
  const ticketId = document.getElementById('meditTicketId').value;
  if (!ticketId) return;

  const phoneInput = document.getElementById('meditCustomerPhone');
  const isCrmUnlocked = phoneInput ? !phoneInput.disabled : false;
  const syncCheckbox = document.getElementById('meditSyncCrmCheckbox');
  const syncCrm = isCrmUnlocked && syncCheckbox ? syncCheckbox.checked : false;

  const parts = state.meditPartsBuilder ? state.meditPartsBuilder.getParts() : [];
  const notes = document.getElementById('meditJobNotes')?.value?.trim() || '';

  let damagedPartsSummary = notes;
  if (parts.length > 0) {
    const summary = parts.map(p => `${p.part_name} (x${p.quantity})`).join(', ');
    damagedPartsSummary = notes ? `${summary} • ${notes}` : summary;
  }

  const payload = {
    parts: parts,
    damagedParts: damagedPartsSummary,
    estimatedCost: Number(document.getElementById('meditEstimatedCost').value) || 0,
    insuranceCompany: document.getElementById('meditInsuranceCompany').value,
    surveyorName: document.getElementById('meditSurveyorName').value,
    surveyorPhone: document.getElementById('meditSurveyorPhone').value,
    syncCrm: syncCrm
  };

  // Only include master CRM records if user explicitly unlocked them
  if (isCrmUnlocked) {
    payload.customerName = document.getElementById('meditCustomerName').value.trim();
    payload.customerPhone = document.getElementById('meditCustomerPhone').value.trim();
    payload.vehicleName = document.getElementById('meditVehicleName').value.trim();
    payload.model = document.getElementById('meditVehicleName').value.trim();
    payload.color = document.getElementById('meditVehicleColor').value.trim();
    payload.vehicleNo = document.getElementById('meditVehicleNo').value.trim();
    payload.chassisNumber = document.getElementById('meditChassisNumber').value.trim();

    if (!payload.customerName || !payload.customerPhone) {
      showToast('Customer Name and Primary Phone are required when editing CRM data', 'error');
      return;
    }
  }

  try {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update ticket details');
    }

    closeModal('modalEditTicketPage');
    showToast('✓ Ticket details saved successfully!', 'success');
    await refreshTickets();
    await openTicketPage(ticketId);
    if (typeof loadDirectoryCounts === 'function') {
      loadDirectoryCounts();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleTicketPageSubmit(e) {
  handleEditTicketPageSubmit(e);
}

window.deleteTicket = async function (ticketId) {
  if (!ticketId) return;

  const ticket = (state.tickets || []).find(t => t.id == ticketId) || state.currentEditingTicket;
  const ticketNo = ticket ? ticket.ticket_number : `#${ticketId}`;

  const confirmed = await showConfirmDialog({
    title: 'Delete Ticket',
    message: `Are you sure you want to permanently delete ticket ${ticketNo}?\n\nThis will remove the ticket, all stage logs, and SLA records permanently.`,
    confirmText: 'Delete Ticket'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete ticket');
    }

    if (state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      state.currentEditingTicket = null;
      switchMainView('board');
    }
    showToast(`Ticket ${ticketNo} permanently deleted`, 'info');
    await refreshTickets();
    if (typeof loadDirectoryCounts === 'function') {
      loadDirectoryCounts();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function handleDeleteTicketFromPage() {
  const ticketId = document.getElementById('tpId')?.value;
  if (ticketId) window.deleteTicket(ticketId);
}

// ====================================================
// RIGHT-CLICK CONTEXT MENU CONTROLLERS
// ====================================================
let currentContextMenuTicketId = null;

window.openTicketContextMenu = async function (e, ticketId) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }
  const menu = document.getElementById('ticketContextMenu');
  if (!menu) return;

  const tid = Number(ticketId);
  let ticket = (state.tickets || []).find(t => t.id == tid) || state.currentEditingTicket;
  if (!ticket && state.currentSurveyorTickets) {
    ticket = state.currentSurveyorTickets.find(t => t.id == tid);
  }
  if (!ticket && state.currentCustomerTickets) {
    ticket = state.currentCustomerTickets.find(t => t.id == tid);
  }
  if (!ticket && state.currentInsurerTickets) {
    ticket = state.currentInsurerTickets.find(t => t.id == tid);
  }
  if (!ticket) {
    try {
      const res = await fetch(`/api/tickets/${tid}`);
      if (res.ok) ticket = await res.json();
    } catch (err) {
      console.error('Failed to fetch ticket for context menu', err);
    }
  }
  if (!ticket) return;

  currentContextMenuTicketId = ticket.id;

  const ticketNoEl = document.getElementById('ctxTicketNo');
  if (ticketNoEl) ticketNoEl.textContent = ticket.ticket_number;

  const stageEl = document.getElementById('ctxTicketStage');
  if (stageEl) stageEl.textContent = `Stage #${ticket.current_stage_id}`;

  // Stage 6 (Parts Order): Show "Parts" option to add parts and mark parts as arrived
  const ctxPartsOrder = document.getElementById('ctxActionPartsOrder');
  if (ctxPartsOrder) {
    ctxPartsOrder.style.display = (ticket.current_stage_id === 6) ? 'flex' : 'none';
  }

  // Stage 7 (Parts Arrival): Show "Parts Arrival Details" option to view arrival logged times
  const ctxPartsArrival = document.getElementById('ctxActionPartsArrivalDetails');
  if (ctxPartsArrival) {
    ctxPartsArrival.style.display = (ticket.current_stage_id === 7 || ticket.parts_arrival_date || ticket.current_stage_id > 7) ? 'flex' : 'none';
  }

  const ctxBypass = document.getElementById('ctxActionBypass');
  if (ctxBypass) {
    ctxBypass.style.display = (ticket.status === 'IN_PROGRESS' && canWriteStage(ticket.current_stage_id)) ? 'flex' : 'none';
  }

  const ctxDelete = document.getElementById('ctxActionDelete');
  if (ctxDelete) {
    ctxDelete.style.display = canDeleteStage(ticket.current_stage_id) ? 'flex' : 'none';
  }

  menu.style.display = 'flex';

  const menuWidth = menu.offsetWidth || 230;
  const menuHeight = menu.offsetHeight || 220;

  let x = e ? (e.clientX || 100) : 100;
  let y = e ? (e.clientY || 100) : 100;

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 10;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 10;
  }

  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;
};

window.closeTicketContextMenu = function () {
  const menu = document.getElementById('ticketContextMenu');
  if (menu) menu.style.display = 'none';
  currentContextMenuTicketId = null;
};

// ====================================================
// PARTS ORDER & ARRIVAL MODAL CONTROLLERS (STAGE 6 & 7)
// ====================================================

window.openManagePartsModal = async function (ticketId) {
  const tid = Number(ticketId);
  const idInp = document.getElementById('managePartsTicketId');
  if (idInp) idInp.value = tid;

  let ticket = (state.tickets || []).find(t => t.id == tid) || state.currentEditingTicket;
  try {
    const res = await fetch(`/api/tickets/${tid}`);
    if (res.ok) {
      ticket = await res.json();
      const idx = (state.tickets || []).findIndex(t => t.id == tid);
      if (idx !== -1) state.tickets[idx] = ticket;
      if (state.currentEditingTicket && state.currentEditingTicket.id == tid) {
        state.currentEditingTicket = ticket;
      }
    }
  } catch (e) {
    console.error('Failed to fetch ticket for parts management:', e);
  }

  const titleEl = document.getElementById('managePartsModalTitle');
  const subEl = document.getElementById('managePartsModalSub');
  if (titleEl) titleEl.textContent = `Parts Order & Arrival • ${ticket ? ticket.ticket_number : 'Ticket #' + tid}`;
  if (subEl) subEl.textContent = `Stage #${ticket ? ticket.current_stage_id : '6'}: Parts Order • ${ticket ? (ticket.vehicle_name || ticket.model || 'Honda') : ''} • Add parts or mark arrival`;

  // Clear input fields
  const nameInp = document.getElementById('mgmtNewPartName');
  const codeInp = document.getElementById('mgmtNewPartCode');
  const qtyInp = document.getElementById('mgmtNewPartQty');
  const costInp = document.getElementById('mgmtNewPartCost');
  if (nameInp) nameInp.value = '';
  if (codeInp) codeInp.value = '';
  if (qtyInp) qtyInp.value = '1';
  if (costInp) costInp.value = '';

  await refreshManagePartsTable(tid);
  setupManagePartsAutocomplete(tid);
  document.getElementById('modalManageParts').style.display = 'flex';
};

async function refreshManagePartsTable(ticketId) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}/parts`);
    if (!res.ok) throw new Error('Failed to fetch parts');
    const parts = await res.json();

    const tbody = document.getElementById('mgmtPartsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const totalCount = parts.length;
    const arrivedCount = parts.filter(p => p.part_status === 'ARRIVED').length;
    const pendingCount = totalCount - arrivedCount;
    const totalCost = parts.reduce((acc, p) => acc + (Number(p.total_cost) || 0), 0);

    const totalCountEl = document.getElementById('mgmtPartsTotalCount');
    const arrivedCountEl = document.getElementById('mgmtPartsArrivedCount');
    const pendingCountEl = document.getElementById('mgmtPartsPendingCount');
    const totalCostEl = document.getElementById('mgmtPartsTotalCost');

    if (totalCountEl) totalCountEl.textContent = totalCount;
    if (arrivedCountEl) arrivedCountEl.textContent = arrivedCount;
    if (pendingCountEl) pendingCountEl.textContent = pendingCount;
    if (totalCostEl) totalCostEl.textContent = `₹${totalCost.toLocaleString('en-IN')}`;

    if (parts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px 12px; color: #94a3b8; font-size: 13px;">
            No parts ordered yet. Use the form above to add parts to this ticket.
          </td>
        </tr>
      `;
      return;
    }

    parts.forEach((p, idx) => {
      const isArrived = p.part_status === 'ARRIVED';
      const arrivedTimeFormatted = p.arrived_at
        ? new Date(p.arrived_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #f1f5f9';
      tr.style.fontSize = '12px';
      tr.innerHTML = `
        <td style="padding: 8px 12px; text-align: center; color: #94a3b8;">${idx + 1}</td>
        <td style="padding: 8px 12px;">
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(p.part_name)}</div>
          ${p.part_code ? `<div style="font-size: 11px; color: #64748b;">Code: ${escapeHtml(p.part_code)}</div>` : ''}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-weight: 600;">${p.quantity || 1}</td>
        <td style="padding: 8px 12px; text-align: right; font-weight: 600;">₹${(Number(p.total_cost) || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 8px 12px; text-align: center;">
          <span class="${isArrived ? 'badge-part-arrived' : 'badge-part-ordered'}">
            ${isArrived ? 'ARRIVED' : 'ORDERED'}
          </span>
          ${isArrived && arrivedTimeFormatted ? `<span class="tag-arrived-time" title="Logged arrival timestamp: ${arrivedTimeFormatted}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${arrivedTimeFormatted}</span>` : ''}
        </td>
        <td style="padding: 8px 12px; text-align: center;">
          <button type="button" class="btn-toggle-arrive ${isArrived ? 'is-arrived' : 'is-ordered'}" onclick="togglePartArrivalStatus(${ticketId}, ${p.id}, '${isArrived ? 'ORDERED' : 'ARRIVED'}')">
            ${isArrived ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Arrived' : 'Mark Arrived'}
          </button>
        </td>
        <td style="padding: 8px 12px; text-align: center;">
          <button type="button" class="btn-action-icon" style="color: #ef4444; padding: 4px;" title="Delete Part" onclick="deletePartItem(${ticketId}, ${p.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast('Failed to refresh parts table: ' + err.message, 'error');
  }
}

window.togglePartArrivalStatus = async function (ticketId, partId, newStatus) {
  try {
    const res = await fetch(`/api/tickets/${ticketId}/parts/${partId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Failed to update part status');
    showToast(newStatus === 'ARRIVED' ? '✓ Part marked as arrived with timestamp' : 'Part status updated to ordered', 'success');
    await refreshManagePartsTable(ticketId);
    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      openTicketPage(ticketId);
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.deletePartItem = async function (ticketId, partId) {
  if (!await showConfirmDialog({
    title: 'Remove Part Item',
    message: 'Are you sure you want to remove this part item from the ticket?',
    confirmText: 'Remove'
  })) return;
  try {
    const res = await fetch(`/api/tickets/${ticketId}/parts/${partId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete part');
    showToast('Part removed from ticket', 'success');
    await refreshManagePartsTable(ticketId);
    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      openTicketPage(ticketId);
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
};

function setupManagePartsAutocomplete(ticketId) {
  const nameInp = document.getElementById('mgmtNewPartName');
  const codeInp = document.getElementById('mgmtNewPartCode');
  const costInp = document.getElementById('mgmtNewPartCost');
  const box = document.getElementById('mgmtSuggestParts');
  if (!nameInp || !box) return;

  nameInp.oninput = async () => {
    const q = nameInp.value.trim();
    if (q.length < 2) { box.style.display = 'none'; return; }
    try {
      const res = await fetch(`/api/lookup/parts?q=${encodeURIComponent(q)}`);
      const parts = await res.json();
      if (parts.length > 0) {
        box.innerHTML = '';
        parts.forEach(p => {
          const div = document.createElement('div');
          div.className = 'suggestion-item';
          div.innerHTML = `<div class="sugg-primary">${escapeHtml(p.name)}</div>${p.cost ? `<div class="sugg-secondary">₹${Number(p.cost).toLocaleString('en-IN')}</div>` : ''}`;
          div.onmousedown = (e) => {
            e.preventDefault();
            nameInp.value = p.name;
            if (p.code && codeInp) codeInp.value = p.code;
            if (p.cost && costInp) costInp.value = p.cost;
            box.style.display = 'none';
          };
          box.appendChild(div);
        });
        box.style.display = 'block';
      } else {
        box.style.display = 'none';
      }
    } catch (e) {
      box.style.display = 'none';
    }
  };
  nameInp.onblur = () => { setTimeout(() => { box.style.display = 'none'; }, 200); };
}

window.openPartsArrivalDetailsModal = async function (ticketId) {
  const tid = Number(ticketId);
  let ticket = (state.tickets || []).find(t => t.id == tid) || state.currentEditingTicket;
  let parts = [];
  try {
    const res = await fetch(`/api/tickets/${tid}`);
    if (res.ok) {
      ticket = await res.json();
      parts = ticket.parts || [];
    }
  } catch (e) {
    console.error('Failed to fetch ticket for parts arrival details:', e);
  }

  if (!parts || parts.length === 0) {
    try {
      const pRes = await fetch(`/api/tickets/${tid}/parts`);
      if (pRes.ok) parts = await pRes.json();
    } catch (e) { }
  }

  const titleEl = document.getElementById('partsArrivalDetailsModalTitle');
  const subEl = document.getElementById('partsArrivalDetailsModalSub');
  if (titleEl) titleEl.textContent = `Parts Arrival Details • ${ticket ? ticket.ticket_number : 'Ticket #' + tid}`;
  if (subEl) subEl.textContent = `${ticket ? (ticket.vehicle_name || ticket.model || 'Honda') : ''} • Stage #${ticket ? ticket.current_stage_id : '7'} Verification Log`;

  const container = document.getElementById('partsArrivalDetailsContent');
  if (!container) return;

  const arrivedParts = parts.filter(p => p.part_status === 'ARRIVED');
  const stage7DateFormatted = ticket && ticket.parts_arrival_date
    ? new Date(ticket.parts_arrival_date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  if (parts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: #64748b;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="margin-bottom: 8px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
        <p style="font-weight: 600; color: #334155; margin-bottom: 4px;">No discrete part items recorded</p>
        <p style="font-size: 12px;">Stage 7 parts arrival verified on ${stage7DateFormatted || 'ticket transition'}.</p>
      </div>
    `;
  } else {
    const cardsHtml = parts.map((p, idx) => {
      const isArrived = p.part_status === 'ARRIVED';
      const arrivedTimeFormatted = p.arrived_at
        ? new Date(p.arrived_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : (isArrived && stage7DateFormatted ? stage7DateFormatted : 'Time logged on stage transition');

      return `
        <div class="parts-arrival-audit-card">
          <div style="flex: 1;">
            <div style="display:flex;align-items:center;gap:6px;">
              <strong style="font-size:13px;color:#1e293b;">${escapeHtml(p.part_name)}</strong>
              ${p.part_code ? `<span style="font-size:11px;color:#64748b;">(${escapeHtml(p.part_code)})</span>` : ''}
              <span class="checklist-qty-pill">Qty: ${p.quantity || 1}</span>
            </div>
            ${p.notes ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">Note: ${escapeHtml(p.notes)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            ${isArrived ? `
              <div class="arrival-time-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Arrived
              </div>
              <div style="font-size:11px;color:#15803d;font-weight:600;margin-top:3px;display:flex;align-items:center;justify-content:flex-end;gap:3px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>${arrivedTimeFormatted}</span>
              </div>
            ` : `
              <span class="badge-part-ordered">PENDING ARRIVAL</span>
            `}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Stage 7 Parts Arrival Record</span>
          <div style="font-size: 13px; font-weight: 700; color: #047857; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>${arrivedParts.length} of ${parts.length} Parts Logged Arrived</span>
          </div>
        </div>
        ${stage7DateFormatted ? `
          <div style="text-align: right;">
            <span style="font-size: 11px; color: #64748b;">Stage Verified Date:</span>
            <div style="font-size: 12px; font-weight: 600; color: #334155;">${stage7DateFormatted}</div>
          </div>
        ` : ''}
      </div>
      <div style="max-height: 360px; overflow-y: auto;">
        ${cardsHtml}
      </div>
    `;
  }

  document.getElementById('modalPartsArrivalDetails').style.display = 'flex';
};


// ====================================================
// PARTS STATUS & DELAY NOTE CONTROLLERS
// ====================================================
window.openPartsNoteModal = async function (ticketId) {
  let ticket = (state.tickets || []).find(t => t.id == ticketId) || state.currentEditingTicket;
  if (!ticket || !ticket.ticket_number) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (res.ok) {
        ticket = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch ticket for parts note modal:', e);
    }
  }

  if (!ticket) {
    showToast('Unable to find ticket', 'error');
    return;
  }

  const idInput = document.getElementById('partsNoteTicketId');
  if (idInput) idInput.value = ticket.id;

  const titleEl = document.getElementById('partsNoteModalTitle');
  if (titleEl) titleEl.textContent = `Parts Note • ${ticket.ticket_number}`;

  const subEl = document.getElementById('partsNoteModalSub');
  if (subEl) {
    const stageName = ticket.stageName || (state.stages.find(s => s.id === ticket.current_stage_id)?.name) || '';
    subEl.textContent = `Current Stage: #${ticket.current_stage_id} ${stageName} • Record hold, delay or paint status`;
  }

  const textInput = document.getElementById('partsNoteTextInput');
  if (textInput) {
    textInput.value = ticket.parts_status_note || '';
  }

  const btnClear = document.getElementById('btnPartsNoteClear');
  if (btnClear) {
    btnClear.style.display = (ticket.parts_status_note && ticket.parts_status_note.trim()) ? 'inline-block' : 'none';
  }

  openModal('modalPartsNote');
  if (textInput) {
    setTimeout(() => {
      textInput.focus();
      textInput.setSelectionRange(textInput.value.length, textInput.value.length);
    }, 100);
  }
};

window.clearPartsNote = async function (ticketId) {
  if (!await showConfirmDialog({
    title: 'Clear Status Note',
    message: 'Clear the parts status / delay note for this ticket?',
    confirmText: 'Clear Note'
  })) return;

  try {
    const res = await fetch(`/api/tickets/${ticketId}/parts-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '' })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to clear parts note');
    }

    const updated = await res.json();
    closeModal('modalPartsNote');
    showToast('✓ Parts note cleared', 'info');

    // Update local cached state
    const idx = (state.tickets || []).findIndex(t => t.id == ticketId);
    if (idx !== -1) {
      state.tickets[idx].parts_status_note = null;
    }
    if (state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      state.currentEditingTicket.parts_status_note = null;
    }

    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      await openTicketPage(ticketId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function handlePartsNoteSubmit(e) {
  if (e) e.preventDefault();
  const ticketId = document.getElementById('partsNoteTicketId')?.value;
  const note = document.getElementById('partsNoteTextInput')?.value?.trim() || '';

  if (!ticketId) return;

  try {
    const res = await fetch(`/api/tickets/${ticketId}/parts-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save parts note');
    }

    const updated = await res.json();
    closeModal('modalPartsNote');
    showToast('✓ Parts note updated successfully', 'success');

    // Update local cached state
    const idx = (state.tickets || []).findIndex(t => t.id == ticketId);
    if (idx !== -1) {
      state.tickets[idx].parts_status_note = note || null;
    }
    if (state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      state.currentEditingTicket.parts_status_note = note || null;
    }

    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == ticketId) {
      await openTicketPage(ticketId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// PARTS APPROVAL & PROCUREMENT LIFECYCLE CONTROLLER
// ====================================================
window.openPartsApprovalModal = async function (ticketId) {
  try {
    showGlobalLoader();
    const res = await fetch(`/api/tickets/${ticketId}/parts-approval`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch parts approval details');
    }
    const data = await res.json();
    const { ticket, parts, stats } = data;

    state.currentPaTicketId = ticketId;
    state.currentPaTicket = ticket;
    state.currentPaParts = Array.isArray(parts) ? parts : [];

    const titleEl = document.getElementById('paModalTitle');
    if (titleEl) titleEl.textContent = `Parts Approval & Procurement Manager — Ticket #${ticket.ticket_number}`;

    const subEl = document.getElementById('paModalSubtitle');
    if (subEl) {
      subEl.textContent = `${ticket.vehicle_no || ticket.model || 'Honda'} • ${ticket.customer_name || 'Customer'} (${ticket.customer_phone || '—'}) • Stage #${ticket.current_stage_id}`;
    }

    const exemptCb = document.getElementById('paExemptCheckbox');
    if (exemptCb) {
      exemptCb.checked = (ticket.customer_approval_exempt === 1);
    }

    renderPaStatsRibbon(stats);
    renderPaPartsTable(state.currentPaParts);
    setupPaNewPartAutocomplete();

    openModal('modalPartsApproval');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideGlobalLoader();
  }
};

function renderPaStatsRibbon(stats) {
  if (!stats) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== undefined ? val : 0;
  };
  setVal('paStatTotal', stats.total_parts);
  setVal('paStatIa', stats.insurance_approved_count);
  setVal('paStatPca', stats.pca_count);
  setVal('paStatCa', stats.ca_count);
  setVal('paStatPod', stats.pod_count);
  setVal('paStatArrived', stats.arrived_count);
}

function updatePaLiveStats() {
  const rows = document.querySelectorAll('#paPartsTableBody tr.pa-part-row');
  const total = rows.length;
  let ia = 0, pca = 0, ca = 0, pod = 0, arrived = 0;
  const currentStage = state.currentPaTicket ? Number(state.currentPaTicket.current_stage_id) : 1;
  const isAfterApproval = currentStage > 5;

  rows.forEach(r => {
    const isIa = r.querySelector('.pa-row-ia-cb')?.checked;
    const custStatus = (r.querySelector('.pa-row-ca-sel')?.value || '').toUpperCase();
    const isArrived = r.dataset.status === 'ARRIVED';
    const isOrdered = r.dataset.status === 'ORDERED';

    if (isIa) ia++;
    if (isAfterApproval && custStatus === 'PENDING' && !isIa) pca++;
    if (isAfterApproval && custStatus === 'APPROVED') ca++;
    if (isArrived) arrived++;
    else if (isOrdered) pod++;
  });

  renderPaStatsRibbon({
    total_parts: total,
    insurance_approved_count: ia,
    pca_count: pca,
    ca_count: ca,
    pod_count: pod,
    arrived_count: arrived
  });
}

function renderPaPartsTable(parts) {
  const tbody = document.getElementById('paPartsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!parts || parts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">
          No parts registered for this ticket yet. Add parts below.
        </td>
      </tr>
    `;
    return;
  }

  const currentStage = state.currentPaTicket ? Number(state.currentPaTicket.current_stage_id) : 1;
  const isStage6OrAbove = currentStage >= 6;

  parts.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'pa-part-row';
    tr.dataset.partId = p.id;

    const rawStatus = (p.part_status || '').toUpperCase();
    const isArrived = rawStatus === 'ARRIVED';
    const isOrdered = rawStatus === 'ORDERED' && isStage6OrAbove;
    const isHold = rawStatus === 'ON_HOLD';
    tr.dataset.status = isArrived ? 'ARRIVED' : (isOrdered ? 'ORDERED' : (isHold ? 'ON_HOLD' : 'PENDING_ORDER'));

    const isIa = (p.insurance_approved === 1 || p.company_approved === 1);
    const custStatus = (p.customer_approval_status || (isIa ? 'NONE' : 'PENDING')).toUpperCase();
    const isCrit = p.is_critical_to_start === 1;
    const cost = Number(p.total_cost || (p.quantity * (p.unit_cost || 0)));

    const delivBadge = isArrived
      ? `<span class="badge-part-arrived" style="font-size: 10px; padding: 2px 6px;">ARRIVED</span>`
      : (isOrdered
        ? `<span class="badge-part-ordered" style="font-size: 10px; padding: 2px 6px;">ORDERED</span>`
        : (isHold
          ? `<span class="badge-part-on-hold" style="font-size: 10px; padding: 2px 6px;">ON HOLD</span>`
          : `<span class="badge-part-pending-order" style="font-size: 10px; padding: 2px 6px;">PENDING ORDER</span>`));

    const matchedCatalog = (state.parts && state.parts.length > 0)
      ? state.parts.find(cp =>
        (p.part_code && (cp.part_code || '').toLowerCase() === p.part_code.toLowerCase()) ||
        (p.part_name && (cp.part_name || '').toLowerCase() === p.part_name.toLowerCase())
      )
      : null;

    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
          <div>
            <div style="font-weight: 600; color: #1e293b;">${escapeHtml(p.part_name)}</div>
            ${p.part_code ? `<div style="font-size: 11px; color: #64748b; font-family: var(--font-mono);">${escapeHtml(p.part_code)}</div>` : ''}
          </div>
          ${matchedCatalog ? renderPartStockHoverPill(matchedCatalog) : ''}
        </div>
      </td>
      <td style="text-align: center; font-weight: 700; font-family: var(--font-mono);">${p.quantity || 1}</td>
      <td style="font-family: var(--font-mono); font-weight: 600; color: #334155;">₹${cost.toLocaleString('en-IN')}</td>
      <td style="text-align: center;">
        <label class="stage-part-checkbox" style="justify-content: center;">
          <input type="checkbox" class="pa-row-ia-cb" ${isIa ? 'checked' : ''}>
          <span>Insurance Approved</span>
        </label>
      </td>
      <td>
        <select class="form-input form-input-sm pa-row-ca-sel" style="font-size: 11px; padding: 3px 6px;">
          <option value="NONE" ${custStatus === 'NONE' ? 'selected' : ''}>None (Claim Covered)</option>
          <option value="PENDING" ${custStatus === 'PENDING' ? 'selected' : ''}>Pending (PCA)</option>
          <option value="APPROVED" ${custStatus === 'APPROVED' ? 'selected' : ''}>Approved (CA)</option>
          <option value="REJECTED" ${custStatus === 'REJECTED' ? 'selected' : ''}>Rejected (Do Not Order)</option>
          <option value="EXEMPT" ${custStatus === 'EXEMPT' ? 'selected' : ''}>Exempt</option>
        </select>
      </td>
      <td style="text-align: center;">
        <input type="checkbox" class="pa-row-crit-cb" ${isCrit ? 'checked' : ''} title="Critical to start repair work">
      </td>
      <td style="text-align: center;">
        ${delivBadge}
      </td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-outline-danger btn-xs btn-del-pa-row" data-id="${p.id}" data-name="${escapeHtml(p.part_name)}" title="Delete part item">
          &times;
        </button>
      </td>
    `;

    // Interactive event listeners
    const iaCb = tr.querySelector('.pa-row-ia-cb');
    const caSel = tr.querySelector('.pa-row-ca-sel');

    if (iaCb && caSel) {
      iaCb.addEventListener('change', () => {
        if (iaCb.checked) {
          caSel.value = 'NONE';
        } else {
          caSel.value = 'PENDING';
        }
        updatePaLiveStats();
      });

      caSel.addEventListener('change', () => {
        if (caSel.value === 'NONE') {
          iaCb.checked = true;
        } else {
          iaCb.checked = false;
        }
        updatePaLiveStats();
      });
    }

    const delBtn = tr.querySelector('.btn-del-pa-row');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        const pId = delBtn.dataset.id;
        const pName = delBtn.dataset.name;
        if (!await showConfirmDialog({
          title: 'Delete Part Item',
          message: `Are you sure you want to remove "${pName}" from this ticket?`,
          confirmText: 'Delete Item',
          isDanger: true
        })) return;

        try {
          const dRes = await fetch(`/api/tickets/${state.currentPaTicketId}/parts/${pId}`, { method: 'DELETE' });
          if (!dRes.ok) throw new Error('Failed to delete part');
          showToast(`Part "${pName}" deleted`, 'success');
          await openPartsApprovalModal(state.currentPaTicketId);
          refreshTickets().catch(() => { });
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    }

    tbody.appendChild(tr);
  });
}

function setupPaNewPartAutocomplete() {
  const nameInput = document.getElementById('paNewPartName');
  const codeInput = document.getElementById('paNewPartCode');
  const costInput = document.getElementById('paNewPartCost');
  const suggBox = document.getElementById('paNewPartSuggestions');
  const stockInfoEl = document.getElementById('paNewPartStockInfo');
  if (!nameInput || !suggBox) return;

  async function showSuggestions(query) {
    try {
      const clean = (query || '').trim();
      const res = await fetch(`/api/lookup/parts?q=${encodeURIComponent(clean)}`);
      if (!res.ok) return;
      const parts = await res.json();
      suggBox.innerHTML = '';

      if (parts.length > 0) {
        parts.forEach(p => {
          const item = document.createElement('div');
          item.className = 'part-sugg-item';
          const stockQty = Number(p.stock_qty || 0);
          const stockClass = stockQty > 3 ? 'in-stock' : (stockQty > 0 ? 'low-stock' : 'out-stock');
          const stockText = stockQty > 0 ? `x${stockQty} in stock` : 'Out of stock';

          let pVariants = [];
            if (p.price_variants) {
              try {
                pVariants = typeof p.price_variants === 'string' ? JSON.parse(p.price_variants) : p.price_variants;
              } catch (e) {}
            }
            pVariants = Array.isArray(pVariants) ? pVariants.filter(v => v && typeof v.price === 'number' && v.price > 0) : [];

            let priceHtml = `₹${Number(p.default_cost || 0).toLocaleString('en-IN')}`;
            if (pVariants.length > 1) {
              const prices = pVariants.map(v => v.price).sort((a, b) => a - b);
              const minP = prices[0];
              const maxP = prices[prices.length - 1];
              if (minP !== maxP) {
                priceHtml = `₹${minP.toLocaleString('en-IN')} - ₹${maxP.toLocaleString('en-IN')}`;
              }
              priceHtml += `<div style="font-size: 9.5px; color: #2563eb; font-weight: 700; margin-top: 1px;">${pVariants.length} batch prices</div>`;
            }

            item.innerHTML = `
              <div class="part-sugg-left">
                <div class="part-sugg-top">
                  <span class="part-sugg-code">${escapeHtml(p.part_code || 'NO SKU')}</span>
                  <span class="part-sugg-desc" title="${escapeHtml(p.part_name || '')}">${escapeHtml(p.part_name || '')}</span>
                </div>
                <div class="part-sugg-bottom">
                  ${p.locators ? `<span class="part-sugg-loc">📍 ${escapeHtml(p.locators)}</span>` : '<span style="font-size:10px;color:#94a3b8;">No Locator</span>'}
                </div>
              </div>
              <div class="part-sugg-right">
                <div class="part-sugg-price">${priceHtml}</div>
                <div class="part-sugg-stock ${stockClass}">${stockText}</div>
              </div>
            `;

            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              nameInput.value = p.part_name;
              if (codeInput) codeInput.value = p.part_code || '';
              if (costInput) costInput.value = p.default_cost || 0;
              nameInput.dataset.selectedCode = p.part_code || '';
              nameInput.classList.remove('is-invalid-catalog');
              suggBox.style.display = 'none';
              if (stockInfoEl) {
                stockInfoEl.innerHTML = renderPartStockHoverPill(p, costInput ? costInput.value : null);
                const pillWrap = stockInfoEl.querySelector('.part-stock-pill-wrap');
                if (pillWrap) {
                  pillWrap.style.cursor = 'pointer';
                  pillWrap.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    openPartLocatorPicker({ qtyInput, costInput, nameInput, partCode: p.part_code, recalculateTotal: () => {} });
                  });
                }
              }
              openPartLocatorPicker({ qtyInput, costInput, nameInput, partCode: p.part_code, recalculateTotal: () => {} });
            });
            suggBox.appendChild(item);
          });
        } else {
        suggBox.innerHTML = `
          <div style="padding: 10px; font-size: 11px; color: #64748b; text-align: center;">
            No parts found in catalog. Direct manual part creation is disabled.
          </div>
        `;
      }
      suggBox.style.display = 'block';
    } catch (e) {
      console.error(e);
    }
  }

  nameInput.addEventListener('focus', () => showSuggestions(nameInput.value));
  nameInput.addEventListener('click', () => showSuggestions(nameInput.value));
  let timer = null;
  nameInput.addEventListener('input', () => {
    clearTimeout(timer);
    nameInput.dataset.selectedCode = '';
    if (stockInfoEl) stockInfoEl.innerHTML = '';
    timer = setTimeout(() => showSuggestions(nameInput.value), 120);
  });
  nameInput.addEventListener('blur', () => {
    setTimeout(() => { suggBox.style.display = 'none'; }, 220);
  });

  if (qtyInput) {
    qtyInput.classList.add('part-row-qty-trigger');
    qtyInput.title = 'Click to pick warehouse locators and batch stock';
    qtyInput.addEventListener('click', () => {
      openPartLocatorPicker({
        qtyInput,
        costInput,
        nameInput,
        partCode: codeInput ? codeInput.value : (nameInput ? nameInput.dataset.selectedCode : ''),
        recalculateTotal: () => {}
      });
    });
  }
}

async function handlePaAddPart() {
  const nameInput = document.getElementById('paNewPartName');
  const codeInput = document.getElementById('paNewPartCode');
  const qtyInput = document.getElementById('paNewPartQty');
  const costInput = document.getElementById('paNewPartCost');
  const iaInput = document.getElementById('paNewPartInsuranceApproved');

  const name = (nameInput ? nameInput.value : '').trim();
  const code = (codeInput ? codeInput.value : '').trim() || (nameInput ? nameInput.dataset.selectedCode : null) || null;

  if (!name) {
    showToast('Please search and select a part from the Physical Stock Catalog', 'warning');
    if (nameInput) nameInput.focus();
    return;
  }

  const qty = Math.max(1, Number(qtyInput?.value) || 1);
  const cost = Math.max(0, Number(costInput?.value) || 0);
  const isIa = iaInput?.checked ? 1 : 0;

  try {
    const res = await fetch(`/api/tickets/${state.currentPaTicketId}/parts/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_name: name,
        part_code: code,
        quantity: qty,
        unit_cost: cost,
        insurance_approved: isIa,
        company_approved: isIa,
        customer_approval_status: isIa ? 'NONE' : 'PENDING'
      })
    });
    if (!res.ok) throw new Error('Failed to add part item');

    if (nameInput) {
      nameInput.value = '';
      nameInput.dataset.selectedCode = '';
    }
    if (codeInput) codeInput.value = '';
    if (costInput) costInput.value = 0;
    if (qtyInput) qtyInput.value = 1;
    if (iaInput) iaInput.checked = false;
    const stockInfoEl = document.getElementById('paNewPartStockInfo');
    if (stockInfoEl) stockInfoEl.innerHTML = '';

    showToast(`Added "${name}" successfully`, 'success');
    await openPartsApprovalModal(state.currentPaTicketId);
    refreshTickets().catch(() => { });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handlePaBulkCustomerApprove() {
  if (!state.currentPaTicketId) return;
  if (!await showConfirmDialog({
    title: 'Customer Approve All',
    message: 'Mark all pending customer parts (PCA) as Customer Approved (CA) for this ticket?',
    confirmText: 'Approve All'
  })) return;

  try {
    const res = await fetch(`/api/tickets/${state.currentPaTicketId}/parts-approval/bulk-customer-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to bulk approve customer parts');
    showToast('✓ All pending parts approved for customer (PCA → CA)', 'success');
    await openPartsApprovalModal(state.currentPaTicketId);
    refreshTickets().catch(() => { });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handlePaSave() {
  if (!state.currentPaTicketId) return;

  const rows = document.querySelectorAll('#paPartsTableBody tr.pa-part-row');
  const partsUpdates = [];
  rows.forEach(r => {
    const partId = Number(r.dataset.partId);
    const isIa = r.querySelector('.pa-row-ia-cb')?.checked ? 1 : 0;
    const custStatus = r.querySelector('.pa-row-ca-sel')?.value || (isIa ? 'NONE' : 'PENDING');
    const isCrit = r.querySelector('.pa-row-crit-cb')?.checked ? 1 : 0;
    partsUpdates.push({
      id: partId,
      insurance_approved: isIa,
      company_approved: isIa,
      customer_approval_status: custStatus,
      is_critical_to_start: isCrit
    });
  });

  const exempt = document.getElementById('paExemptCheckbox')?.checked ? 1 : 0;

  try {
    const res = await fetch(`/api/tickets/${state.currentPaTicketId}/parts-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: partsUpdates,
        customerApprovalExempt: exempt
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save parts approval');
    }

    closeModal('modalPartsApproval');
    showToast('✓ Parts approvals & exemptions saved', 'success');
    await refreshTickets();
    if (state.mainView === 'ticket-detail' && state.currentEditingTicket && state.currentEditingTicket.id == state.currentPaTicketId) {
      await openTicketPage(state.currentPaTicketId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// SLA INDICATOR SLIDE-IN TIMELINE DRAWER
// ====================================================
window.openDetailDrawer = async function (ticketId, defaultTab = 'timeline') {
  try {
    const res = await fetch(`/api/tickets/${ticketId}`);
    if (!res.ok) throw new Error('Failed to fetch ticket details');
    const ticket = await res.json();
    state.currentEditingTicket = ticket;

    const drawerNum = document.getElementById('drawerTicketNumber');
    if (drawerNum) drawerNum.textContent = ticket.ticket_number;

    const drawerOutlet = document.getElementById('drawerOutletName');
    if (drawerOutlet) {
      const branchName = (ticket.branch_name || ticket.outlet_name || 'Honda Branch').replace('Honda ', '');
      drawerOutlet.textContent = `${branchName} • Stage #${ticket.current_stage_id} (${ticket.stageName})`;
    }

    const badge = document.getElementById('drawerSlaBadge');
    if (badge) {
      badge.className = `badge sla-pill ${getSlaPillClass(ticket)}`;
      badge.innerHTML = `${renderSlaBadgeIcon(ticket)}${getSlaText(ticket)}`;
    }

    // Render 13-Stage Drawer Timeline
    renderDrawerTimeline(ticket);

    // Set active drawer tab (timeline vs notes)
    const tabTimeline = document.getElementById('tabDrawerTimeline');
    const tabNotes = document.getElementById('tabDrawerNotes');
    const timelinePane = document.getElementById('drawerTimeline');
    const notesPane = document.getElementById('drawerNotesPane');

    if (defaultTab === 'notes') {
      if (tabNotes) tabNotes.classList.add('active');
      if (tabTimeline) tabTimeline.classList.remove('active');
      if (timelinePane) timelinePane.style.display = 'none';
      if (notesPane) notesPane.style.display = 'block';
      setTimeout(() => {
        const inp = document.getElementById('inputDrawerComment');
        if (inp) {
          inp.focus();
          inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    } else {
      if (tabTimeline) tabTimeline.classList.add('active');
      if (tabNotes) tabNotes.classList.remove('active');
      if (timelinePane) timelinePane.style.display = 'block';
      if (notesPane) notesPane.style.display = 'none';
    }

    // Load collaborative comments & notes for drawer
    loadTicketComments(ticket.id);

    const drawer = document.getElementById('drawerDetail');
    if (drawer) drawer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function renderDrawerTimeline(ticket) {
  const container = document.getElementById('drawerTimeline');
  if (!container) return;
  container.innerHTML = '';

  state.stages.forEach(st => {
    const isCurrent = st.id === ticket.current_stage_id && ticket.status !== 'CLOSED';
    const isDone = st.id < ticket.current_stage_id || ticket.status === 'CLOSED';

    const log = (ticket.logs || []).find(l => l.stage_id === st.id);
    let isSkipped = log && log.sla_status === 'SKIPPED';

    if (!isSkipped && (st.id === 6 || st.id === 7) && ticket.parts_order_required === 0 && ticket.current_stage_id > 5) {
      isSkipped = true;
    }
    if (!isSkipped && st.id === 11 && ticket.resurvey_required === 0 && ticket.current_stage_id >= 12) {
      isSkipped = true;
    }
    if (!isSkipped && isDone && !log && st.id !== 1) {
      isSkipped = true;
    }

    let stepClass = 'step-pending';
    if (isSkipped) stepClass = 'step-skipped';
    else if (isCurrent) stepClass = 'step-active';
    else if (isDone || log) stepClass = 'step-done';

    let ageDisplay = '';
    if (isSkipped) {
      ageDisplay = '⊘ Skipped';
    } else {
      let elapsed = 0;
      if (log) {
        elapsed = log.elapsed_wd || (log.completed_at ? 0 : ticket.slaElapsedWD);
      } else if (isCurrent) {
        elapsed = ticket.slaElapsedWD;
      }
      if (st.slaLimitWD) {
        ageDisplay = `(${elapsed} / ${st.slaLimitWD} WD)`;
      } else {
        ageDisplay = `(${elapsed} WD)`;
      }
    }

    let dataSnippet = '';
    if (!isSkipped) {
      if (st.id === 2 && (ticket.estimated_cost || ticket.damaged_parts)) {
        dataSnippet = `₹${(Number(ticket.estimated_cost) || 0).toLocaleString('en-IN')}${ticket.damaged_parts ? ' • ' + escapeHtml(ticket.damaged_parts) : ''}`;
      } else if (st.id === 3 && ticket.insurance_company) {
        dataSnippet = `Insurer: ${escapeHtml(ticket.insurance_company)}`;
      } else if (st.id === 4 && ticket.surveyor_name) {
        dataSnippet = `Surveyor: ${escapeHtml(ticket.surveyor_name)}${ticket.surveyor_phone ? ' (' + escapeHtml(ticket.surveyor_phone) + ')' : ''}`;
      } else if (st.id === 6 && ticket.damaged_parts) {
        dataSnippet = `Parts: ${escapeHtml(ticket.damaged_parts)}`;
      } else if (st.id === 7 && (ticket.parts_arrival_date || (ticket.parts && ticket.parts.length > 0) || isDone || isCurrent)) {
        dataSnippet = `<span class="clickable-parts-arrival-link" onclick="event.stopPropagation(); openPartsArrivalDetailsModal(${ticket.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Parts Arrival Details (Right-click or click)</span>`;
      } else if (log && log.notes) {
        dataSnippet = escapeHtml(log.notes);
      }
    }

    const step = document.createElement('div');
    step.className = `timeline-step ${stepClass}`;
    if (st.id === 7) {
      step.style.cursor = 'pointer';
      step.title = 'Right-click or click to view Parts Arrival details with logged times';
      step.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPartsArrivalDetailsModal(ticket.id);
      });
      step.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('a')) {
          openPartsArrivalDetailsModal(ticket.id);
        }
      });
    }
    step.innerHTML = `
      <div class="timeline-step-header">
        <span class="timeline-step-name">${isSkipped ? '⊘ ' : ''}#${st.id} ${escapeHtml(st.name)}</span>
        <span class="timeline-step-badge ${isSkipped ? 'badge-skipped' : ''}">${ageDisplay}</span>
      </div>
      <div class="timeline-step-meta">
        ${isSkipped ? '<span class="text-skipped">Skipped (Bypassed in pipeline)</span>' : (log ? `Entered: ${new Date(log.entered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${log.completed_at ? '• Completed' : '• In Progress'}` : (isDone ? 'Completed' : 'Pending'))}
      </div>
      ${dataSnippet ? `<div class="timeline-step-meta" style="color: var(--text-main); font-weight: 500; margin-top: 2px;">${dataSnippet}</div>` : ''}
    `;
    container.appendChild(step);
  });
}

function renderTimeline(ticket) {
  renderDrawerTimeline(ticket);
}

async function handleEditTicketSubmit(e) {
  handleTicketPageSubmit(e);
}

async function handleDeleteTicket() {
  handleDeleteTicketFromPage();
}

// ====================================================
// DUAL-SECTION ALERTS & NOTIFICATIONS MODAL (MENTIONS + EOD)
// ====================================================

let currentNotificationFilter = 'all'; // 'all' | 'unread'
let cachedNotifications = [];
let activeTicketComments = [];
let mentionUsersCache = [];

async function refreshAlertsBadge() {
  try {
    const token = localStorage.getItem('honda_auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const [notifRes, eodRes] = await Promise.all([
      fetch('/api/notifications', { headers }).then(r => r.json()).catch(() => ({ notifications: [], unreadCount: 0 })),
      fetch('/api/alerts/summary', { headers }).then(r => r.json()).catch(() => ({ totalBreaches: 0 }))
    ]);

    const unreadMentions = Number(notifRes.unreadCount) || 0;
    const totalBreaches = Number(eodRes.totalBreaches) || 0;
    state.unreadNotificationsCount = unreadMentions;

    const countMentionsEl = document.getElementById('countTabMentions');
    const countEodEl = document.getElementById('countTabEod');
    const mentionBadgeEl = document.getElementById('mentionNotificationBadge');
    const breachBadgeEl = document.getElementById('alertNotificationBadge');

    if (countMentionsEl) countMentionsEl.textContent = unreadMentions;
    if (countEodEl) countEodEl.textContent = totalBreaches;

    // 1. Dedicated @n indicator for mentions / user notifications
    if (mentionBadgeEl) {
      if (unreadMentions > 0) {
        mentionBadgeEl.textContent = '@' + (unreadMentions > 99 ? '99+' : unreadMentions);
        mentionBadgeEl.style.display = 'inline-flex';
        mentionBadgeEl.title = `${unreadMentions} unread mention${unreadMentions > 1 ? 's' : ''}`;
      } else {
        mentionBadgeEl.style.display = 'none';
      }
    }

    // 2. Breach badge for SLA breaches
    if (breachBadgeEl) {
      if (totalBreaches > 0) {
        breachBadgeEl.textContent = totalBreaches > 99 ? '99+' : totalBreaches;
        breachBadgeEl.style.display = 'inline-flex';
        breachBadgeEl.title = `${totalBreaches} SLA breach${totalBreaches > 1 ? 'es' : ''}`;
      } else {
        breachBadgeEl.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('refreshAlertsBadge error:', err);
  }
}

// ====================================================
// SUPABASE REALTIME MULTI-DEVICE SYNCHRONIZATION
// ====================================================
let supabaseClient = null;
let realtimeChannel = null;

async function initSupabaseRealtime() {
  try {
    if (realtimeChannel) return;

    // 1. Fetch credentials
    let config = null;
    try {
      const cfgRes = await fetch('/api/config/supabase-client');
      if (cfgRes.ok) config = await cfgRes.json();
    } catch (e) {
      console.warn('Could not fetch Supabase client config:', e.message);
    }

    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
      console.warn('Supabase Realtime credentials not configured.');
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('Supabase JS library not loaded yet.');
      return;
    }

    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    realtimeChannel = supabaseClient
      .channel('honda-service-realtime-sync')
      // --- 1. TICKETS (Live Kanban updates, stages, status, deletes) ---
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
        handleRealtimeTicketEvent(payload);
      })
      // --- 2. USER NOTIFICATIONS (Mentions @n & Replies) ---
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications' }, (payload) => {
        handleRealtimeNotificationEvent(payload);
      })
      // --- 3. TICKET COMMENTS (Live notes & thread updates) ---
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments' }, (payload) => {
        handleRealtimeCommentEvent(payload);
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✓ Supabase Realtime active: Live Kanban, Stages & @n Mentions connected.');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('Supabase Realtime channel error:', err);
        }
      });
  } catch (err) {
    console.warn('initSupabaseRealtime error:', err);
  }
}

function handleRealtimeTicketEvent(payload) {
  try {
    const eventType = payload.eventType;
    console.log(`[Realtime Tickets] ${eventType}:`, payload);

    if (eventType === 'INSERT') {
      refreshTickets(true);
      const newTkt = payload.new;
      if (newTkt && newTkt.ticket_number) {
        showToast(`New Ticket #${newTkt.ticket_number} created (${newTkt.vehicle_name || newTkt.customer_name || 'Intake'})`, 'info');
      }
    } else if (eventType === 'UPDATE') {
      const updatedTkt = payload.new;
      refreshTickets(true);

      // If this ticket is open in detail drawer or edit modal, refresh details
      if (state.currentEditingTicket && state.currentEditingTicket.id === updatedTkt.id) {
        if (typeof window.openTicketDetailPage === 'function' && document.getElementById('ticketDetailPage')?.style.display !== 'none') {
          window.openTicketDetailPage(updatedTkt.id);
        }
      }

      // Friendly alert when stage or status changes
      if (updatedTkt && updatedTkt.ticket_number) {
        const stageConfig = (state.stages || []).find(s => s.id === updatedTkt.current_stage_id);
        const stageName = stageConfig ? stageConfig.name : `Stage ${updatedTkt.current_stage_id}`;
        if (updatedTkt.status === 'CLOSED') {
          showToast(`Ticket #${updatedTkt.ticket_number} closed (${stageName})`, 'success');
        } else {
          showToast(`Ticket #${updatedTkt.ticket_number} updated: ${stageName}`, 'info');
        }
      }
    } else if (eventType === 'DELETE') {
      const deletedId = payload.old?.id;
      if (deletedId) {
        state.tickets = state.tickets.filter(t => t.id !== deletedId);
        renderCurrentView();
        updateMetrics();
        showToast(`Ticket #${payload.old?.ticket_number || deletedId} was deleted`, 'info');
      } else {
        refreshTickets(true);
      }
    }
  } catch (err) {
    console.warn('handleRealtimeTicketEvent error:', err);
  }
}

function handleRealtimeNotificationEvent(payload) {
  try {
    console.log(`[Realtime Notifications] ${payload.eventType}:`, payload);
    const notif = payload.new;
    const currentUserId = state.currentUser ? state.currentUser.id : null;

    // Refresh the @n badge immediately
    refreshAlertsBadge();

    if (payload.eventType === 'INSERT' && notif) {
      // Check if this notification is for the current user
      if (!notif.user_id || notif.user_id === currentUserId) {
        const actor = notif.actor_name || 'A teammate';
        const snippet = notif.content_snippet ? `"${notif.content_snippet}"` : '';
        const tktNum = notif.ticket_number ? `#${notif.ticket_number}` : 'a ticket';
        showToast(`🔔 ${actor} mentioned you on ${tktNum} ${snippet}`, 'info');

        // If alerts modal is open, reload notifications tab
        const modal = document.getElementById('modalEodReport');
        if (modal && modal.style.display !== 'none') {
          loadNotificationsList();
        }
      }
    }
  } catch (err) {
    console.warn('handleRealtimeNotificationEvent error:', err);
  }
}

function handleRealtimeCommentEvent(payload) {
  try {
    const comment = payload.new || payload.old;
    if (comment && comment.ticket_id) {
      // If the comments stream for this ticket is visible, refresh it live
      const tpStream = document.getElementById('tpCommentsStream');
      const drawerStream = document.getElementById('drawerCommentsStream');
      if (tpStream || drawerStream) {
        loadTicketComments(comment.ticket_id);
      }
    }
  } catch (err) {
    console.warn('handleRealtimeCommentEvent error:', err);
  }
}

async function openEodReportModal(defaultTab = 'mentions') {
  try {
    const modal = document.getElementById('modalEodReport');
    if (!modal) return;

    // Switch tab UI
    switchAlertTab(defaultTab);

    // Refresh data for both tabs
    await Promise.all([
      loadNotificationsList(),
      loadEodSummaryData()
    ]);

    modal.style.display = 'flex';
  } catch (err) {
    showToast('Failed to load alert center: ' + err.message, 'error');
  }
}

function switchAlertTab(tabName) {
  const tabMentions = document.getElementById('tabAlertsMentions');
  const tabEod = document.getElementById('tabAlertsEod');
  const paneMentions = document.getElementById('paneAlertsMentions');
  const paneEod = document.getElementById('paneAlertsEod');

  if (tabName === 'mentions') {
    if (tabMentions) tabMentions.classList.add('active');
    if (tabEod) tabEod.classList.remove('active');
    if (paneMentions) paneMentions.style.display = 'block';
    if (paneEod) paneEod.style.display = 'none';
  } else {
    if (tabEod) tabEod.classList.add('active');
    if (tabMentions) tabMentions.classList.remove('active');
    if (paneEod) paneEod.style.display = 'block';
    if (paneMentions) paneMentions.style.display = 'none';
  }
}

async function loadNotificationsList() {
  const container = document.getElementById('alertsMentionsList');
  if (!container) return;

  try {
    const token = localStorage.getItem('honda_auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/notifications', { headers });
    const data = await res.json();
    cachedNotifications = data.notifications || [];

    const countMentionsEl = document.getElementById('countTabMentions');
    if (countMentionsEl) countMentionsEl.textContent = data.unreadCount || 0;

    renderNotificationsList();
    refreshAlertsBadge();
  } catch (err) {
    container.innerHTML = `<div style="padding: 12px; color: #94a3b8;">Failed to load mentions: ${escapeHtml(err.message)}</div>`;
  }
}

function renderNotificationsList() {
  const container = document.getElementById('alertsMentionsList');
  if (!container) return;

  let items = cachedNotifications;
  if (currentNotificationFilter === 'unread') {
    items = items.filter(n => !n.is_read);
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="mention-empty-state" style="text-align: center; padding: 32px 16px; color: #94a3b8;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.8" style="display:block;margin:0 auto 8px;">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path>
        </svg>
        <div style="font-weight: 600; color: #475569;">No ${currentNotificationFilter === 'unread' ? 'unread ' : ''}mentions or replies</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">When teammates mention @you or reply to your notes, they'll appear here.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(n => {
    const isUnread = !n.is_read;
    const initial = (n.actor_name || 'U').charAt(0).toUpperCase();
    const typeLabel = n.type === 'MENTION' ? 'Mention' : 'Reply';
    const typeClass = n.type === 'MENTION' ? 'badge-mention' : 'badge-reply';
    const timeAgo = formatTimeAgo(n.created_at);

    return `
      <div class="mention-item-card ${isUnread ? 'unread' : ''}" data-notif-id="${n.id}" data-ticket-id="${n.ticket_id || ''}">
        <div class="mention-author-avatar">${initial}</div>
        <div class="mention-item-main">
          <div class="mention-header-line">
            <span class="mention-actor-name">${escapeHtml(n.actor_name || 'Teammate')}</span>
            <span class="mention-badge-type ${typeClass}">${typeLabel}</span>
            <span class="mention-ticket-link">${escapeHtml(n.ticket_number || ('Ticket #' + n.ticket_id))}</span>
            <span class="mention-time-ago">${timeAgo}</span>
          </div>
          <div class="mention-snippet-text">${escapeHtml(n.content_snippet || '')}</div>
        </div>
        <div class="mention-item-actions">
          ${isUnread ? `<button type="button" class="btn-xs btn-outline btn-mark-read" data-notif-id="${n.id}" title="Mark as read">✓</button>` : ''}
          <button type="button" class="btn-xs btn-primary btn-goto-ticket" data-ticket-id="${n.ticket_id || ''}">View Ticket</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach click listeners to cards
  container.querySelectorAll('.mention-item-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      const notifId = card.dataset.notifId;
      const ticketId = card.dataset.ticketId;

      if (e.target.closest('.btn-mark-read')) {
        e.stopPropagation();
        await markNotificationRead(notifId);
        return;
      }

      if (card.classList.contains('unread')) {
        await markNotificationRead(notifId);
      }

      closeModal('modalEodReport');
      if (ticketId && typeof window.openTicketDetailPage === 'function') {
        window.openTicketDetailPage(ticketId);
      } else if (ticketId && typeof window.openTicketPage === 'function') {
        window.openTicketPage(ticketId);
      }
    });
  });
}

async function markNotificationRead(notifId) {
  try {
    const token = localStorage.getItem('honda_auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    await fetch(`/api/notifications/${notifId}/read`, { method: 'PATCH', headers });
    const item = cachedNotifications.find(n => String(n.id) === String(notifId));
    if (item) item.is_read = true;
    renderNotificationsList();
    refreshAlertsBadge();
  } catch (err) {
    console.warn('Failed to mark read:', err);
  }
}

async function markAllNotificationsRead() {
  try {
    const token = localStorage.getItem('honda_auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    await fetch('/api/notifications/read-all', { method: 'POST', headers });
    cachedNotifications.forEach(n => { n.is_read = true; });
    renderNotificationsList();
    refreshAlertsBadge();
    showToast('All notifications marked as read.', 'success');
  } catch (err) {
    showToast('Failed to mark all as read: ' + err.message, 'error');
  }
}

async function loadEodSummaryData(scope = null) {
  if (scope) {
    state.eodScope = scope;
  }
  const currentScope = state.eodScope || 'today';

  // Update pills active state
  const btnToday = document.getElementById('btnEodScopeToday');
  const btnAll = document.getElementById('btnEodScopeAllTime');
  const subtitleEl = document.getElementById('eodScopeSubtitle');

  if (currentScope === 'today') {
    if (btnToday) btnToday.classList.add('active');
    if (btnAll) btnAll.classList.remove('active');
    if (subtitleEl) subtitleEl.textContent = "Today's summary of stage entries, breaches & pending SLAs";
  } else {
    if (btnAll) btnAll.classList.add('active');
    if (btnToday) btnToday.classList.remove('active');
    if (subtitleEl) subtitleEl.textContent = "Cumulative summary of all overdue tickets across all stages & outlets";
  }

  const token = localStorage.getItem('honda_auth_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch('/api/alerts/summary', { headers });
  const data = await res.json();

  const isToday = (currentScope === 'today');
  const scopedData = isToday ? (data.today || data) : (data.allTime || data);

  // Update tab badge with total today's breaches (or all breaches if zero today)
  const countEodEl = document.getElementById('countTabEod');
  if (countEodEl) {
    countEodEl.textContent = (data.today ? data.today.totalBreaches : data.totalBreaches) || 0;
  }

  // Update Card Titles
  const titleBreached = document.getElementById('eodCardTitleBreached');
  const titleDueSoon = document.getElementById('eodCardTitleDueSoon');
  const titleActive = document.getElementById('eodCardTitleActive');
  const listHeader = document.getElementById('eodBreachListHeader');

  if (titleBreached) titleBreached.textContent = isToday ? 'Breached (Today)' : 'Total Breached (All Time)';
  if (titleDueSoon) titleDueSoon.textContent = isToday ? 'Due Soon (Today)' : 'Total Due Soon (≤ 1 WD)';
  if (titleActive) titleActive.textContent = isToday ? 'Active (Today)' : 'Total Active Tickets';
  if (listHeader) listHeader.textContent = isToday ? "Today's Breached Tickets" : "All Overdue Tickets Across Stages";

  // Update Card Counts
  const totalBreached = (scopedData.totalBreaches !== undefined) ? scopedData.totalBreaches : (data.totalBreaches || 0);
  const totalDueSoon = (scopedData.totalDueSoon !== undefined) ? scopedData.totalDueSoon : (data.totalDueSoon || 0);
  const totalActive = (scopedData.totalActive !== undefined) ? scopedData.totalActive : (data.totalActiveTickets || 0);

  const totalBreachedEl = document.getElementById('eodTotalBreached');
  const totalDueSoonEl = document.getElementById('eodTotalDueSoon');
  const totalActiveEl = document.getElementById('eodTotalActive');

  if (totalBreachedEl) totalBreachedEl.textContent = totalBreached;
  if (totalDueSoonEl) totalDueSoonEl.textContent = totalDueSoon;
  if (totalActiveEl) totalActiveEl.textContent = totalActive;

  const listContainer = document.getElementById('eodBreachList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const breachedList = scopedData.breachedTickets || [];

  if (breachedList.length === 0) {
    listContainer.innerHTML = `
      <div class="alert-box" style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;">
        ${isToday ? 'All clear! Zero tickets breached today.' : 'All clear! There are currently zero SLA breached tickets across all branches.'}
      </div>
    `;
  } else {
    breachedList.forEach(b => {
      const div = document.createElement('div');
      div.className = 'breach-row';
      div.innerHTML = `
        <div class="breach-row-left">
          <strong>${escapeHtml(b.ticketNumber)} • ${escapeHtml(b.outletName)}</strong>
          <span>${escapeHtml(b.customerName)} (${escapeHtml(b.customerPhone || '')}) • ${escapeHtml(b.vehicleName)} [${escapeHtml(b.chassisNumber || '')}]</span>
          <span style="color:var(--text-subtle);font-size:11px;">Current: ${escapeHtml(b.currentStageName)} (Allowed: ${b.maxSlaWD} WD, Elapsed: ${b.elapsedWD} WD)</span>
        </div>
        <div style="text-align:right;">
          <span class="breach-tag">OVERDUE BY ${b.daysOverdue} WD</span>
          <div><button class="btn-xs" style="margin-top:4px;" onclick="closeModal('modalEodReport'); openDetailDrawer(${b.id})">Open Ticket</button></div>
        </div>
      `;
      listContainer.appendChild(div);
    });
  }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ====================================================
// TICKET COLLABORATIVE NOTES & THREADED COMMENTS
// ====================================================

async function loadMentionUsers() {
  try {
    const token = localStorage.getItem('honda_auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/users/mention-list', { headers });
    mentionUsersCache = await res.json();
  } catch (err) {
    console.warn('loadMentionUsers error:', err);
  }
}

function renderCommentContentHtml(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  // Highlight @username as sleek mention pills
  return escaped.replace(/@([a-zA-Z0-9_\-]+)/g, (match, username) => {
    return `<span class="mention-pill">@${username}</span>`;
  });
}

async function loadTicketComments(ticketId) {
  if (!ticketId) return;
  try {
    const token = localStorage.getItem('honda_auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(`/api/tickets/${ticketId}/comments`, { headers });
    const comments = await res.json();
    activeTicketComments = Array.isArray(comments) ? comments : [];

    // Update count badges
    const tpBadge = document.getElementById('tpCommentsCountBadge');
    const drawerBadge = document.getElementById('drawerNotesCount');
    if (tpBadge) tpBadge.textContent = activeTicketComments.length;
    if (drawerBadge) drawerBadge.textContent = activeTicketComments.length;

    // Update author name in composer
    const composerAuthorEl = document.getElementById('commentComposerAuthor');
    if (composerAuthorEl) {
      const u = state.currentUser;
      composerAuthorEl.textContent = u ? (u.display_name || u.username) : 'Service Staff';
    }

    renderCommentsStream('tpCommentsStream', ticketId);
    renderCommentsStream('drawerCommentsStream', ticketId);
  } catch (err) {
    console.warn('loadTicketComments error:', err);
  }
}

function renderCommentsStream(containerId, ticketId) {
  const streamEl = document.getElementById(containerId);
  if (!streamEl) return;

  if (activeTicketComments.length === 0) {
    streamEl.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: #94a3b8; font-size: 12.5px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.8" style="display:block; margin: 0 auto 8px;">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>No notes yet on this ticket. Add the first progress update above!</span>
      </div>
    `;
    return;
  }

  // Group comments: root vs replies
  const rootComments = activeTicketComments.filter(c => !c.parent_id);
  const repliesByParent = {};
  activeTicketComments.forEach(c => {
    if (c.parent_id) {
      if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
      repliesByParent[c.parent_id].push(c);
    }
  });

  const currentUser = state.currentUser;
  const currentUserId = currentUser ? currentUser.id : null;
  const isAdmin = currentUser && currentUser.role === 'admin';

  streamEl.innerHTML = rootComments.map(c => {
    const replies = repliesByParent[c.id] || [];
    const initial = (c.user_name || 'U').charAt(0).toUpperCase();
    const canDelete = isAdmin || (currentUserId && c.user_id === currentUserId);
    const timeAgo = formatTimeAgo(c.created_at);

    return `
      <div class="comment-card" data-comment-id="${c.id}">
        <div class="comment-header-row">
          <div class="comment-author-info">
            <span class="comment-avatar">${initial}</span>
            <span class="comment-author-name">${escapeHtml(c.user_name)}</span>
            <span class="comment-role-tag">${escapeHtml(c.user_role || 'Staff')}</span>
            <span class="comment-timestamp">${timeAgo}</span>
          </div>
          <div class="comment-actions-bar">
            <button type="button" class="comment-action-btn btn-reply-toggle" data-comment-id="${c.id}" title="Reply to this note">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px;">
                <polyline points="9 17 4 12 9 7"></polyline>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
              </svg>
              Reply
            </button>
            ${canDelete ? `
              <button type="button" class="comment-action-btn delete-btn btn-comment-delete" data-comment-id="${c.id}" title="Delete this note">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="comment-text-content">
          ${renderCommentContentHtml(c.content)}
        </div>

        <!-- Replies Thread -->
        ${replies.length > 0 ? `
          <div class="comment-reply-thread">
            ${replies.map(r => {
      const rInitial = (r.user_name || 'U').charAt(0).toUpperCase();
      const rCanDelete = isAdmin || (currentUserId && r.user_id === currentUserId);
      const rTimeAgo = formatTimeAgo(r.created_at);
      return `
                <div class="comment-card" style="padding: 8px 10px; background-color: #f8fafc; border-color: #e2e8f0;" data-comment-id="${r.id}">
                  <div class="comment-header-row">
                    <div class="comment-author-info">
                      <span class="comment-avatar" style="width:22px;height:22px;font-size:9.5px;background:#64748b;">${rInitial}</span>
                      <span class="comment-author-name" style="font-size:11.5px;">${escapeHtml(r.user_name)}</span>
                      <span class="comment-role-tag" style="font-size:9.5px;">${escapeHtml(r.user_role || 'Staff')}</span>
                      <span class="comment-timestamp">${rTimeAgo}</span>
                    </div>
                    ${rCanDelete ? `
                      <div class="comment-actions-bar">
                        <button type="button" class="comment-action-btn delete-btn btn-comment-delete" data-comment-id="${r.id}" title="Delete reply">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    ` : ''}
                  </div>
                  <div class="comment-text-content" style="margin-bottom: 0;">
                    ${renderCommentContentHtml(r.content)}
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        ` : ''}

        <!-- Inline Reply Composer Form -->
        <div class="comment-reply-box" id="replyComposer_${c.id}" style="display: none;">
          <textarea class="form-textarea input-reply-text" rows="2" style="width:100%;font-size:12px;margin-bottom:6px;" placeholder="Write a reply..."></textarea>
          <div style="display:flex; justify-content:flex-end; gap:6px;">
            <button type="button" class="btn-xs btn-outline btn-cancel-reply" data-comment-id="${c.id}">Cancel</button>
            <button type="button" class="btn-xs btn-primary btn-submit-reply" data-comment-id="${c.id}">Post Reply</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire up reply toggle buttons
  streamEl.querySelectorAll('.btn-reply-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const commentId = btn.dataset.commentId;
      const wrap = streamEl.querySelector(`#replyComposer_${commentId}`);
      if (wrap) {
        const isShown = wrap.style.display !== 'none';
        wrap.style.display = isShown ? 'none' : 'block';
        if (!isShown) {
          const textarea = wrap.querySelector('textarea');
          if (textarea) textarea.focus();
        }
      }
    });
  });

  // Wire up reply cancel buttons
  streamEl.querySelectorAll('.btn-cancel-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      const commentId = btn.dataset.commentId;
      const wrap = streamEl.querySelector(`#replyComposer_${commentId}`);
      if (wrap) wrap.style.display = 'none';
    });
  });

  // Wire up submit reply buttons
  streamEl.querySelectorAll('.btn-submit-reply').forEach(btn => {
    btn.addEventListener('click', async () => {
      const parentId = btn.dataset.commentId;
      const wrap = streamEl.querySelector(`#replyComposer_${parentId}`);
      const textarea = wrap ? wrap.querySelector('textarea') : null;
      const content = textarea ? textarea.value.trim() : '';
      if (!content) {
        showToast('Please type a reply before submitting.', 'info');
        return;
      }
      btn.disabled = true;
      try {
        await submitComment(ticketId, content, parentId);
        if (textarea) textarea.value = '';
        if (wrap) wrap.style.display = 'none';
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Wire up delete buttons with custom showConfirmDialog
  streamEl.querySelectorAll('.btn-comment-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const commentId = btn.dataset.commentId;
      const ok = await showConfirmDialog({
        title: 'Delete Note',
        message: 'Are you sure you want to delete this note? If it has replies, they will also be removed.',
        confirmText: 'Delete Note',
        isDanger: true
      });
      if (!ok) return;

      try {
        const token = localStorage.getItem('honda_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`/api/tickets/${ticketId}/comments/${commentId}`, { method: 'DELETE', headers });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to delete comment');
        }
        showToast('Note deleted.', 'info');
        await loadTicketComments(ticketId);
        refreshAlertsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function submitComment(ticketId, content, parentId = null) {
  if (!ticketId || !content || !content.trim()) return;
  const token = localStorage.getItem('honda_auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: content.trim(), parentId: parentId ? Number(parentId) : null })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to post comment');
  }

  showToast(parentId ? 'Reply posted.' : 'Note added.', 'success');
  await loadTicketComments(ticketId);
  refreshAlertsBadge();
}

function setupMentionAutocomplete(textareaId, dropdownId) {
  const textarea = document.getElementById(textareaId);
  const dropdown = document.getElementById(dropdownId);
  if (!textarea || !dropdown) return;

  textarea.addEventListener('input', () => {
    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_\-]*)$/);

    if (!match) {
      dropdown.style.display = 'none';
      return;
    }

    const query = match[1].toLowerCase();
    const filtered = mentionUsersCache.filter(u =>
      u.username.toLowerCase().includes(query) ||
      (u.display_name && u.display_name.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = filtered.map(u => `
      <div class="mention-dropdown-item" data-username="${escapeHtml(u.username)}">
        <span class="comment-avatar" style="width:20px;height:20px;font-size:9px;">${u.username.charAt(0).toUpperCase()}</span>
        <div style="display:flex; flex-direction:column; line-height:1.2;">
          <span style="font-weight:600; color:#1e293b;">${escapeHtml(u.display_name || u.username)}</span>
          <span style="font-size:10.5px; color:#64748b;">@${escapeHtml(u.username)} • ${escapeHtml(u.role || 'Staff')}</span>
        </div>
      </div>
    `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.mention-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const selectedUname = item.dataset.username;
        const prefix = textBeforeCursor.slice(0, match.index);
        const suffix = val.slice(cursorPos);
        textarea.value = `${prefix}@${selectedUname} ${suffix}`;
        dropdown.style.display = 'none';
        textarea.focus();
        const newCursorPos = (prefix + '@' + selectedUname + ' ').length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
    });
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 200);
  });
}

async function triggerEodReportAction() {
  try {
    const scope = state.eodScope || 'today';
    const res = await fetch('/api/alerts/send-eod-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope })
    });
    const result = await res.json();

    document.getElementById('payloadJson').textContent = JSON.stringify(result.payloadPreview, null, 2);
    document.getElementById('eodPayloadPreview').style.display = 'block';

    showToast(`EOD Report Preview Prepared (${scope.toUpperCase()})! (Placeholder - see todo.txt for email push roadmap)`, 'info');
  } catch (err) {
    showToast('Failed to generate report: ' + err.message, 'error');
  }
}

// ====================================================
// UTILITIES: TOASTS & HTML ESCAPING
// ====================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconHtml = '';
  if (type === 'success') {
    iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  const cleanMsg = String(message).replace(/^[✓✕!•\s]+/, '').trim();
  toast.innerHTML = `${iconHtml}<span>${escapeHtml(cleanMsg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPlateBadge(vehicleNo, extraStyle = '') {
  if (!vehicleNo) return '<span style="font-size: 10.5px; color: #94a3b8; font-style: italic;">No Plate</span>';
  return `<span class="ind-plate-badge"${extraStyle ? ` style="${extraStyle}"` : ''} title="Registration Plate">${escapeHtml(vehicleNo)}</span>`;
}

function formatDate(dateVal) {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return String(dateVal);
  }
}

function formatDateTime(dateVal) {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  } catch (e) {
    return String(dateVal);
  }
}

function openTicketDetailPage(ticketId) {
  const tid = parseInt(ticketId);
  if (!tid) return;
  if (typeof window.openTicketPage === 'function') {
    window.openTicketPage(tid);
  } else if (typeof openTicketPage === 'function') {
    openTicketPage(tid);
  } else if (typeof window.openDetailDrawer === 'function') {
    window.openDetailDrawer(tid);
  }
}

function renderPaginationControls(opts) {
  const {
    infoElId,
    numbersElId,
    prevBtnId,
    nextBtnId,
    sizeSelectId,
    totalItems = 0,
    currentPage = 1,
    pageSize = 10,
    itemLabel = 'items',
    onPageChange,
    onSizeChange
  } = opts;

  const isAll = pageSize === 'ALL' || String(pageSize).toUpperCase() === 'ALL';
  const effectivePageSize = isAll ? Math.max(1, totalItems) : Math.max(1, parseInt(pageSize, 10) || 10);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const validPage = isAll ? 1 : Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
  const startIndex = totalItems === 0 ? 0 : (isAll ? 0 : (validPage - 1) * effectivePageSize);
  const endIndex = isAll ? totalItems : Math.min(startIndex + effectivePageSize, totalItems);

  const infoEl = infoElId ? document.getElementById(infoElId) : null;
  if (infoEl) {
    if (totalItems === 0) {
      infoEl.textContent = `Showing 0 ${itemLabel}`;
    } else if (isAll) {
      infoEl.textContent = `Showing 1–${totalItems} of ${totalItems} ${itemLabel}`;
    } else {
      infoEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalItems} ${itemLabel} (Page ${validPage} of ${totalPages})`;
    }
  }

  const prevBtn = prevBtnId ? document.getElementById(prevBtnId) : null;
  const nextBtn = nextBtnId ? document.getElementById(nextBtnId) : null;
  if (prevBtn) {
    prevBtn.disabled = validPage <= 1 || isAll;
    prevBtn.onclick = () => { if (validPage > 1 && onPageChange) onPageChange(validPage - 1); };
  }
  if (nextBtn) {
    nextBtn.disabled = validPage >= totalPages || totalItems === 0 || isAll;
    nextBtn.onclick = () => { if (validPage < totalPages && onPageChange) onPageChange(validPage + 1); };
  }

  const sizeSelect = sizeSelectId ? document.getElementById(sizeSelectId) : null;
  if (sizeSelect && onSizeChange) {
    sizeSelect.value = String(pageSize);
    sizeSelect.onchange = (e) => {
      const val = e.target.value;
      onSizeChange(val === 'ALL' ? 'ALL' : (parseInt(val, 10) || 10));
    };
  }

  const numbersEl = numbersElId ? document.getElementById(numbersElId) : null;
  if (numbersEl) {
    numbersEl.innerHTML = '';
    if (totalPages > 1 && !isAll) {
      const pagesToShow = new Set();
      pagesToShow.add(1);
      pagesToShow.add(totalPages);
      for (let i = Math.max(1, validPage - 2); i <= Math.min(totalPages, validPage + 2); i++) {
        pagesToShow.add(i);
      }
      const sorted = Array.from(pagesToShow).sort((a, b) => a - b);
      let prev = 0;
      sorted.forEach(p => {
        if (prev > 0 && p - prev > 1) {
          const ell = document.createElement('span');
          ell.className = 'tp-ellipsis';
          ell.textContent = '…';
          numbersEl.appendChild(ell);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn-page-num ${p === validPage ? 'active' : ''}`;
        btn.textContent = p;
        btn.addEventListener('click', () => { if (onPageChange) onPageChange(p); });
        numbersEl.appendChild(btn);
        prev = p;
      });
    }
  }

  return {
    totalPages,
    startIndex,
    endIndex,
    pagedItems: (list) => {
      if (!Array.isArray(list)) return [];
      return list.slice(startIndex, endIndex);
    }
  };
}

// Global window exposure
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.openTicketDetailPage = openTicketDetailPage;
window.renderPaginationControls = renderPaginationControls;


// ====================================================
// COLLAPSIBLE SIDEBAR & SUBVIEW ROUTING
// ====================================================

function initSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (isCollapsed && sidebar) {
    sidebar.classList.add('collapsed');
  }

  // Sidebar toggle button in header
  const toggleBtn = document.getElementById('btnToggleSidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
  }

  // Sidebar toggle chevron inside sidebar header
  const collapseBtn = document.getElementById('btnCollapseSidebar');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', toggleSidebar);
  }

  // Settings group accordion trigger
  const settingsTrigger = document.getElementById('btnSettingsTrigger');
  const settingsGroup = document.getElementById('groupSettings');
  if (settingsTrigger && settingsGroup) {
    settingsTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsGroup.classList.toggle('open');
    });
  }

  // Navigation items
  const navItems = [
    { id: 'navBoard', view: 'board' },
    { id: 'navCustomers', view: 'customers' },
    { id: 'navVehicles', view: 'vehicles' },
    { id: 'navParts', view: 'parts' },
    { id: 'navInsurance', view: 'insurance' },
    { id: 'navSlaSettings', view: 'sla-settings' },
    { id: 'navHolidays', view: 'holidays' }
  ];

  navItems.forEach(({ id, view }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        switchMainView(view);
      });
    }
  });

  // Customer quick intake button
  const btnCustIntake = document.getElementById('btnQuickNewTicketFromCust');
  if (btnCustIntake) {
    btnCustIntake.addEventListener('click', () => {
      openNewTicketModal();
    });
  }

  // Register New Customer Modal trigger
  const btnOpenNewCust = document.getElementById('btnOpenNewCustomerModal');
  if (btnOpenNewCust) {
    btnOpenNewCust.addEventListener('click', () => {
      const modal = document.getElementById('modalNewCustomer');
      if (modal) {
        document.querySelectorAll('#regCustBranchesContainer .branch-pill-checkbox').forEach(p => {
          const cb = p.querySelector('input');
          if (cb) cb.checked = false;
          p.classList.remove('active');
        });
        modal.style.display = 'flex';
      }
    });
  }

  // Insurance Command Center Header Dynamic Action (+ Add Insurance / + Add Surveyor)
  const btnInsuranceAction = document.getElementById('btnInsuranceHeaderAction');
  if (btnInsuranceAction) {
    btnInsuranceAction.addEventListener('click', () => {
      const isSurveyorsTab = subSurveyors && subSurveyors.classList.contains('active');
      if (isSurveyorsTab) {
        populateSurvModalInsurers(state.selectedInsurerId);
        const modal = document.getElementById('modalAddSurveyor');
        if (modal) modal.style.display = 'flex';
      } else {
        const modal = document.getElementById('modalAddInsurer');
        if (modal) {
          const form = document.getElementById('formAddInsurerModal');
          if (form) form.reset();
          modal.style.display = 'flex';
        }
      }
    });
  }

  // Live filter on customer search input
  const custSearch = document.getElementById('customerSearchInput');
  if (custSearch) {
    custSearch.addEventListener('input', () => {
      filterCustomersList();
    });
  }

  // Customer filter chips
  document.querySelectorAll('#custFilterChips .hub-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#custFilterChips .hub-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.customerFilter = btn.dataset.filter || 'all';
      filterCustomersList();
    });
  });

  // Customer tagged branch filter select
  const branchSelect = document.getElementById('custBranchFilter');
  if (branchSelect) {
    branchSelect.addEventListener('change', (e) => {
      state.customerBranchFilter = e.target.value;
      filterCustomersList();
    });
  }

  // Insurance Sub-Tab Switcher
  const subInsurers = document.getElementById('subtabInsurers');
  const subSurveyors = document.getElementById('subtabSurveyors');
  const paneInsurers = document.getElementById('paneInsurersTab');
  const paneSurveyors = document.getElementById('paneSurveyorsTab');

  if (subInsurers && subSurveyors) {
    subInsurers.addEventListener('click', () => {
      subInsurers.classList.add('active');
      subSurveyors.classList.remove('active');
      if (paneInsurers) paneInsurers.style.display = 'flex';
      if (paneSurveyors) paneSurveyors.style.display = 'none';

      // Update header action button to Add Insurance
      const headerText = document.getElementById('headerActionText');
      const headerIcon = document.getElementById('headerActionIcon');
      if (headerText) headerText.textContent = '+ Add Insurance';
      if (headerIcon) {
        headerIcon.innerHTML = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>';
      }
    });

    subSurveyors.addEventListener('click', () => {
      subSurveyors.classList.add('active');
      subInsurers.classList.remove('active');
      if (paneInsurers) paneInsurers.style.display = 'none';
      if (paneSurveyors) paneSurveyors.style.display = 'flex';

      // Update header action button to Add Surveyor
      const headerText = document.getElementById('headerActionText');
      const headerIcon = document.getElementById('headerActionIcon');
      if (headerText) headerText.textContent = '+ Add Surveyor';
      if (headerIcon) {
        headerIcon.innerHTML = '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line>';
      }
      loadAndRenderSurveyors();
    });
  }

  // Surveyor Master List live search input
  const survSearch = document.getElementById('surveyorSearchInput');
  if (survSearch) {
    survSearch.addEventListener('input', (e) => {
      state.surveyorSearchQuery = e.target.value || '';
      filterSurveyorsMasterList();
    });
  }

  // Surveyor filter chips
  document.querySelectorAll('#survFilterChips .hub-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#survFilterChips .hub-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.surveyorFilter = btn.dataset.filter || 'all';
      filterSurveyorsMasterList();
    });
  });

  // Live filter on insurance search input
  const insSearch = document.getElementById('insuranceSearchInput');
  if (insSearch) {
    insSearch.addEventListener('input', (e) => {
      filterInsurersList(e.target.value);
    });
  }

  // Register New Customer Form Submit
  const formNewCust = document.getElementById('formNewCustomerModal');
  if (formNewCust) {
    formNewCust.addEventListener('submit', handleSaveNewCustomer);
  }

  // Edit Customer Form Submit
  const formEditCust = document.getElementById('formEditCustomerModal');
  if (formEditCust) {
    formEditCust.addEventListener('submit', handleSaveEditCustomer);
  }

  // Add Customer Vehicle Form Submit
  const formAddCustVeh = document.getElementById('formAddCustomerVehicle');
  if (formAddCustVeh) {
    formAddCustVeh.addEventListener('submit', handleSaveCustomerVehicle);
  }

  // Customer Notes Modal Form & Clear Action
  const formCustNotes = document.getElementById('formCustomerNotesModal');
  if (formCustNotes) {
    formCustNotes.addEventListener('submit', handleSaveCustomerNotes);
  }
  const btnCustNotesClear = document.getElementById('btnCustomerNotesClear');
  if (btnCustNotesClear) {
    btnCustNotesClear.addEventListener('click', handleClearCustomerNotes);
  }

  // Add Insurance Company Form Submit
  const formAddIns = document.getElementById('formAddInsurerModal');
  if (formAddIns) {
    formAddIns.addEventListener('submit', handleSaveNewInsurer);
  }

  // Edit Insurance Company Form Submit
  const formEditIns = document.getElementById('formEditInsurerModal');
  if (formEditIns) {
    formEditIns.addEventListener('submit', handleSaveEditInsurer);
  }

  // Add Surveyor Form Submit
  const formAddSurv = document.getElementById('formAddSurveyorModal');
  if (formAddSurv) {
    formAddSurv.addEventListener('submit', handleSaveNewSurveyor);
  }

  // Edit Surveyor Form Submit
  const formEditSurv = document.getElementById('formEditSurveyorModal');
  if (formEditSurv) {
    formEditSurv.addEventListener('submit', handleSaveEditSurveyor);
  }

  // ====================================================
  // VEHICLES DIRECTORY LISTENERS
  // ====================================================
  const vehSearch = document.getElementById('vehicleSearchInput');
  if (vehSearch) {
    vehSearch.addEventListener('input', () => {
      filterVehiclesList();
    });
  }

  document.querySelectorAll('#vehFilterChips .hub-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vehFilterChips .hub-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.vehicleFilter = btn.dataset.filter || 'all';
      filterVehiclesList();
    });
  });

  const btnOpenRegVeh = document.getElementById('btnOpenRegisterVehicleModal');
  if (btnOpenRegVeh) {
    btnOpenRegVeh.addEventListener('click', () => {
      const modal = document.getElementById('modalRegisterVehicleMaster');
      if (!modal) return;
      const form = document.getElementById('formRegisterVehicleMaster');
      if (form) form.reset();

      const selCust = document.getElementById('regVehCustomerSelect');
      if (selCust) {
        selCust.innerHTML = '<option value="">-- Select Registered Customer --</option>';
        (state.customers || []).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.name} (${c.primary_phone})`;
          selCust.appendChild(opt);
        });
      }
      modal.style.display = 'flex';
    });
  }

  const formRegVeh = document.getElementById('formRegisterVehicleMaster');
  if (formRegVeh) {
    formRegVeh.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customerId = document.getElementById('regVehCustomerSelect').value;
      const model = document.getElementById('regVehModel').value;
      const color = document.getElementById('regVehColor').value;
      const plate = document.getElementById('regVehPlate').value;
      const vin = document.getElementById('regVehVin').value;

      try {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId ? parseInt(customerId) : null,
            model,
            color,
            vehicle_no: plate,
            chassis_no: vin
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to register vehicle');
        }

        const created = await res.json();
        showToast(`Vehicle ${created.model || ''} registered successfully`, 'success');
        document.getElementById('modalRegisterVehicleMaster').style.display = 'none';

        await loadAndRenderVehicles();
        selectVehicle(created.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const formEditVeh = document.getElementById('formEditVehicleMaster');
  if (formEditVeh) {
    formEditVeh.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vehicleId = document.getElementById('editVehId').value;
      const customerId = document.getElementById('editVehCustomerSelect').value;
      const model = document.getElementById('editVehModel').value;
      const color = document.getElementById('editVehColor').value;
      const plate = document.getElementById('editVehPlate').value;
      const vin = document.getElementById('editVehVin').value;

      try {
        const res = await fetch(`/api/vehicles/${vehicleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId ? parseInt(customerId) : null,
            model,
            color,
            vehicle_no: plate,
            chassis_no: vin
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update vehicle');
        }

        const updated = await res.json();
        showToast('Vehicle profile updated successfully', 'success');
        document.getElementById('modalEditVehicleMaster').style.display = 'none';

        await loadAndRenderVehicles();
        selectVehicle(parseInt(vehicleId));
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const formEditVehModel = document.getElementById('formEditVehicleModelMaster');
  if (formEditVehModel) {
    formEditVehModel.addEventListener('submit', handleSaveEditVehicleModel);
  }

  // ====================================================
  // PARTS & INVENTORY LISTENERS
  // ====================================================
  const subPartsStock = document.getElementById('subtabPartsStock');
  const subPartsOrders = document.getElementById('subtabPartsOrders');
  const panePartsStock = document.getElementById('panePartsStockTab');
  const panePartsOrders = document.getElementById('panePartsOrdersTab');

  if (subPartsStock && subPartsOrders) {
    subPartsStock.addEventListener('click', () => {
      subPartsStock.classList.add('active');
      subPartsOrders.classList.remove('active');
      if (panePartsStock) panePartsStock.style.display = 'flex';
      if (panePartsOrders) panePartsOrders.style.display = 'none';

      const headerText = document.getElementById('partsHeaderActionText');
      if (headerText) headerText.textContent = '+ Add Part to Stock';
      loadAndRenderParts();
    });

    subPartsOrders.addEventListener('click', () => {
      subPartsOrders.classList.add('active');
      subPartsStock.classList.remove('active');
      if (panePartsStock) panePartsStock.style.display = 'none';
      if (panePartsOrders) panePartsOrders.style.display = 'flex';

      const headerText = document.getElementById('partsHeaderActionText');
      if (headerText) headerText.textContent = '+ Add Part to Stock';
      loadAndRenderPartsOrders();
    });
  }

  const btnPartsHeader = document.getElementById('btnPartsHeaderAction');
  if (btnPartsHeader) {
    btnPartsHeader.addEventListener('click', () => {
      const modal = document.getElementById('modalAddPartMaster');
      if (!modal) return;
      const form = document.getElementById('formAddPartMaster');
      if (form) form.reset();
      modal.style.display = 'flex';
    });
  }

  initStockSyncModal();

  const partsSearch = document.getElementById('partsSearchInput');
  if (partsSearch) {
    partsSearch.addEventListener('input', () => {
      filterPartsList();
    });
  }

  document.querySelectorAll('#partsFilterChips .hub-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#partsFilterChips .hub-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.partsFilter = btn.dataset.filter || 'all';
      filterPartsList();
    });
  });

  const btnCardsView = document.getElementById('btnPartsViewCards');
  const btnTableView = document.getElementById('btnPartsViewTable');
  const contCards = document.getElementById('partsCardsContainer');
  const contTable = document.getElementById('partsTableContainer');

  if (btnCardsView && btnTableView) {
    btnCardsView.addEventListener('click', () => {
      state.partsViewMode = 'cards';
      btnCardsView.classList.add('active');
      btnTableView.classList.remove('active');
      if (contCards) contCards.style.display = 'grid';
      if (contTable) contTable.style.display = 'none';
    });

    btnTableView.addEventListener('click', () => {
      state.partsViewMode = 'table';
      btnTableView.classList.add('active');
      btnCardsView.classList.remove('active');
      if (contCards) contCards.style.display = 'none';
      if (contTable) contTable.style.display = 'block';
    });
  }

  const btnExportPartsCsv = document.getElementById('btnExportPartsCsv');
  if (btnExportPartsCsv) {
    btnExportPartsCsv.addEventListener('click', exportPartsToCsv);
  }

  const partsOrdersSearch = document.getElementById('partsOrdersSearchInput');
  if (partsOrdersSearch) {
    partsOrdersSearch.addEventListener('input', () => {
      filterPartsOrders();
    });
  }

  document.querySelectorAll('#partsOrdersFilterChips .hub-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#partsOrdersFilterChips .hub-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.partsOrdersFilter = btn.dataset.filter || 'all';
      filterPartsOrders();
    });
  });

  const thSelectAll = document.getElementById('thPartsSelectAll');
  if (thSelectAll) {
    thSelectAll.addEventListener('change', () => {
      const isChecked = thSelectAll.checked;
      document.querySelectorAll('#partsOrdersTableBody .part-row-select').forEach(cb => {
        cb.checked = isChecked;
      });
      updatePartsBulkToolbar();
    });
  }

  const btnBulkCust = document.getElementById('btnBulkCustomerApprove');
  if (btnBulkCust) btnBulkCust.addEventListener('click', () => executePartsBulkAction('CUSTOMER_APPROVE'));

  const btnBulkIns = document.getElementById('btnBulkInsuranceApprove');
  if (btnBulkIns) btnBulkIns.addEventListener('click', () => executePartsBulkAction('INSURANCE_APPROVE'));

  const btnBulkArr = document.getElementById('btnBulkMarkArrived');
  if (btnBulkArr) btnBulkArr.addEventListener('click', () => executePartsBulkAction('MARK_ARRIVED'));

  // Parts Approval Modal Events
  const btnClosePa = document.getElementById('btnClosePartsApproval');
  if (btnClosePa) btnClosePa.addEventListener('click', () => closeModal('modalPartsApproval'));

  const btnCancelPa = document.getElementById('btnCancelPartsApproval');
  if (btnCancelPa) btnCancelPa.addEventListener('click', () => closeModal('modalPartsApproval'));

  const btnAddPaItem = document.getElementById('btnPaAddPartItem');
  if (btnAddPaItem) btnAddPaItem.addEventListener('click', handlePaAddPart);

  const btnBulkCustPa = document.getElementById('btnPaBulkCustomerApprove');
  if (btnBulkCustPa) btnBulkCustPa.addEventListener('click', handlePaBulkCustomerApprove);

  const btnSavePa = document.getElementById('btnSavePartsApproval');
  if (btnSavePa) btnSavePa.addEventListener('click', handlePaSave);

  const formAddPart = document.getElementById('formAddPartMaster');
  if (formAddPart) {
    formAddPart.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('addPartName').value;
      const code = document.getElementById('addPartCode').value;
      const cost = document.getElementById('addPartDefaultCost').value;
      const qty = document.getElementById('addPartStockQty').value;

      try {
        const res = await fetch('/api/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            part_name: name,
            part_code: code,
            default_cost: cost,
            stock_qty: qty
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add part to catalog');
        }

        const created = await res.json();
        showToast(`Part ${created.part_name} added to catalog`, 'success');
        document.getElementById('modalAddPartMaster').style.display = 'none';

        await loadAndRenderParts();
        selectPart(created.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const formEditPart = document.getElementById('formEditPartMaster');
  if (formEditPart) {
    formEditPart.addEventListener('submit', async (e) => {
      e.preventDefault();
      const partId = document.getElementById('editPartId').value;
      const name = document.getElementById('editPartName').value;
      const code = document.getElementById('editPartCode').value;
      const cost = document.getElementById('editPartDefaultCost').value;
      const qty = document.getElementById('editPartStockQty').value;

      try {
        const res = await fetch(`/api/parts/${partId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            part_name: name,
            part_code: code,
            default_cost: cost,
            stock_qty: qty
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update part details');
        }

        const updated = await res.json();
        showToast(`Part ${updated.part_name} updated successfully`, 'success');
        document.getElementById('modalEditPartMaster').style.display = 'none';

        await loadAndRenderParts();
        selectPart(parseInt(partId));
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const btnToggleNewSurv = document.getElementById('btnToggleNewSurveyor');
  if (btnToggleNewSurv) {
    btnToggleNewSurv.addEventListener('click', () => {
      const newFields = document.getElementById('newSurveyorFields');
      if (newFields) {
        const isHidden = newFields.style.display === 'none';
        newFields.style.display = isHidden ? 'block' : 'none';
        btnToggleNewSurv.textContent = isHidden ? '← Choose an existing surveyor instead' : '+ Or register a new surveyor in directory';
        const nameInp = document.getElementById('survModalName');
        if (isHidden && nameInp) nameInp.focus();
      }
    });
  }

  // Add holiday form submit
  const formAddHoliday = document.getElementById('formAddHoliday');
  if (formAddHoliday) {
    formAddHoliday.addEventListener('submit', handleAddHolidaySubmit);
  }

  // Pipeline SLA Settings action buttons
  const btnSaveSla = document.getElementById('btnSaveAllSla');
  if (btnSaveSla) {
    btnSaveSla.addEventListener('click', handleSaveAllSla);
  }
  const btnResetSla = document.getElementById('btnResetDefaultSla');
  if (btnResetSla) {
    btnResetSla.addEventListener('click', handleResetDefaultSla);
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('appSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  const isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('sidebar_collapsed', isCollapsed);
}

function switchMainView(viewName) {
  state.mainView = viewName;

  // Update navigation link active classes
  document.querySelectorAll('.sidebar-item, .sidebar-subitem').forEach(el => el.classList.remove('active'));
  if (viewName === 'board') {
    const el = document.getElementById('navBoard');
    if (el) el.classList.add('active');
  } else if (viewName === 'customers') {
    const el = document.getElementById('navCustomers');
    if (el) el.classList.add('active');
  } else if (viewName === 'vehicles') {
    const el = document.getElementById('navVehicles');
    if (el) el.classList.add('active');
  } else if (viewName === 'parts') {
    const el = document.getElementById('navParts');
    if (el) el.classList.add('active');
  } else if (viewName === 'insurance') {
    const el = document.getElementById('navInsurance');
    if (el) el.classList.add('active');
  } else if (viewName === 'sla-settings') {
    const el = document.getElementById('navSlaSettings');
    if (el) el.classList.add('active');
    const group = document.getElementById('groupSettings');
    if (group) group.classList.add('open');
  } else if (viewName === 'holidays') {
    const el = document.getElementById('navHolidays');
    if (el) el.classList.add('active');
    const group = document.getElementById('groupSettings');
    if (group) group.classList.add('open');
  }

  // View elements
  const controlsBar = document.getElementById('controlsBar');
  const boardContainer = document.getElementById('boardContainer');
  const ticketPageView = document.getElementById('ticketPageView');
  const customersView = document.getElementById('customersView');
  const vehiclesView = document.getElementById('vehiclesView');
  const partsView = document.getElementById('partsView');
  const insuranceView = document.getElementById('insuranceView');
  const holidaysView = document.getElementById('holidaysView');
  const slaSettingsView = document.getElementById('slaSettingsView');

  // Hide all
  if (boardContainer) boardContainer.style.display = 'none';
  if (ticketPageView) ticketPageView.style.display = 'none';
  if (customersView) customersView.style.display = 'none';
  if (vehiclesView) vehiclesView.style.display = 'none';
  if (partsView) partsView.style.display = 'none';
  if (insuranceView) insuranceView.style.display = 'none';
  if (holidaysView) holidaysView.style.display = 'none';
  if (slaSettingsView) slaSettingsView.style.display = 'none';

  // Show target
  if (viewName === 'board') {
    if (controlsBar) controlsBar.style.display = 'flex';
    if (boardContainer) boardContainer.style.display = 'block';
    renderCurrentView();
    updateMetrics();
  } else if (viewName === 'ticket-detail') {
    if (controlsBar) controlsBar.style.display = 'none';
    if (ticketPageView) ticketPageView.style.display = 'block';
  } else {
    if (controlsBar) controlsBar.style.display = 'none';
    if (viewName === 'customers') {
      if (customersView) customersView.style.display = 'flex';
      loadAndRenderCustomers();
    } else if (viewName === 'vehicles') {
      if (vehiclesView) vehiclesView.style.display = 'flex';
      loadAndRenderVehicles();
    } else if (viewName === 'parts') {
      if (partsView) partsView.style.display = 'flex';
      const subOrders = document.getElementById('subtabPartsOrders');
      const paneStock = document.getElementById('panePartsStockTab');
      const paneOrders = document.getElementById('panePartsOrdersTab');
      const isOrdersTab = subOrders && subOrders.classList.contains('active');
      if (isOrdersTab) {
        if (paneStock) paneStock.style.display = 'none';
        if (paneOrders) paneOrders.style.display = 'flex';
        loadAndRenderPartsOrders();
      } else {
        if (paneStock) paneStock.style.display = 'flex';
        if (paneOrders) paneOrders.style.display = 'none';
        loadAndRenderParts();
      }
    } else if (viewName === 'insurance') {
      if (insuranceView) insuranceView.style.display = 'flex';
      const subSurv = document.getElementById('subtabSurveyors');
      const paneIns = document.getElementById('paneInsurersTab');
      const paneSurv = document.getElementById('paneSurveyorsTab');
      const isSurveyorsTab = subSurv && subSurv.classList.contains('active');
      if (isSurveyorsTab) {
        if (paneIns) paneIns.style.display = 'none';
        if (paneSurv) paneSurv.style.display = 'flex';
        loadAndRenderSurveyors();
      } else {
        if (paneIns) paneIns.style.display = 'flex';
        if (paneSurv) paneSurv.style.display = 'none';
        loadAndRenderInsurers();
      }
    } else if (viewName === 'sla-settings') {
      if (slaSettingsView) slaSettingsView.style.display = 'block';
      loadAndRenderSlaSettings();
    } else if (viewName === 'holidays') {
      if (holidaysView) holidaysView.style.display = 'block';
      loadAndRenderHolidays();
    }
  }
}

async function loadDirectoryCounts() {
  try {
    const [cRes, iRes, hRes, vRes, pRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/insurers'),
      fetch('/api/holidays'),
      fetch('/api/vehicle-models'),
      fetch('/api/parts')
    ]);
    const customers = (cRes.ok ? await cRes.json() : []) || [];
    const insurers = (iRes.ok ? await iRes.json() : []) || [];
    const holidays = (hRes.ok ? await hRes.json() : []) || [];
    const vehicles = (vRes.ok ? await vRes.json() : []) || [];
    const parts = (pRes.ok ? await pRes.json() : []) || [];

    state.customers = Array.isArray(customers) ? customers : [];
    state.insurers = Array.isArray(insurers) ? insurers : [];
    state.holidays = Array.isArray(holidays) ? holidays : [];
    state.vehicles = Array.isArray(vehicles) ? vehicles : [];
    state.parts = Array.isArray(parts) ? parts : [];

    const bCust = document.getElementById('badgeCustomerCount');
    const bIns = document.getElementById('badgeInsuranceCount');
    const bHol = document.getElementById('badgeHolidaysCount');
    const bVeh = document.getElementById('badgeVehiclesCount');
    const bParts = document.getElementById('badgePartsCount');

    if (bCust) bCust.textContent = state.customers.length.toLocaleString();
    if (bIns) bIns.textContent = state.insurers.length.toLocaleString();
    if (bHol) bHol.textContent = state.holidays.length.toLocaleString();
    if (bVeh) bVeh.textContent = state.vehicles.length.toLocaleString();
    if (bParts) bParts.textContent = state.parts.length.toLocaleString();
  } catch (err) {
    console.warn('Error loading directory counts:', err);
  }
}

// ====================================================
// CUSTOMERS DIRECTORY CONTROLLER
// ====================================================
async function loadAndRenderCustomers() {
  try {
    const res = await fetch('/api/customers');
    const raw = await res.json();
    const customers = Array.isArray(raw) ? raw : [];
    state.customers = customers;

    let totalVehicles = 0;
    let activeTickets = 0;
    let repeatCust = 0;
    customers.forEach(c => {
      totalVehicles += (c.vehicles ? c.vehicles.length : 0);
      activeTickets += (c.active_tickets || 0);
      if (c.total_tickets > 1) repeatCust++;
    });

    const statTotal = document.getElementById('custStatTotal');
    const statVeh = document.getElementById('custStatVehicles');
    const statAct = document.getElementById('custStatActive');
    const statRep = document.getElementById('custStatRepeat');
    const bCust = document.getElementById('badgeCustomerCount');

    if (statTotal) statTotal.textContent = customers.length;
    if (statVeh) statVeh.textContent = totalVehicles;
    if (statAct) statAct.textContent = activeTickets;
    if (statRep) statRep.textContent = repeatCust;
    if (bCust) bCust.textContent = customers.length;

    filterCustomersList();

    // Auto-select customer
    if (customers.length > 0) {
      if (!state.selectedCustomerId || !customers.some(c => c.id === state.selectedCustomerId)) {
        selectCustomer(customers[0].id);
      } else {
        selectCustomer(state.selectedCustomerId);
      }
    } else {
      const dossier = document.getElementById('customerDetailDossier');
      if (dossier) {
        dossier.innerHTML = `
          <div class="hub-empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <p>No customer records found.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    showToast('Failed to load customers: ' + err.message, 'error');
  }
}

function renderCustomersMasterList(customers) {
  const container = document.getElementById('customersMasterList');
  if (!container) return;
  container.innerHTML = '';

  if (!customers || customers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-subtle); padding: 30px; font-size: 12px;">
        No customers match criteria.
      </div>
    `;
    return;
  }

  customers.forEach(c => {
    const card = document.createElement('div');
    card.className = `hub-item-card ${c.id === state.selectedCustomerId ? 'active' : ''}`;
    card.dataset.id = c.id;

    const initials = (c.name || 'C').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    let vehTags = '';
    if (c.vehicles && c.vehicles.length > 0) {
      vehTags = c.vehicles.slice(0, 2).map(v => `<span class="hub-veh-tag">${escapeHtml(v.model || v.vehicle_name)}</span>`).join('');
      if (c.vehicles.length > 2) {
        vehTags += `<span class="hub-veh-tag">+${c.vehicles.length - 2} more</span>`;
      }
    }

    const pinSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-1px;margin-right:3px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    let branchBadge = '';
    if (c.branches && c.branches.length > 0) {
      if (c.branches.length === 1) {
        branchBadge = `<span class="hub-branch-pill" title="Tagged Workshop Branch">${pinSvg}${escapeHtml(c.branches[0].name)}</span>`;
      } else {
        const allNames = c.branches.map(b => b.name).join(', ');
        branchBadge = `<span class="hub-branch-pill" title="Tagged Branches: ${escapeHtml(allNames)}">${pinSvg}${escapeHtml(c.branches[0].name)} +${c.branches.length - 1}</span>`;
      }
    } else if (c.branch_name) {
      branchBadge = `<span class="hub-branch-pill">${pinSvg}${escapeHtml(c.branch_name)}</span>`;
    } else {
      branchBadge = `<span class="hub-branch-pill" style="color: #94a3b8;">${pinSvg}Unassigned</span>`;
    }

    const noteBadge = c.notes
      ? `<span title="Customer Note: ${escapeHtml(c.notes)}" style="font-size: 11px; cursor: help; color: #b45309; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
           Note
         </span>`
      : '';

    card.innerHTML = `
      <div class="hub-avatar">${initials}</div>
      <div class="hub-item-info">
        <div class="hub-item-top">
          <span class="hub-item-title">${escapeHtml(c.name)}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${c.active_tickets > 0
        ? `<span class="badge-stage" style="background: var(--sla-amber-bg); color: var(--sla-amber-text); border: 1px solid var(--sla-amber-border); font-size: 10px; font-weight: 700;">${c.active_tickets} Active</span>`
        : `<span style="font-size: 10px; color: var(--text-subtle);">${c.total_tickets || 0} Total</span>`}
            ${renderCardActions(`openEditCustomerById(${c.id})`, `deleteCustomer(${c.id}, '${escapeHtml(c.name)}')`, 'Edit Profile', 'Delete Customer')}
          </div>
        </div>
        <div class="hub-item-sub">
          <span style="font-family: var(--font-mono); font-weight: 600; display: inline-flex; align-items: center;">
            ${escapeHtml(c.primary_phone)}
            ${renderPhoneCopyBtn(c.primary_phone)}
          </span>
          ${branchBadge}
          ${noteBadge}
        </div>
        ${vehTags ? `<div class="hub-item-veh-row">${vehTags}</div>` : ''}
      </div>
    `;

    card.addEventListener('click', () => {
      selectCustomer(c.id);
    });

    container.appendChild(card);
  });
}

async function selectCustomer(customerId) {
  state.selectedCustomerId = customerId;

  // Highlight active in master list
  document.querySelectorAll('#customersMasterList .hub-item-card').forEach(card => {
    card.classList.toggle('active', parseInt(card.dataset.id) === customerId);
  });

  const dossier = document.getElementById('customerDetailDossier');
  if (!dossier) return;

  dossier.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-subtle);">Loading customer dossier...</div>`;

  try {
    const res = await fetch(`/api/customers/${customerId}`);
    if (!res.ok) throw new Error('Customer not found');
    const cust = await res.json();

    const initials = (cust.name || 'C').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const primaryVeh = cust.vehicles && cust.vehicles[0] ? cust.vehicles[0] : null;

    // Build Garage Cards HTML
    let garageHtml = `
      <div class="garage-empty-box">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.6"><circle cx="18.5" cy="17.5" r="3.5"></circle><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="15" cy="5" r="1"></circle><path d="M12 17.5V14l-3-3 4-3 2 3h2"></path></svg>
        <div style="font-weight: 600; color: #334155; font-size: 13px;">No vehicles registered</div>
        <div style="color: #64748b; font-size: 11.5px; margin-bottom: 8px;">Add a Honda motorcycle or scooter to this customer's profile.</div>
        <button type="button" class="btn btn-primary btn-xs" id="btnEmptyAddVehicle">
          + Add First Vehicle
        </button>
      </div>
    `;

    if (cust.vehicles && cust.vehicles.length > 0) {
      garageHtml = cust.vehicles.map(v => `
        <div class="garage-card">
          <div class="garage-card-head">
            <span class="garage-card-model">${escapeHtml(v.model || v.vehicle_name || 'Honda Motorcycle')}</span>
            ${v.color ? `<span class="garage-card-color"><span class="tp-color-swatch-dot"></span>${escapeHtml(v.color)}</span>` : ''}
          </div>
          <div>
            ${v.vehicle_no ? renderPlateBadge(v.vehicle_no) : '<span style="font-size: 11px; color: var(--text-subtle); font-style: italic;">No Reg Plate</span>'}
          </div>
          ${v.chassis_no ? `
            <div class="garage-card-chassis" title="Chassis VIN">
              <span>VIN: ${escapeHtml(v.chassis_no)}</span>
              <button type="button" class="btn-copy-chip" onclick="navigator.clipboard.writeText('${escapeHtml(v.chassis_no)}'); showToast('VIN copied to clipboard', 'info');" title="Copy VIN" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 0;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          ` : ''}
          <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">
            <button type="button" class="btn btn-xs btn-outline btn-intake-veh" style="width: 100%; justify-content: center;"
              data-cust="${escapeHtml(cust.name)}"
              data-phone="${escapeHtml(cust.primary_phone)}"
              data-model="${escapeHtml(v.model || v.vehicle_name)}"
              data-color="${escapeHtml(v.color || '')}"
              data-plate="${escapeHtml(v.vehicle_no || '')}"
              data-vin="${escapeHtml(v.chassis_no || '')}">
              + Intake This Bike
            </button>
            <div class="garage-card-action-bar" style="display: flex; gap: 4px;">
              <button type="button" class="btn btn-xs btn-outline btn-garage-edit-veh" data-id="${v.id}" style="flex: 1; justify-content: center;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit
              </button>
              <button type="button" class="btn btn-xs btn-outline-danger btn-garage-del-veh" data-id="${v.id}" data-name="${escapeHtml(v.model || v.vehicle_no || 'Vehicle')}" style="flex: 1; justify-content: center;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }

    // Build Service Tickets History Table HTML
    let ticketsHtml = `
      <div style="padding: 24px; text-align: center; color: var(--text-subtle); font-size: 12.5px;">
        No service tickets recorded for this customer yet.
      </div>
    `;

    if (cust.tickets && cust.tickets.length > 0) {
      ticketsHtml = `
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Ticket No</th>
                <th>Intake Date</th>
                <th>Model</th>
                <th>Plate No</th>
                <th>Stage</th>
                <th>Est. Cost</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${cust.tickets.map(t => {
        const dateStr = t.created_at ? formatDate(t.created_at) : '-';
        const isClosed = t.status === 'CLOSED';
        return `
                  <tr data-ticket-id="${t.id}" oncontextmenu="event.preventDefault(); openTicketContextMenu(event, ${t.id});" style="cursor: pointer;" title="Right-click for options, click to view">
                    <td>
                      <a href="javascript:void(0)" class="card-ticket-no" onclick="event.stopPropagation(); openTicketPage(${t.id})" oncontextmenu="event.preventDefault(); openTicketContextMenu(event, ${t.id});" title="View Ticket Page">
                        <strong>${escapeHtml(t.ticket_number)}</strong>
                      </a>
                    </td>
                    <td><span style="font-size: 11px; color: var(--text-muted);">${dateStr}</span></td>
                    <td><strong>${escapeHtml(t.model || '-')}</strong></td>
                    <td>${renderPlateBadge(t.vehicle_no)}</td>
                    <td><span class="ctx-stage-tag" style="font-size: 11px;">Stage #${t.current_stage_id} (${escapeHtml(t.stage_name || '')})</span></td>
                    <td><span style="font-family: var(--font-mono); font-weight: 700; color: #15803d;">₹${Number(t.estimated_cost || 0).toLocaleString('en-IN')}</span></td>
                    <td>
                      ${isClosed
            ? `<span class="badge" style="background: #f1f5f9; color: #64748b;">Delivered</span>`
            : `<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">Active Workshop</span>`}
                    </td>
                    <td>
                      <button type="button" class="btn btn-xs btn-outline" onclick="openTicketPage(${t.id})">Open</button>
                    </td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const branchTagsHtml = (cust.branches && cust.branches.length > 0)
      ? cust.branches.map(b => `<span class="badge" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-weight: 600; margin-left: 3px; display: inline-flex; align-items: center; gap: 3px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${escapeHtml(b.name)}</span>`).join('')
      : `<strong>${escapeHtml(cust.branch_name || 'Not Tagged')}</strong>`;

    dossier.innerHTML = `
      <div class="dossier-hero">
        <div class="dossier-hero-left">
          <div class="dossier-avatar-lg">${initials}</div>
          <div class="dossier-title-wrap">
            <h3>${escapeHtml(cust.name)}</h3>
            <div class="dossier-meta-row">
              <span style="display: inline-flex; align-items: center;">Primary Phone: <a href="tel:${escapeHtml(cust.primary_phone)}" style="margin-left: 4px;">${escapeHtml(cust.primary_phone)}</a>${renderPhoneCopyBtn(cust.primary_phone)}</span>
              ${cust.alt_phones ? `<span style="display: inline-flex; align-items: center;">Alt: <span style="font-family: var(--font-mono); margin-left: 4px;">${escapeHtml(cust.alt_phones)}</span>${renderPhoneCopyBtn(cust.alt_phones)}</span>` : ''}
              <span>Tagged Branches: ${branchTagsHtml}</span>
              <span>Customer ID: <strong>#${cust.id}</strong></span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-outline btn-sm" id="btnDossierAddVehicle" title="Add Vehicle">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            + Add Vehicle
          </button>
          <button type="button" class="btn btn-outline btn-sm" id="btnDossierEditCust" title="Edit Profile">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            Edit Profile
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm" id="btnDossierDeleteCust" title="Delete Customer Profile">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete Customer
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btnDossierNewTicket"
            data-name="${escapeHtml(cust.name)}"
            data-phone="${escapeHtml(cust.primary_phone)}"
            data-model="${primaryVeh ? escapeHtml(primaryVeh.model || primaryVeh.vehicle_name) : ''}"
            data-color="${primaryVeh && primaryVeh.color ? escapeHtml(primaryVeh.color) : ''}"
            data-reg="${primaryVeh && primaryVeh.vehicle_no ? escapeHtml(primaryVeh.vehicle_no) : ''}"
            data-vin="${primaryVeh && primaryVeh.chassis_no ? escapeHtml(primaryVeh.chassis_no) : ''}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            + New Service Ticket
          </button>
          <button type="button" class="btn-dossier-note-icon ${cust.notes ? 'has-notes' : ''}" id="btnDossierNoteIcon" title="${cust.notes ? 'Customer Note: ' + escapeHtml(cust.notes) : 'Add Customer Note / Remarks'}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            ${cust.notes ? '<span class="note-indicator-dot"></span>' : ''}
          </button>
        </div>
      </div>

      <div class="dossier-section-title">
        <h4>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8m-4-4h8"></path></svg>
          Vehicles (${cust.vehicles ? cust.vehicles.length : 0})
        </h4>
        <button type="button" class="btn btn-outline btn-xs" id="btnOpenAddVehicleModal">
          + Add Vehicle
        </button>
      </div>
      <div class="garage-grid">${garageHtml}</div>

      <div class="dossier-section-title">
        <h4>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Complete Service History & Active Jobs (${cust.tickets ? cust.tickets.length : 0})
        </h4>
      </div>
      ${ticketsHtml}
    `;

    // Hook up Add Vehicle buttons
    const btnAddVehHero = document.getElementById('btnDossierAddVehicle');
    if (btnAddVehHero) {
      btnAddVehHero.addEventListener('click', () => openAddVehicleModal(cust));
    }
    const btnAddVehSec = document.getElementById('btnOpenAddVehicleModal');
    if (btnAddVehSec) {
      btnAddVehSec.addEventListener('click', () => openAddVehicleModal(cust));
    }
    const btnAddVehEmpty = document.getElementById('btnEmptyAddVehicle');
    if (btnAddVehEmpty) {
      btnAddVehEmpty.addEventListener('click', () => openAddVehicleModal(cust));
    }

    // Hook up Edit Profile button
    const btnEditCust = document.getElementById('btnDossierEditCust');
    if (btnEditCust) {
      btnEditCust.addEventListener('click', () => {
        openEditCustomerModal(cust);
      });
    }

    // Hook up Delete Customer button
    const btnDelCust = document.getElementById('btnDossierDeleteCust');
    if (btnDelCust) {
      btnDelCust.addEventListener('click', () => {
        deleteCustomer(cust.id, cust.name);
      });
    }

    // Hook garage vehicle edit & delete buttons
    dossier.querySelectorAll('.btn-garage-edit-veh').forEach(b => {
      b.addEventListener('click', () => openEditVehicleById(b.dataset.id));
    });
    dossier.querySelectorAll('.btn-garage-del-veh').forEach(b => {
      b.addEventListener('click', () => deleteVehicle(b.dataset.id, b.dataset.name));
    });

    // Hook up Customer Notes Icon button
    const btnNoteIcon = document.getElementById('btnDossierNoteIcon');
    if (btnNoteIcon) {
      btnNoteIcon.addEventListener('click', () => {
        openCustomerNotesModal(cust);
      });
    }

    // Hook up intake button
    const btnNewTkt = document.getElementById('btnDossierNewTicket');
    if (btnNewTkt) {
      btnNewTkt.addEventListener('click', () => {
        openNewTicketModal();
        document.getElementById('newCustomerName').value = btnNewTkt.dataset.name || '';
        document.getElementById('newCustomerPhone').value = btnNewTkt.dataset.phone || '';
        document.getElementById('newVehicleName').value = btnNewTkt.dataset.model || '';
        const colEl = document.getElementById('newVehicleColor');
        if (colEl) colEl.value = btnNewTkt.dataset.color || '';
        document.getElementById('newVehicleNo').value = btnNewTkt.dataset.reg || '';
        document.getElementById('newChassisNumber').value = btnNewTkt.dataset.vin || '';
      });
    }

    dossier.querySelectorAll('.btn-intake-veh').forEach(b => {
      b.addEventListener('click', () => {
        openNewTicketModal();
        document.getElementById('newCustomerName').value = b.dataset.cust || '';
        document.getElementById('newCustomerPhone').value = b.dataset.phone || '';
        document.getElementById('newVehicleName').value = b.dataset.model || '';
        const colEl = document.getElementById('newVehicleColor');
        if (colEl) colEl.value = b.dataset.color || '';
        document.getElementById('newVehicleNo').value = b.dataset.plate || '';
        document.getElementById('newChassisNumber').value = b.dataset.vin || '';
      });
    });

    state.currentCustomerTickets = cust.tickets || [];
    dossier.querySelectorAll('.dossier-table tbody tr').forEach(tr => {
      const tid = tr.dataset.ticketId;
      if (tid) {
        tr.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openTicketContextMenu(e, tid);
        });
      }
    });

  } catch (err) {
    dossier.innerHTML = `<div style="color: var(--sla-breached-text); padding: 30px; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function filterCustomersList() {
  const searchInput = document.getElementById('customerSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const filterType = state.customerFilter || 'all';
  const branchFilterIds = (state.customerBranchFilters && state.customerBranchFilters.length > 0)
    ? state.customerBranchFilters.map(String)
    : (state.customerBranchFilter ? [String(state.customerBranchFilter)] : []);

  let filtered = (state.customers || []).slice();

  if (filterType === 'active') {
    filtered = filtered.filter(c => (c.active_tickets || 0) > 0);
  } else if (filterType === 'multi') {
    filtered = filtered.filter(c => (c.vehicles || []).length > 1);
  }

  if (branchFilterIds.length > 0 && !branchFilterIds.includes('ALL')) {
    filtered = filtered.filter(c => {
      if (c.branches && c.branches.length > 0) {
        return c.branches.some(b => branchFilterIds.includes(String(b.id)));
      }
      return branchFilterIds.includes(String(c.branch_id));
    });
  }

  if (query) {
    filtered = filtered.filter(c => {
      const matchName = (c.name || '').toLowerCase().includes(query);
      const matchPhone = (c.primary_phone || '').includes(query) || (c.alt_phones || '').includes(query);
      const matchVeh = (c.vehicles || []).some(v =>
        (v.vehicle_name || '').toLowerCase().includes(query) ||
        (v.model || '').toLowerCase().includes(query) ||
        (v.color || '').toLowerCase().includes(query) ||
        (v.vehicle_no || '').toLowerCase().includes(query) ||
        (v.chassis_no || '').toLowerCase().includes(query)
      );
      const matchBranch = (c.branch_name || '').toLowerCase().includes(query) ||
        (c.branches || []).some(b => (b.name || '').toLowerCase().includes(query) || (b.code || '').toLowerCase().includes(query));
      const matchNotes = (c.notes || '').toLowerCase().includes(query);
      return matchName || matchPhone || matchVeh || matchBranch || matchNotes;
    });
  }

  renderCustomersMasterList(filtered);
}

function openEditCustomerModal(cust) {
  const modal = document.getElementById('modalEditCustomer');
  if (!modal) return;

  document.getElementById('editCustId').value = cust.id;
  document.getElementById('editCustName').value = cust.name || '';
  document.getElementById('editCustPhone').value = cust.primary_phone || '';
  document.getElementById('editCustAltPhones').value = cust.alt_phones || '';

  const branchSel = document.getElementById('editCustBranch');
  if (branchSel) branchSel.value = cust.branch_id || '';

  // Synchronize multi-branch checkboxes
  const activeBranchIds = new Set(
    (cust.branches && cust.branches.length > 0)
      ? cust.branches.map(b => String(b.id))
      : (cust.branch_id ? [String(cust.branch_id)] : [])
  );

  document.querySelectorAll('#editCustBranchesContainer .branch-pill-checkbox').forEach(pill => {
    const cb = pill.querySelector('input');
    if (cb) {
      cb.checked = activeBranchIds.has(String(cb.value));
      pill.classList.toggle('active', cb.checked);
    }
  });

  document.getElementById('editCustNotes').value = cust.notes || '';

  modal.style.display = 'flex';
}

async function handleSaveEditCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('editCustId').value;
  const name = document.getElementById('editCustName').value.trim();
  const primaryPhone = document.getElementById('editCustPhone').value.trim();
  const altPhones = document.getElementById('editCustAltPhones').value.trim();

  const branchPills = document.querySelectorAll('#editCustBranchesContainer input[type="checkbox"]:checked');
  const branchIds = Array.from(branchPills).map(cb => parseInt(cb.value)).filter(Boolean);
  const branchId = branchIds.length > 0 ? branchIds[0] : (document.getElementById('editCustBranch') ? document.getElementById('editCustBranch').value : null);
  const notes = document.getElementById('editCustNotes').value.trim();

  if (!name || !primaryPhone) {
    showToast('Name and Primary Phone are required', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        primaryPhone,
        altPhones,
        branchId: branchId ? parseInt(branchId) : null,
        branchIds,
        notes
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update customer');
    }

    showToast('✓ Customer profile updated successfully!', 'success');
    const modal = document.getElementById('modalEditCustomer');
    if (modal) modal.style.display = 'none';

    await loadAndRenderCustomers();
    selectCustomer(parseInt(id));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSaveNewCustomer(e) {
  e.preventDefault();
  const name = document.getElementById('regCustName').value.trim();
  const primaryPhone = document.getElementById('regCustPhone').value.trim();
  const altPhones = document.getElementById('regCustAltPhones').value.trim();

  const branchPills = document.querySelectorAll('#regCustBranchesContainer input[type="checkbox"]:checked');
  const branchIds = Array.from(branchPills).map(cb => parseInt(cb.value)).filter(Boolean);
  const branchId = branchIds.length > 0 ? branchIds[0] : (document.getElementById('regCustBranch') ? document.getElementById('regCustBranch').value : null);
  const notes = document.getElementById('regCustNotes') ? document.getElementById('regCustNotes').value.trim() : '';

  if (!name || !primaryPhone) {
    showToast('Customer Name and Primary Phone are required', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        primaryPhone,
        altPhones,
        branchId: branchId ? parseInt(branchId) : null,
        branchIds,
        notes
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create customer');
    }

    const data = await res.json();
    showToast('✓ Customer profile registered successfully!', 'success');
    const modal = document.getElementById('modalNewCustomer');
    if (modal) modal.style.display = 'none';
    document.getElementById('formNewCustomerModal').reset();
    document.querySelectorAll('#regCustBranchesContainer .branch-pill-checkbox').forEach(p => {
      const cb = p.querySelector('input');
      if (cb) cb.checked = false;
      p.classList.remove('active');
    });

    state.selectedCustomerId = data.id;
    await loadAndRenderCustomers();
    selectCustomer(data.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddVehicleModal(cust) {
  const modal = document.getElementById('modalAddCustomerVehicle');
  if (!modal) return;

  const form = document.getElementById('formAddCustomerVehicle');
  if (form) form.reset();

  const idInput = document.getElementById('addVehCustomerId');
  if (idInput) idInput.value = cust.id;

  const subtitle = document.getElementById('addVehModalSubtitle');
  if (subtitle) {
    subtitle.textContent = `Register a new Honda vehicle for ${cust.name || 'Customer'} (ID #${cust.id})`;
  }

  modal.style.display = 'flex';
  const modelInput = document.getElementById('addVehModel');
  if (modelInput) modelInput.focus();
}

async function handleSaveCustomerVehicle(e) {
  e.preventDefault();
  const customerId = document.getElementById('addVehCustomerId').value;
  const model = document.getElementById('addVehModel').value.trim();
  const color = document.getElementById('addVehColor').value.trim();
  const vehicleNo = document.getElementById('addVehPlate').value.trim();
  const chassisNo = document.getElementById('addVehVin').value.trim();

  if (!model && !vehicleNo) {
    showToast('Honda Model or Registration Plate is required', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/customers/${customerId}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, color, vehicleNo, chassisNo })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add vehicle to customer');
    }

    showToast('Vehicle added successfully!', 'success');
    const modal = document.getElementById('modalAddCustomerVehicle');
    if (modal) modal.style.display = 'none';

    const form = document.getElementById('formAddCustomerVehicle');
    if (form) form.reset();

    await loadAndRenderCustomers();
    selectCustomer(parseInt(customerId));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// CUSTOMER NOTES MODAL CONTROLLER
// ====================================================
function openCustomerNotesModal(cust) {
  const modal = document.getElementById('modalCustomerNotes');
  if (!modal) return;

  const idInput = document.getElementById('custNotesCustomerId');
  if (idInput) idInput.value = cust.id;

  const title = document.getElementById('custNotesModalTitle');
  if (title) title.textContent = `Notes: ${cust.name || 'Customer'}`;

  const subtitle = document.getElementById('custNotesModalSubtitle');
  if (subtitle) subtitle.textContent = `Special preferences, VIP remarks, and service instructions for ID #${cust.id}`;

  const textarea = document.getElementById('custNotesTextInput');
  if (textarea) {
    textarea.value = cust.notes || '';
  }

  modal.style.display = 'flex';
  if (textarea) textarea.focus();
}

async function handleSaveCustomerNotes(e) {
  e.preventDefault();
  const customerId = document.getElementById('custNotesCustomerId').value;
  const notesInput = document.getElementById('custNotesTextInput');
  const notes = notesInput ? notesInput.value.trim() : '';

  try {
    const res = await fetch(`/api/customers/${customerId}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save customer notes');
    }

    const modal = document.getElementById('modalCustomerNotes');
    if (modal) modal.style.display = 'none';

    showToast('Customer notes saved successfully!', 'success');

    // Update state.customers cache in memory
    const custInState = (state.customers || []).find(c => c.id === parseInt(customerId));
    if (custInState) {
      custInState.notes = notes || null;
    }

    filterCustomersList();
    selectCustomer(parseInt(customerId));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleClearCustomerNotes() {
  const customerId = document.getElementById('custNotesCustomerId').value;
  const notesInput = document.getElementById('custNotesTextInput');
  if (!customerId) return;

  if (!notesInput || !notesInput.value.trim()) {
    showToast('No notes to clear', 'info');
    return;
  }

  try {
    const res = await fetch(`/api/customers/${customerId}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: '' })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to clear customer notes');
    }

    notesInput.value = '';
    const modal = document.getElementById('modalCustomerNotes');
    if (modal) modal.style.display = 'none';

    showToast('Customer notes cleared', 'info');

    const custInState = (state.customers || []).find(c => c.id === parseInt(customerId));
    if (custInState) {
      custInState.notes = null;
    }

    filterCustomersList();
    selectCustomer(parseInt(customerId));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// GLOBAL ENTITY DELETE HANDLERS & CARD ACTION BUTTONS
// ====================================================
function renderCardActions(editJs, deleteJs, editTitle = 'Edit', deleteTitle = 'Delete') {
  return `
    <div class="hub-card-actions">
      <button type="button" class="hub-card-btn edit" title="${escapeHtml(editTitle)}" onclick="event.stopPropagation(); ${editJs}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
      </button>
      <button type="button" class="hub-card-btn delete" title="${escapeHtml(deleteTitle)}" onclick="event.stopPropagation(); ${deleteJs}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `;
}

function openEditCustomerById(cId) {
  const c = (state.customers || []).find(item => item.id === parseInt(cId));
  if (c) {
    openEditCustomerModal(c);
  } else {
    fetch(`/api/customers/${cId}`).then(r => r.json()).then(openEditCustomerModal).catch(err => showToast(err.message, 'error'));
  }
}

function openEditVehicleById(vId) {
  const v = (state.vehicles || []).find(item => item.id === parseInt(vId));
  if (v) {
    openEditVehicleModal(v);
  } else {
    fetch(`/api/vehicles/${vId}`).then(r => r.json()).then(openEditVehicleModal).catch(err => showToast(err.message, 'error'));
  }
}

function openEditPartById(pId) {
  const p = (state.parts || []).find(item => item.id === parseInt(pId));
  if (p) {
    openEditPartModal(p);
  } else {
    fetch(`/api/parts/${pId}`).then(r => r.json()).then(openEditPartModal).catch(err => showToast(err.message, 'error'));
  }
}

function openEditInsurerById(insId) {
  const ins = (state.insurers || []).find(item => item.id === parseInt(insId));
  if (ins) {
    openEditInsurerModal(ins);
  } else {
    fetch(`/api/insurers/${insId}`).then(r => r.json()).then(openEditInsurerModal).catch(err => showToast(err.message, 'error'));
  }
}

function openEditSurveyorById(survId) {
  const surv = (state.surveyors || []).find(item => item.id === parseInt(survId));
  if (surv) {
    openEditSurveyorModal(surv);
  } else {
    fetch(`/api/surveyors/${survId}`).then(r => r.json()).then(openEditSurveyorModal).catch(err => showToast(err.message, 'error'));
  }
}

async function deleteVehicle(vehicleId, vehicleLabel) {
  if (!await showConfirmDialog({
    title: 'Delete Vehicle',
    message: `Are you sure you want to delete vehicle "${vehicleLabel || 'this vehicle'}"?\nService tickets and history will remain preserved.`,
    confirmText: 'Delete Vehicle'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete vehicle');
    showToast(data.message || 'Vehicle deleted successfully', 'success');
    if (state.selectedVehicleId === parseInt(vehicleId)) {
      state.selectedVehicleId = null;
    }
    await loadAndRenderVehicles();
    if (state.selectedCustomerId) {
      selectCustomer(state.selectedCustomerId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePart(partId, partName) {
  if (!await showConfirmDialog({
    title: 'Delete Part',
    message: `Are you sure you want to delete part "${partName || 'this part'}" from the catalog?`,
    confirmText: 'Delete Part'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/parts/${partId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete part');
    showToast(data.message || 'Part deleted successfully', 'success');
    if (state.selectedPartId === parseInt(partId)) {
      state.selectedPartId = null;
    }
    await loadAndRenderParts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePartOrder(orderId, partName, ticketNumber) {
  if (!await showConfirmDialog({
    title: 'Remove Part Order',
    message: `Remove part item "${partName}" from Ticket #${ticketNumber || ''}?`,
    confirmText: 'Remove'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/parts-orders/${orderId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete order item');
    showToast(data.message || 'Part order item removed', 'success');
    await loadAndRenderPartsOrders();
    if (state.selectedPartId) {
      selectPart(state.selectedPartId);
    }
    if (typeof refreshTickets === 'function') {
      refreshTickets().catch(() => { });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCustomer(customerId, customerName) {
  if (!await showConfirmDialog({
    title: 'Delete Customer',
    message: `Are you sure you want to delete customer "${customerName || 'this customer'}"?\nLinked service tickets and vehicles will remain in the database.`,
    confirmText: 'Delete Customer'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete customer');
    showToast(data.message || 'Customer deleted successfully', 'success');
    if (state.selectedCustomerId === parseInt(customerId)) {
      state.selectedCustomerId = null;
    }
    await loadAndRenderCustomers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteInsurer(insurerId, insurerName) {
  if (!await showConfirmDialog({
    title: 'Delete Insurance Company',
    message: `Are you sure you want to delete insurance company "${insurerName || 'this insurer'}"?`,
    confirmText: 'Delete Company'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/insurers/${insurerId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete insurance company');
    showToast(data.message || 'Insurance company deleted successfully', 'success');
    if (state.selectedInsurerId === parseInt(insurerId)) {
      state.selectedInsurerId = null;
    }
    await loadAndRenderInsurers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSurveyor(surveyorId, surveyorName) {
  if (!await showConfirmDialog({
    title: 'Delete Claim Surveyor',
    message: `Are you sure you want to delete claim surveyor "${surveyorName || 'this surveyor'}"?`,
    confirmText: 'Delete Surveyor'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/surveyors/${surveyorId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete surveyor');
    showToast(data.message || 'Surveyor deleted successfully', 'success');
    if (state.selectedSurveyorId === parseInt(surveyorId)) {
      state.selectedSurveyorId = null;
    }
    await loadAndRenderSurveyors();
    if (typeof loadAndRenderInsurers === 'function') {
      loadAndRenderInsurers();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// VEHICLES FLEET DIRECTORY CONTROLLER (MODELS & PEOPLE)
// ====================================================

function openEditVehicleModelModalByKey(key) {
  const model = (state.vehicleModels || []).find(m => m.key === key);
  if (model) {
    openEditVehicleModelModal(model);
  } else {
    fetch(`/api/vehicle-models/${key}`)
      .then(r => r.json())
      .then(openEditVehicleModelModal)
      .catch(err => showToast(err.message, 'error'));
  }
}

function openEditVehicleModelModal(model) {
  const modal = document.getElementById('modalEditVehicleModelMaster');
  if (!modal || !model) return;
  document.getElementById('editVehModelKey').value = model.key;
  document.getElementById('editVehModelName').value = model.name;
  modal.style.display = 'flex';
  const nameInp = document.getElementById('editVehModelName');
  if (nameInp) nameInp.focus();
}

async function handleSaveEditVehicleModel(e) {
  e.preventDefault();
  const key = document.getElementById('editVehModelKey').value;
  const name = document.getElementById('editVehModelName').value.trim();
  if (!name) {
    showToast('Vehicle model name is required', 'warning');
    return;
  }
  try {
    const res = await fetch(`/api/vehicle-models/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update vehicle model');
    showToast(`✓ ${data.message || 'Vehicle model updated successfully'}`, 'success');
    const modal = document.getElementById('modalEditVehicleModelMaster');
    if (modal) modal.style.display = 'none';
    await loadAndRenderVehicles();
    selectVehicleModel(key);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteVehicleModel(modelKey, modelName) {
  if (!await showConfirmDialog({
    title: 'Delete Vehicle Model',
    message: `Are you sure you want to delete vehicle model "${modelName || 'this model'}" and all its vehicle records?\nHistorical service tickets and financial records will be safely preserved.`,
    confirmText: 'Delete Model'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/vehicle-models/${modelKey}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete vehicle model');
    showToast(data.message || 'Vehicle model deleted successfully', 'success');
    if (state.selectedVehicleModelKey === modelKey) {
      state.selectedVehicleModelKey = null;
    }
    await loadAndRenderVehicles();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAndRenderVehicles() {
  try {
    const res = await fetch('/api/vehicle-models');
    if (!res.ok) throw new Error('Failed to fetch vehicle models');
    const models = await res.json();
    state.vehicleModels = models;

    let totalFleetUnits = 0;
    let inWorkshopUnits = 0;
    models.forEach(m => {
      totalFleetUnits += (m.fleet_count || 0);
      inWorkshopUnits += (m.active_in_workshop || 0);
    });

    const statTotal = document.getElementById('vehStatTotal');
    const statWorkshop = document.getElementById('vehStatWorkshop');
    const bVeh = document.getElementById('badgeVehiclesCount');

    if (statTotal) statTotal.textContent = totalFleetUnits;
    if (statWorkshop) statWorkshop.textContent = inWorkshopUnits;
    if (bVeh) bVeh.textContent = models.length;

    filterVehiclesList();

    // Auto-select vehicle model
    if (models.length > 0) {
      if (!state.selectedVehicleModelKey || !models.some(m => m.key === state.selectedVehicleModelKey)) {
        selectVehicleModel(models[0].key);
      } else {
        selectVehicleModel(state.selectedVehicleModelKey);
      }
    } else {
      const dossier = document.getElementById('vehicleDetailDossier');
      if (dossier) {
        dossier.innerHTML = `
          <div class="hub-empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0m10 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0"></path>
              <path d="M5 17H3v-4l2-5h9l4 5h1a2 2 0 0 1 2 2v2h-2m-4 0H9"></path>
            </svg>
            <p>No vehicle models found in fleet repository.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    showToast('Failed to load vehicles: ' + err.message, 'error');
  }
}

function filterVehiclesList() {
  const searchInput = document.getElementById('vehicleSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const filter = state.vehicleFilter || 'all';

  let filtered = state.vehicleModels || [];

  if (filter === 'workshop') {
    filtered = filtered.filter(m => (m.active_in_workshop || 0) > 0);
  } else if (filter === 'ready') {
    filtered = filtered.filter(m => (m.active_in_workshop || 0) === 0);
  }

  if (query) {
    filtered = filtered.filter(m =>
      (m.name || '').toLowerCase().includes(query) ||
      (m.category || '').toLowerCase().includes(query) ||
      (m.variants || []).some(v => v.toLowerCase().includes(query))
    );
  }

  renderVehiclesMasterList(filtered);
}

function renderVehiclesMasterList(models) {
  const container = document.getElementById('vehiclesMasterList');
  if (!container) return;
  container.innerHTML = '';

  if (!models || models.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-subtle); padding: 30px; font-size: 12px;">
        No vehicle models match criteria.
      </div>
    `;
    return;
  }

  models.forEach(m => {
    const card = document.createElement('div');
    card.className = `hub-item-card ${m.key === state.selectedVehicleModelKey ? 'active' : ''}`;
    card.dataset.key = m.key;

    const initials = (m.name.replace(/^Honda\s+/i, '') || 'H').slice(0, 2).toUpperCase();

    const workshopBadge = m.active_in_workshop > 0
      ? `<span class="veh-status-badge workshop" title="${m.active_in_workshop} vehicle units currently in active workshop repair"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align: -1px; margin-right: 3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>${m.active_in_workshop} In Workshop</span>`
      : `<span class="veh-status-badge ready">${m.fleet_count} Units</span>`;

    const variantsStr = (m.variants && m.variants.length > 0)
      ? m.variants.slice(0, 2).join(', ') + (m.variants.length > 2 ? ` +${m.variants.length - 2}` : '')
      : 'All Trims';

    card.innerHTML = `
      <div class="hub-avatar" style="background: linear-gradient(135deg, #1e3a8a, #3b82f6);">${initials}</div>
      <div class="hub-item-info">
        <div class="hub-item-top">
          <span class="hub-item-title">${escapeHtml(m.name)}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${workshopBadge}
            ${renderCardActions(`openEditVehicleModelModalByKey('${m.key}')`, `deleteVehicleModel('${m.key}', '${escapeHtml(m.name).replace(/'/g, "\\'")}')`, 'Edit Model', 'Delete Model')}
          </div>
        </div>
        <div class="hub-item-sub" style="display: flex; align-items: center; justify-content: space-between;">
          <span><strong>${m.fleet_count}</strong> Registered Units</span>
          <span style="color: var(--text-subtle);">${m.total_tickets || 0} Visits</span>
        </div>
        <div class="hub-item-veh-row">
          <span class="hub-veh-tag" title="Category">${escapeHtml(m.category)}</span>
          <span class="hub-veh-tag" title="Variants: ${escapeHtml((m.variants || []).join(', '))}" style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(variantsStr)}
          </span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectVehicleModel(m.key);
    });

    container.appendChild(card);
  });
}

async function selectVehicleModel(modelKey) {
  state.selectedVehicleModelKey = modelKey;

  document.querySelectorAll('#vehiclesMasterList .hub-item-card').forEach(card => {
    card.classList.toggle('active', card.dataset.key === modelKey);
  });

  const dossier = document.getElementById('vehicleDetailDossier');
  if (!dossier) return;

  dossier.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-subtle);">Loading ${escapeHtml(modelKey)} vehicle dossier...</div>`;

  try {
    const res = await fetch(`/api/vehicle-models/${modelKey}`);
    if (!res.ok) throw new Error('Vehicle model not found');
    const d = await res.json();

    const initials = (d.name.replace(/^Honda\s+/i, '') || 'H').slice(0, 2).toUpperCase();

    // 1. Collect all distinct vehicle units with driver/owner metadata
    const unitList = [];
    (d.people || []).forEach(p => {
      (p.vehicles || []).forEach(v => {
        unitList.push({
          ...v,
          person: p
        });
      });
    });

    // 2. Units & Drivers HTML
    let unitsHtml = '';
    if (unitList.length > 0) {
      unitsHtml = `
        <div class="veh-units-grid">
          ${unitList.map(item => {
        const v = item;
        const p = item.person || {};
        const isOwner = p.is_owner;
        const roleBadge = isOwner
          ? `<span class="intake-person-role owner"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>Registered Owner</span>`
          : `<span class="intake-person-role driver"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><rect x="3" y="11" width="18" height="9" rx="2"></rect><path d="M5 11l2-6h10l2 6"></path><circle cx="7.5" cy="16.5" r="1.5"></circle><circle cx="16.5" cy="16.5" r="1.5"></circle></svg>Driver / Brought By</span>`;

        const plateHtml = renderPlateBadge(v.vehicle_no);

        const statusChip = v.active_ticket_id
          ? `<span class="veh-workshop-chip active" title="Active Ticket #${escapeHtml(v.active_ticket_number || '')}">
                   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>In Workshop (#${escapeHtml(v.active_ticket_number || '')})
                 </span>`
          : `<span class="veh-workshop-chip idle">Ready / Idle</span>`;

        const vinHtml = v.chassis_no
          ? `<span class="veh-unit-vin">
                   VIN: ${escapeHtml(v.chassis_no)}
                   <button type="button" class="btn-copy-chip" onclick="navigator.clipboard.writeText('${escapeHtml(v.chassis_no)}'); showToast('VIN copied', 'info');" title="Copy VIN" style="background:none;border:none;cursor:pointer;color:#64748b;padding:0;line-height:1;">
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                   </button>
                 </span>`
          : '<span style="font-size: 10.5px; color: #94a3b8;">No VIN recorded</span>';

        return `
              <div class="veh-unit-card">
                <div class="veh-unit-top">
                  <div>${plateHtml}</div>
                  <div>${statusChip}</div>
                </div>
                <div class="veh-unit-trim">
                  ${escapeHtml(v.model || d.name)}
                  ${v.color ? ` &bull; <span style="font-weight: 400; color: #64748b;">${escapeHtml(v.color)}</span>` : ''}
                </div>
                <div>${vinHtml}</div>

                <div class="veh-unit-owner-box">
                  <div class="veh-unit-owner-row">
                    <span class="veh-unit-owner-name">${escapeHtml(p.name || 'Customer')}</span>
                    ${roleBadge}
                  </div>
                  <div class="veh-unit-owner-phone">
                    ${p.phone ? `
                      <a href="tel:${escapeHtml(p.phone)}" style="color: inherit; text-decoration: none;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        ${escapeHtml(p.phone)}
                      </a>
                      ${renderPhoneCopyBtn(p.phone)}
                    ` : '<span style="color: #94a3b8; font-style: italic;">No phone</span>'}
                  </div>
                </div>

                <div class="veh-unit-actions">
                  <div style="display: flex; gap: 4px;">
                    <button type="button" class="btn btn-xs btn-outline btn-edit-unit" data-veh-id="${v.id}" title="Edit vehicle unit">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                      Edit
                    </button>
                    <button type="button" class="btn btn-xs btn-outline-danger btn-del-unit" data-veh-id="${v.id}" data-veh-plate="${escapeHtml(v.vehicle_no || '')}" title="Delete vehicle unit">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      Delete
                    </button>
                    ${p.customer_id ? `
                      <button type="button" class="btn btn-xs btn-outline btn-view-veh-owner" data-cust-id="${p.customer_id}" title="View Customer Profile">
                        Profile &rarr;
                      </button>
                    ` : ''}
                  </div>
                  <button type="button" class="btn btn-xs btn-primary btn-intake-unit" data-veh-id="${v.id}" data-cust-id="${p.customer_id || ''}" data-cust-name="${escapeHtml(p.name || '')}" data-cust-phone="${escapeHtml(p.phone || '')}" data-veh-no="${escapeHtml(v.vehicle_no || '')}" data-veh-model="${escapeHtml(v.model || d.name)}" data-veh-color="${escapeHtml(v.color || '')}" data-veh-vin="${escapeHtml(v.chassis_no || '')}" title="Create new service intake ticket">
                    + Intake
                  </button>
                </div>
              </div>
            `;
      }).join('')}
        </div>
      `;
    } else {
      unitsHtml = `
        <div style="text-align: center; padding: 48px 20px; color: #64748b;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin-bottom: 8px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div style="font-weight: 600; font-size: 13px; color: #334155;">No Vehicle Units Registered Yet</div>
          <p style="font-size: 11.5px; margin-top: 4px;">Register the first vehicle unit for ${escapeHtml(d.name)} to begin logging workshop visits.</p>
        </div>
      `;
    }

    // 3. Compact Service History Table HTML
    let historyHtml = '';
    if (d.tickets && d.tickets.length > 0) {
      historyHtml = `
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
          <table class="compact-data-table">
            <thead>
              <tr>
                <th style="width: 120px;">Ticket #</th>
                <th style="width: 100px;">Intake Date</th>
                <th style="width: 130px;">Vehicle Plate</th>
                <th>Customer & Phone</th>
                <th>Workshop Branch</th>
                <th style="width: 140px;">Current Stage</th>
                <th style="width: 100px;">Repair Bill</th>
                <th style="width: 120px;">Parts Summary</th>
                <th style="width: 100px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${d.tickets.map(t => {
        const stage = (state.stages.find(s => s.id === t.current_stage_id) || {}).name || `Stage #${t.current_stage_id}`;
        const isClosed = t.status === 'CLOSED';
        const stageBadge = `<span class="badge-stage" style="font-size: 10px; padding: 1px 6px;">Stage #${t.current_stage_id}: ${escapeHtml(stage)}</span>`;
        const plateBadge = renderPlateBadge(t.vehicle_no);

        const partsCount = (t.parts || []).length;
        const partsText = partsCount > 0
          ? `<span style="font-weight: 600; color: #1e40af;">${partsCount} item${partsCount === 1 ? '' : 's'}</span>`
          : (t.damaged_parts ? `<span style="color: #64748b; font-size: 10.5px;">Custom scope</span>` : '<span style="color: #94a3b8;">None</span>');

        return `
                  <tr>
                    <td>
                      <a href="javascript:void(0)" class="btn-open-veh-ticket" data-id="${t.id}" style="font-family: var(--font-mono); font-weight: 700; color: #1d4ed8; text-decoration: none;">
                        #${escapeHtml(t.ticket_number)}
                      </a>
                    </td>
                    <td style="color: #64748b; font-size: 11px;">${formatDate(t.arrival_date)}</td>
                    <td>${plateBadge}</td>
                    <td>
                      <div style="font-weight: 600; color: #0f172a;">${escapeHtml(t.customer_name || 'Customer')}</div>
                      ${t.customer_phone ? `<div style="font-size: 10.5px; font-family: var(--font-mono); color: #64748b;">${escapeHtml(t.customer_phone)}</div>` : ''}
                    </td>
                    <td style="color: #475569; font-size: 11px;">${escapeHtml(t.outlet_name || 'Honda Bodyshop')}</td>
                    <td>${stageBadge}</td>
                    <td style="font-family: var(--font-mono); font-weight: 700; color: #0f172a;">
                      ₹${Number(t.estimated_cost || 0).toLocaleString('en-IN')}
                    </td>
                    <td>${partsText}</td>
                    <td style="text-align: right;">
                      <button type="button" class="btn btn-xs btn-outline btn-open-veh-ticket" data-id="${t.id}">
                        View &rarr;
                      </button>
                    </td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      historyHtml = `
        <div style="text-align: center; padding: 48px 20px; color: #64748b;">
          <div style="font-weight: 600; font-size: 13px; color: #334155;">No Workshop Visits Recorded</div>
          <p style="font-size: 11.5px; margin-top: 4px;">Service visits and repairs for this model will appear here.</p>
        </div>
      `;
    }

    // 4. Compact Consumed Parts Table HTML
    let partsSummaryHtml = '';
    if (d.parts_summary && d.parts_summary.length > 0) {
      partsSummaryHtml = `
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
          <table class="compact-data-table">
            <thead>
              <tr>
                <th>Part Name / Description</th>
                <th style="width: 140px;">SKU / OEM Code</th>
                <th style="width: 140px; text-align: center;">Total Units Installed</th>
                <th style="width: 120px;">Unit Cost</th>
                <th style="width: 130px;">Total Spend</th>
              </tr>
            </thead>
            <tbody>
              ${d.parts_summary.map(item => `
                <tr>
                  <td style="font-weight: 600; color: #0f172a;">${escapeHtml(item.part_name)}</td>
                  <td style="font-family: var(--font-mono); color: #64748b;">${escapeHtml(item.part_code || '—')}</td>
                  <td style="font-family: var(--font-mono); font-weight: 700; text-align: center; color: #1d4ed8;">${item.total_qty} units</td>
                  <td style="font-family: var(--font-mono);">₹${Number(item.unit_cost || 0).toLocaleString('en-IN')}</td>
                  <td style="font-family: var(--font-mono); font-weight: 800; color: #0f172a;">₹${Number(item.total_cost || 0).toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      partsSummaryHtml = `
        <div style="text-align: center; padding: 48px 20px; color: #64748b;">
          <div style="font-weight: 600; font-size: 13px; color: #334155;">No Replacement Parts Consumed</div>
          <p style="font-size: 11.5px; margin-top: 4px;">Parts installed during repair tickets will be aggregated here.</p>
        </div>
      `;
    }

    // 5. Assemble Minimalist Dossier Layout
    dossier.innerHTML = `
      <div class="veh-dossier-wrap">
        <!-- Hero Cockpit Header -->
        <div class="veh-cockpit-header">
          <div class="veh-hero-info">
            <div class="veh-brand-icon">${initials}</div>
            <div class="veh-hero-titles">
              <h2>
                ${escapeHtml(d.name)}
                <span class="veh-category-tag">${escapeHtml(d.category || 'Vehicle')}</span>
              </h2>
            </div>
          </div>
          <div class="veh-hero-actions">
            <button type="button" class="btn btn-outline btn-compact" id="btnEditVehicleModelDossier" title="Edit Model Info">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Edit Model
            </button>
            <button type="button" class="btn btn-outline-danger btn-compact" id="btnDeleteVehicleModelDossier" title="Delete Vehicle Model">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete Model
            </button>
            <button type="button" class="btn btn-primary btn-compact" id="btnRegisterUnitForModel">
              + Register Unit
            </button>
          </div>
        </div>

        <!-- High-Density Metric Ribbon -->
        <div class="veh-stat-ribbon">
          <div class="veh-stat-item">
            <span>Fleet:</span> <strong>${d.fleet_count} Registered Units</strong>
          </div>
          <span class="veh-stat-sep">&bull;</span>
          <div class="veh-stat-item">
            <span>Status:</span>
            ${d.active_in_workshop > 0
        ? `<span class="veh-workshop-chip active"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align: -1px; margin-right: 3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>${d.active_in_workshop} Active in Workshop</span>`
        : `<span class="veh-workshop-chip idle"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>All ${d.fleet_count} Ready / Idle</span>`}
          </div>
          <span class="veh-stat-sep">&bull;</span>
          <div class="veh-stat-item">
            <span>Lifetime Visits:</span> <strong>${d.total_tickets || 0} Visits</strong>
          </div>
          <span class="veh-stat-sep">&bull;</span>
          <div class="veh-stat-item">
            <span>Total Repair Spend:</span> <strong>₹${Number(d.total_spend || 0).toLocaleString('en-IN')}</strong>
          </div>
        </div>

        <!-- Segmented Tab Navigation -->
        <div class="veh-tabs-nav">
          <button type="button" class="veh-tab-btn active" data-tab="units">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0m10 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0"></path><path d="M5 17H3v-4l2-5h9l4 5h1a2 2 0 0 1 2 2v2h-2m-4 0H9"></path></svg>
            <span>Registered Units & Drivers</span>
            <span class="veh-tab-counter">${unitList.length}</span>
          </button>
          <button type="button" class="veh-tab-btn" data-tab="history">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            <span>Service History</span>
            <span class="veh-tab-counter">${(d.tickets || []).length}</span>
          </button>
          <button type="button" class="veh-tab-btn" data-tab="parts">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
            <span>Consumed Parts</span>
            <span class="veh-tab-counter">${(d.parts_summary || []).length}</span>
          </button>
        </div>

        <!-- Tab 1: Units & Drivers -->
        <div class="veh-tab-pane active" data-pane="units">
          ${unitsHtml}
        </div>

        <!-- Tab 2: Service History -->
        <div class="veh-tab-pane" data-pane="history">
          ${historyHtml}
        </div>

        <!-- Tab 3: Consumed Parts -->
        <div class="veh-tab-pane" data-pane="parts">
          ${partsSummaryHtml}
        </div>
      </div>
    `;

    // Tab switcher events
    dossier.querySelectorAll('.veh-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        dossier.querySelectorAll('.veh-tab-btn').forEach(b => b.classList.remove('active'));
        dossier.querySelectorAll('.veh-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = dossier.querySelector(`.veh-tab-pane[data-pane="${target}"]`);
        if (pane) pane.classList.add('active');
      });
    });

    // Register unit modal listener
    const btnRegUnit = document.getElementById('btnRegisterUnitForModel');
    if (btnRegUnit) {
      btnRegUnit.addEventListener('click', () => {
        const modal = document.getElementById('modalRegisterVehicleMaster');
        if (!modal) return;
        const form = document.getElementById('formRegisterVehicleMaster');
        if (form) form.reset();
        const inpModel = document.getElementById('regVehModel');
        if (inpModel) inpModel.value = d.name;
        const selCust = document.getElementById('regVehCustomerSelect');
        if (selCust) {
          selCust.innerHTML = '<option value="">-- Select Registered Customer --</option>';
          (state.customers || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} (${c.primary_phone})`;
            selCust.appendChild(opt);
          });
        }
        modal.style.display = 'flex';
      });
    }

    const btnEditModel = document.getElementById('btnEditVehicleModelDossier');
    if (btnEditModel) {
      btnEditModel.addEventListener('click', () => openEditVehicleModelModal(d));
    }

    const btnDelModel = document.getElementById('btnDeleteVehicleModelDossier');
    if (btnDelModel) {
      btnDelModel.addEventListener('click', () => deleteVehicleModel(d.key, d.name));
    }

    // Unit card buttons
    dossier.querySelectorAll('.btn-edit-unit').forEach(btn => {
      btn.addEventListener('click', () => {
        const vId = parseInt(btn.dataset.vehId);
        if (vId) openEditVehicleById(vId);
      });
    });

    dossier.querySelectorAll('.btn-del-unit').forEach(btn => {
      btn.addEventListener('click', () => {
        const vId = parseInt(btn.dataset.vehId);
        const plate = btn.dataset.vehPlate || '';
        if (vId) deleteVehicle(vId, plate);
      });
    });

    dossier.querySelectorAll('.btn-intake-unit').forEach(btn => {
      btn.addEventListener('click', () => {
        openNewTicketModal();
        setTimeout(() => {
          const inpCust = document.getElementById('newCustomerName');
          const inpPhone = document.getElementById('newCustomerPhone');
          const inpModel = document.getElementById('newVehicleName');
          const inpPlate = document.getElementById('newVehicleNo');
          const inpColor = document.getElementById('newColor');
          const inpVin = document.getElementById('newChassisNo');

          if (inpCust && btn.dataset.custName) inpCust.value = btn.dataset.custName;
          if (inpPhone && btn.dataset.custPhone) inpPhone.value = btn.dataset.custPhone;
          if (inpModel && btn.dataset.vehModel) inpModel.value = btn.dataset.vehModel;
          if (inpPlate && btn.dataset.vehNo) inpPlate.value = btn.dataset.vehNo;
          if (inpColor && btn.dataset.vehColor) inpColor.value = btn.dataset.vehColor;
          if (inpVin && btn.dataset.vehVin) inpVin.value = btn.dataset.vehVin;
        }, 80);
      });
    });

    // Owner link
    dossier.querySelectorAll('.btn-view-veh-owner').forEach(btn => {
      btn.addEventListener('click', () => {
        const cId = parseInt(btn.dataset.custId);
        if (cId) {
          switchMainView('customers');
          selectCustomer(cId);
        }
      });
    });

    // Ticket links
    dossier.querySelectorAll('.btn-open-veh-ticket').forEach(btn => {
      btn.addEventListener('click', () => {
        const tId = parseInt(btn.dataset.id);
        if (tId) openTicketDetailPage(tId);
      });
    });

  } catch (err) {
    dossier.innerHTML = `<div style="padding: 30px; color: #dc2626; text-align: center;">Error: ${err.message}</div>`;
  }
}

async function selectVehicle(vehicleId) {
  try {
    const res = await fetch(`/api/vehicles/${vehicleId}`);
    if (res.ok) {
      const veh = await res.json();
      const raw = (veh.model || veh.vehicle_name || '').toUpperCase().trim();
      let famKey = 'other';
      if (raw.includes('ACTIVA')) famKey = 'honda-activa';
      else if (raw.includes('DIO')) famKey = 'honda-dio';
      else if (raw.includes('UNICORN')) famKey = 'honda-unicorn';
      else if (raw.includes('SHINE')) famKey = 'honda-shine';
      else if (raw.includes('SP125') || raw.includes('SP 125')) famKey = 'honda-sp125';
      else if (raw.includes('CB350') || raw.includes('HNESS')) famKey = 'honda-cb350';
      else if (raw.includes('CITY')) famKey = 'honda-city';
      else if (raw.includes('ELEVATE')) famKey = 'honda-elevate';
      else if (raw.includes('CD 110') || raw.includes('CD110')) famKey = 'honda-cd110';
      else famKey = (veh.model || veh.vehicle_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

      await selectVehicleModel(famKey);
      return;
    }
  } catch (e) { }
}

function openEditVehicleModal(veh) {
  const modal = document.getElementById('modalEditVehicleMaster');
  if (!modal) return;

  const inpId = document.getElementById('editVehId');
  const selCust = document.getElementById('editVehCustomerSelect');
  const inpModel = document.getElementById('editVehModel');
  const inpColor = document.getElementById('editVehColor');
  const inpPlate = document.getElementById('editVehPlate');
  const inpVin = document.getElementById('editVehVin');

  if (inpId) inpId.value = veh.id;
  if (inpModel) inpModel.value = veh.model || veh.vehicle_name || '';
  if (inpColor) inpColor.value = veh.color || '';
  if (inpPlate) inpPlate.value = veh.vehicle_no || '';
  if (inpVin) inpVin.value = veh.chassis_no || '';

  // Populate customers
  if (selCust) {
    selCust.innerHTML = '<option value="">-- No Customer Assigned --</option>';
    (state.customers || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.primary_phone})`;
      if (c.id === veh.customer_id) opt.selected = true;
      selCust.appendChild(opt);
    });
  }

  modal.style.display = 'flex';
}

// ====================================================
// PARTS & INVENTORY DIRECTORY CONTROLLER
// ====================================================
async function loadAndRenderParts() {
  try {
    const res = await fetch('/api/parts');
    if (!res.ok) throw new Error('Failed to fetch parts catalog');
    const parts = await res.json();
    state.parts = parts;

    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    parts.forEach(p => {
      if (p.stock_qty <= 0) outOfStockCount++;
      else if (p.stock_qty <= 3) lowStockCount++;
      else inStockCount++;
    });

    const statTotal = document.getElementById('partsStatTotal');
    const statInStock = document.getElementById('partsStatInStock');
    const statLow = document.getElementById('partsStatLow');
    const statOut = document.getElementById('partsStatOut');
    const bParts = document.getElementById('badgePartsCount');

    if (statTotal) statTotal.textContent = parts.length.toLocaleString();
    if (statInStock) statInStock.textContent = inStockCount.toLocaleString();
    if (statLow) statLow.textContent = lowStockCount.toLocaleString();
    if (statOut) statOut.textContent = outOfStockCount.toLocaleString();
    if (bParts) bParts.textContent = parts.length.toLocaleString();

    state.partsDisplayLimit = 100;
    filterPartsList();

    // Auto-select part
    if (parts.length > 0) {
      if (!state.selectedPartId || !parts.some(p => p.id === state.selectedPartId)) {
        selectPart(parts[0].id);
      } else {
        selectPart(state.selectedPartId);
      }
    } else {
      const dossier = document.getElementById('partDetailDossier');
      if (dossier) {
        dossier.innerHTML = `
          <div class="hub-empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            </svg>
            <p>No parts found in stock repository.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    showToast('Failed to load parts: ' + err.message, 'error');
  }
}

function filterPartsList(keepLimit = false) {
  if (!keepLimit) {
    state.partsDisplayLimit = 100;
    state.partsTablePage = 1;
  }

  const searchInput = document.getElementById('partsSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const filter = state.partsFilter || 'all';

  let filtered = state.parts || [];

  if (filter === 'in_stock') {
    filtered = filtered.filter(p => p.stock_qty > 3);
  } else if (filter === 'low_stock') {
    filtered = filtered.filter(p => p.stock_qty > 0 && p.stock_qty <= 3);
  } else if (filter === 'out_of_stock') {
    filtered = filtered.filter(p => p.stock_qty <= 0);
  }

  if (query) {
    filtered = filtered.filter(p =>
      (p.part_name || '').toLowerCase().includes(query) ||
      (p.part_code || '').toLowerCase().includes(query) ||
      (p.locators || '').toLowerCase().includes(query)
    );
  }

  state.lastFilteredParts = filtered;
  renderPartsMasterList(filtered);
}

function renderPartsMasterList(parts) {
  const limit = state.partsDisplayLimit || 100;
  const visibleParts = parts.slice(0, limit);
  const totalCount = parts.length;
  const hasMore = totalCount > visibleParts.length;

  renderPartsCards(visibleParts, totalCount, hasMore);
  renderPartsDetailsTable(parts);

  // Sync view visibility based on state.partsViewMode
  const mode = state.partsViewMode || 'cards';
  const contCards = document.getElementById('partsCardsContainer');
  const contTable = document.getElementById('partsTableContainer');
  const btnCards = document.getElementById('btnPartsViewCards');
  const btnTable = document.getElementById('btnPartsViewTable');

  if (mode === 'table') {
    if (contCards) contCards.style.display = 'none';
    if (contTable) contTable.style.display = 'block';
    if (btnCards) btnCards.classList.remove('active');
    if (btnTable) btnTable.classList.add('active');
  } else {
    if (contCards) contCards.style.display = 'grid';
    if (contTable) contTable.style.display = 'none';
    if (btnCards) btnCards.classList.add('active');
    if (btnTable) btnTable.classList.remove('active');
  }
}

function renderPartsCards(parts, totalCount = parts.length, hasMore = false) {
  const container = document.getElementById('partsCardsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!parts || parts.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-subtle); padding: 48px; font-size: 13px;">
        No parts match criteria.
      </div>
    `;
    return;
  }

  parts.forEach(p => {
    const card = document.createElement('div');
    card.className = `part-card ${p.id === state.selectedPartId ? 'active' : ''}`;
    card.dataset.id = p.id;

    let stockBadge = '';
    if (p.stock_qty <= 0) {
      stockBadge = `<span class="stock-badge stock-badge-out">Out of Stock</span>`;
    } else if (p.stock_qty <= 3) {
      stockBadge = `<span class="stock-badge stock-badge-low">Low: ${p.stock_qty} left</span>`;
    } else {
      stockBadge = `<span class="stock-badge stock-badge-in">${p.stock_qty} In Stock</span>`;
    }

    let locHtml = '';
    if (p.locators) {
      const locs = p.locators.split(',').map(s => s.trim()).filter(Boolean);
      locHtml = `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">` +
        locs.slice(0, 3).map((l, i) => `<span class="locator-pill ${i === 0 ? 'primary' : ''}">📍 ${escapeHtml(l)}</span>`).join('') +
        (locs.length > 3 ? `<span class="locator-pill">+${locs.length - 3}</span>` : '') +
        `</div>`;
    }

    let priceDisp = `₹${Number(p.default_cost || 0).toLocaleString('en-IN')}`;
    if (p.price_variants && Array.isArray(p.price_variants) && p.price_variants.length > 1) {
      const prices = p.price_variants.map(v => v.price).filter(pr => pr > 0);
      if (prices.length > 1) {
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        if (minP !== maxP) {
          priceDisp = `₹${minP.toLocaleString('en-IN')} – ₹${maxP.toLocaleString('en-IN')}`;
        }
      }
    }

    const batchCount = p.entry_count || (p.price_variants ? p.price_variants.length : 1);

    card.innerHTML = `
      <div class="part-card-top">
        <div class="part-card-title-wrap">
          <h4 class="part-card-title">${escapeHtml(p.part_name)}</h4>
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
            ${p.part_code ? `<span class="part-card-sku">SKU: ${escapeHtml(p.part_code)}</span>` : '<span style="font-size:10.5px;color:#94a3b8;">No SKU</span>'}
            ${batchCount > 1 ? `<span class="batch-count-badge" title="${batchCount} physical stock entries">${batchCount} batches</span>` : ''}
          </div>
          ${locHtml}
        </div>
        ${stockBadge}
      </div>

      <div class="part-card-metrics">
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Unit Cost</div>
          <div class="part-card-cost" style="font-size: 13px;">${priceDisp}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Orders</div>
          <div class="part-card-orders-count"><strong>${p.total_ordered || 0}</strong> times</div>
        </div>
      </div>

      <div class="part-card-actions">
        <div class="part-card-stock-stepper">
          <span style="font-size: 10.5px; color: #64748b; margin-right: 2px;">Stock:</span>
          <button type="button" class="btn-stepper btn-quick-stock" data-id="${p.id}" data-delta="-1" title="Decrement Stock" ${p.stock_qty <= 0 ? 'disabled' : ''}>-</button>
          <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700; min-width: 20px; text-align: center;">${p.stock_qty}</span>
          <button type="button" class="btn-stepper btn-quick-stock" data-id="${p.id}" data-delta="1" title="Increment Stock">+</button>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button type="button" class="btn btn-xs btn-outline btn-open-part-details" data-id="${p.id}" title="View batches & consumption">
            Details
          </button>
          <button type="button" class="btn btn-xs btn-outline btn-edit-part" data-id="${p.id}" title="Edit Part">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger btn-del-part" data-id="${p.id}" data-name="${escapeHtml(p.part_name)}" title="Delete Part">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectPart(p.id);
    });

    container.appendChild(card);
  });

  // Attach card event listeners
  container.querySelectorAll('.btn-quick-stock').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      const delta = parseInt(btn.dataset.delta) || 0;
      await quickAdjustPartStock(pId, delta);
    });
  });

  container.querySelectorAll('.btn-open-part-details').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      if (pId) openPartDetailsModal(pId);
    });
  });

  container.querySelectorAll('.btn-edit-part').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      if (pId) openEditPartById(pId);
    });
  });

  container.querySelectorAll('.btn-del-part').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      const pName = btn.dataset.name || '';
      if (pId) deletePart(pId, pName);
    });
  });

  if (hasMore) {
    const loadMoreRow = document.createElement('div');
    loadMoreRow.className = 'parts-load-more-card';
    loadMoreRow.style.cssText = 'grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 18px; margin-top: 10px;';
    loadMoreRow.innerHTML = `
      <span style="font-size: 12.5px; color: #475569; font-weight: 500;">
        Showing <strong>${parts.length.toLocaleString()}</strong> of <strong>${totalCount.toLocaleString()}</strong> matching parts
      </span>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="btn btn-sm btn-primary" id="btnLoadMoreParts">Load 100 More</button>
        <button type="button" class="btn btn-sm btn-outline" id="btnLoadAllParts">Show All (${totalCount.toLocaleString()})</button>
      </div>
    `;
    container.appendChild(loadMoreRow);

    loadMoreRow.querySelector('#btnLoadMoreParts').addEventListener('click', () => {
      state.partsDisplayLimit = (state.partsDisplayLimit || 100) + 100;
      renderPartsMasterList(state.lastFilteredParts || state.parts);
    });
    loadMoreRow.querySelector('#btnLoadAllParts').addEventListener('click', () => {
      state.partsDisplayLimit = 999999;
      renderPartsMasterList(state.lastFilteredParts || state.parts);
    });
  }
}

function renderPartsDetailsTable(parts) {
  const tbody = document.getElementById('partsDetailsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const allParts = Array.isArray(parts) ? parts : [];

  const pagination = renderPaginationControls({
    infoElId: 'partsTablePaginationInfo',
    numbersElId: 'partsTablePageNumbers',
    prevBtnId: 'btnPartsTablePrevPage',
    nextBtnId: 'btnPartsTableNextPage',
    sizeSelectId: 'partsTablePageSize',
    totalItems: allParts.length,
    currentPage: state.partsTablePage || 1,
    pageSize: state.partsTablePageSize || '25',
    itemLabel: 'parts',
    onPageChange: (newPage) => {
      state.partsTablePage = newPage;
      renderPartsDetailsTable(state.lastFilteredParts || state.parts);
    },
    onSizeChange: (newSize) => {
      state.partsTablePageSize = String(newSize);
      state.partsTablePage = 1;
      renderPartsDetailsTable(state.lastFilteredParts || state.parts);
    }
  });

  const pagedParts = pagination.pagedItems(allParts);

  if (!pagedParts || pagedParts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-subtle); padding: 36px;">
          No parts match criteria.
        </td>
      </tr>
    `;
    return;
  }

  pagedParts.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    if (p.id === state.selectedPartId) tr.classList.add('active');

    let stockBadge = '';
    if (p.stock_qty <= 0) {
      stockBadge = `<span class="stock-badge stock-badge-out" style="font-size: 10px; padding: 1px 6px;">Out of Stock</span>`;
    } else if (p.stock_qty <= 3) {
      stockBadge = `<span class="stock-badge stock-badge-low" style="font-size: 10px; padding: 1px 6px;">Low: ${p.stock_qty}</span>`;
    } else {
      stockBadge = `<span class="stock-badge stock-badge-in" style="font-size: 10px; padding: 1px 6px;">${p.stock_qty} in hand</span>`;
    }

    let locHtml = '<span style="color:#94a3b8; font-size:11px;">—</span>';
    if (p.locators) {
      const locs = p.locators.split(',').map(s => s.trim()).filter(Boolean);
      locHtml = locs.map((l, i) => `<span class="locator-pill ${i === 0 ? 'primary' : ''}">📍 ${escapeHtml(l)}</span>`).join(' ');
    }

    let priceDisp = `₹${Number(p.default_cost || 0).toLocaleString('en-IN')}`;
    if (p.price_variants && Array.isArray(p.price_variants) && p.price_variants.length > 1) {
      const prices = p.price_variants.map(v => v.price).filter(pr => pr > 0);
      if (prices.length > 1) {
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        if (minP !== maxP) {
          priceDisp = `₹${minP.toLocaleString('en-IN')} – ₹${maxP.toLocaleString('en-IN')}`;
        }
      }
    }

    const batchCount = p.entry_count || (p.price_variants ? p.price_variants.length : 1);

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: #0f172a;">
        ${escapeHtml(p.part_code || '—')}
      </td>
      <td>
        <div style="font-weight: 600; color: #0f172a; font-size: 12px;">${escapeHtml(p.part_name)}</div>
      </td>
      <td>
        <div style="display: flex; gap: 3px; flex-wrap: wrap; max-width: 220px;">
          ${locHtml}
        </div>
      </td>
      <td>${stockBadge}</td>
      <td style="font-family: var(--font-mono); font-weight: 600; font-size: 12px;">
        ${priceDisp}
      </td>
      <td style="text-align: center;">
        <button type="button" class="batch-count-badge btn-open-part-details" data-id="${p.id}" title="Click to view batches breakdown">
          ${batchCount} ${batchCount === 1 ? 'batch' : 'batches'}
        </button>
      </td>
      <td style="font-family: var(--font-mono); text-align: center; color: #64748b;">
        ${p.total_ordered || 0}
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <div style="display: inline-flex; align-items: center; gap: 4px;">
          <button type="button" class="btn btn-xs btn-outline btn-open-part-details" data-id="${p.id}">
            Details
          </button>
          <button type="button" class="btn btn-xs btn-outline btn-edit-part" data-id="${p.id}" title="Edit Part">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger btn-del-part" data-id="${p.id}" data-name="${escapeHtml(p.part_name)}" title="Delete Part">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectPart(p.id);
    });

    tbody.appendChild(tr);
  });

  // Attach table event listeners
  tbody.querySelectorAll('.btn-quick-stock').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      const delta = parseInt(btn.dataset.delta) || 0;
      await quickAdjustPartStock(pId, delta);
    });
  });

  tbody.querySelectorAll('.btn-open-part-details').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      if (pId) openPartDetailsModal(pId);
    });
  });

  tbody.querySelectorAll('.btn-edit-part').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      if (pId) openEditPartById(pId);
    });
  });

  tbody.querySelectorAll('.btn-del-part').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = parseInt(btn.dataset.id);
      const pName = btn.dataset.name || '';
      if (pId) deletePart(pId, pName);
    });
  });
}

/**
 * Export filtered parts catalog to CSV
 */
function exportPartsToCsv() {
  const parts = state.lastFilteredParts || state.parts || [];
  if (parts.length === 0) {
    showToast('No parts available to export for current filters', 'info');
    return;
  }

  const headers = [
    'Part # / SKU',
    'Part Description',
    'Locators / Racks',
    'Stock Qty',
    'Stock Status',
    'Unit Cost (₹)',
    'Batches Count',
    'Total Ordered Times',
    'Pending Ordered'
  ];

  function escapeCsv(val) {
    if (val == null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = parts.map(p => {
    let stockStatus = 'In Stock';
    if (p.stock_qty <= 0) stockStatus = 'Out of Stock';
    else if (p.stock_qty <= 3) stockStatus = 'Low Stock';

    const batchCount = p.entry_count || (p.price_variants ? p.price_variants.length : 1);

    return [
      p.part_code || '',
      p.part_name || '',
      p.locators || '',
      p.stock_qty != null ? p.stock_qty : 0,
      stockStatus,
      p.default_cost != null ? p.default_cost : 0,
      batchCount,
      p.total_ordered || 0,
      p.pending_ordered || 0
    ].map(escapeCsv).join(',');
  });

  const csvContent = '\uFEFF' + [
    headers.map(escapeCsv).join(','),
    ...rows
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filterPart = state.partsFilter && state.partsFilter !== 'all' ? `_${state.partsFilter}` : '';
  a.href = url;
  a.download = `Honda_Parts_Inventory_${dateStr}${filterPart}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`✓ Successfully exported ${parts.length.toLocaleString()} parts to CSV`, 'success');
}

async function selectPart(partId) {
  state.selectedPartId = partId;

  document.querySelectorAll('#partsCardsContainer .part-card').forEach(card => {
    card.classList.toggle('active', parseInt(card.dataset.id) === partId);
  });
  document.querySelectorAll('#partsDetailsTableBody tr').forEach(tr => {
    tr.classList.toggle('active', parseInt(tr.dataset.id) === partId);
  });
}

// Open Part Details Modal (Usage History & Physical Stock Batches)
async function openPartDetailsModal(partId) {
  const modal = document.getElementById('modalPartDetailsCompact');
  if (!modal) return;

  const header = document.getElementById('partDetailsCompactHeader');
  const tbodyCons = document.getElementById('partDetailsConsumptionBody');
  const tbodyBatches = document.getElementById('partDetailsBatchesBody');
  const countBatches = document.getElementById('partStockBatchesCount');
  const countCons = document.getElementById('partConsumptionCount');
  const actions = document.getElementById('partDetailsCompactActions');
  const title = document.getElementById('partDetailsCompactTitle');

  const tabBatches = document.getElementById('tabPartStockBatches');
  const tabCons = document.getElementById('tabPartConsumptionHistory');
  const secBatches = document.getElementById('sectionPartStockBatches');
  const secCons = document.getElementById('sectionPartConsumptionHistory');

  if (tabBatches && tabCons && secBatches && secCons) {
    tabBatches.onclick = () => {
      tabBatches.classList.add('active');
      tabCons.classList.remove('active');
      secBatches.style.display = 'block';
      secCons.style.display = 'none';
    };
    tabCons.onclick = () => {
      tabCons.classList.add('active');
      tabBatches.classList.remove('active');
      secCons.style.display = 'block';
      secBatches.style.display = 'none';
    };
    // Default to batches tab
    tabBatches.classList.add('active');
    tabCons.classList.remove('active');
    secBatches.style.display = 'block';
    secCons.style.display = 'none';
  }

  if (header) header.innerHTML = '<div style="color: #64748b; font-size: 12px;">Loading part specifications...</div>';
  if (tbodyBatches) tbodyBatches.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">Loading physical stock batches...</td></tr>';
  if (tbodyCons) tbodyCons.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">Loading consumption history...</td></tr>';
  if (actions) actions.innerHTML = '';

  modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/parts/${partId}`);
    if (!res.ok) throw new Error('Part not found');
    const part = await res.json();

    if (title) title.textContent = `${part.part_name || 'Part'} (${part.part_code || 'No SKU'})`;

    let stockBadge = '';
    if (part.stock_qty <= 0) {
      stockBadge = `<span class="stock-badge stock-badge-out">Out of Stock</span>`;
    } else if (part.stock_qty <= 3) {
      stockBadge = `<span class="stock-badge stock-badge-low">Low: ${part.stock_qty} left</span>`;
    } else {
      stockBadge = `<span class="stock-badge stock-badge-in">${part.stock_qty} In Stock</span>`;
    }

    let locText = part.locators ? `📍 Locators: ${part.locators}` : 'No Locators Assigned';

    if (header) {
      header.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 15px; color: #0f172a;">${escapeHtml(part.part_name)}</strong>
            ${stockBadge}
          </div>
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px; font-size: 11.5px; color: #64748b; flex-wrap: wrap;">
            <span>Part #: <strong style="font-family: var(--font-mono); color: #0f172a;">${escapeHtml(part.part_code || '—')}</strong></span>
            <span>&bull;</span>
            <span style="color: #0284c7; font-weight: 600;">${escapeHtml(locText)}</span>
            <span>&bull;</span>
            <span>Default Price: <strong style="font-family: var(--font-mono); color: #047857;">₹${Number(part.default_cost || 0).toLocaleString('en-IN')}</strong></span>
            <span>&bull;</span>
            <span>Total Stock: <strong>${part.stock_qty} units</strong></span>
          </div>
        </div>
      `;
    }

    // Populate Batches
    const batches = part.batches || [];
    if (countBatches) countBatches.textContent = batches.length;
    if (tbodyBatches) {
      if (batches.length > 0) {
        tbodyBatches.innerHTML = batches.map(b => `
          <tr>
            <td style="font-family: var(--font-mono); font-size: 11px; font-weight: 600;">${escapeHtml(b.part_number)}</td>
            <td style="font-size: 11.5px;">${escapeHtml(b.description || '—')}</td>
            <td style="text-align: center; font-family: var(--font-mono); font-weight: 700; color: ${b.quantity > 0 ? '#047857' : '#94a3b8'};">${b.quantity}</td>
            <td style="font-family: var(--font-mono); font-weight: 600;">₹${Number(b.unit_price || 0).toLocaleString('en-IN')}</td>
            <td><span class="locator-pill primary">📍 ${escapeHtml(b.locator_1 || '—')}</span></td>
            <td>${b.locator_2 ? `<span class="locator-pill">📍 ${escapeHtml(b.locator_2)}</span>` : '<span style="color:#cbd5e1;">—</span>'}</td>
            <td style="text-align: center;">
              <span class="stock-badge ${b.quantity > 0 ? 'stock-badge-in' : 'stock-badge-out'}" style="font-size: 9.5px; padding: 1px 5px;">
                ${escapeHtml(b.availability || (b.quantity > 0 ? 'In Stock' : '0 Qty'))}
              </span>
            </td>
          </tr>
        `).join('');
      } else {
        tbodyBatches.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px; font-size: 12px;">
              No physical stock batches recorded for this part number.
            </td>
          </tr>
        `;
      }
    }

    // Populate Consumption History
    const usage = part.usage_history || [];
    if (countCons) countCons.textContent = usage.length;
    if (tbodyCons) {
      if (usage.length > 0) {
        tbodyCons.innerHTML = usage.map(u => `
          <tr>
            <td style="font-weight: 700; font-family: var(--font-mono);">
              <a href="javascript:void(0)" class="btn-jump-ticket" data-id="${u.ticket_id}" style="color: #1d4ed8; text-decoration: none;">
                #${escapeHtml(u.ticket_number)}
              </a>
            </td>
            <td>
              <div style="font-weight: 600; font-size: 12px;">${escapeHtml(u.customer_name || '—')}</div>
              <div style="font-size: 11px; color: #64748b;">${escapeHtml(u.vehicle_no || '')} ${escapeHtml(u.model || '')}</div>
            </td>
            <td style="text-align: center; font-family: var(--font-mono); font-weight: 700;">${u.quantity}</td>
            <td style="font-family: var(--font-mono);">₹${Number(u.unit_cost || 0).toLocaleString('en-IN')}</td>
            <td style="font-family: var(--font-mono); font-weight: 700;">₹${Number(u.total_cost || 0).toLocaleString('en-IN')}</td>
            <td>
              <span class="stock-badge ${u.part_status === 'ARRIVED' ? 'stock-badge-in' : 'stock-badge-low'}" style="font-size: 10px;">
                ${escapeHtml(u.part_status || 'ORDERED')}
              </span>
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn btn-xs btn-outline btn-jump-ticket" data-id="${u.ticket_id}">
                View &rarr;
              </button>
            </td>
          </tr>
        `).join('');

        tbodyCons.querySelectorAll('.btn-jump-ticket').forEach(link => {
          link.addEventListener('click', () => {
            modal.style.display = 'none';
            const tId = parseInt(link.dataset.id);
            if (tId) openTicketDetailPage(tId);
          });
        });
      } else {
        tbodyCons.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: #94a3b8; padding: 28px; font-size: 12px;">
              This part has not been billed to any service tickets yet.
            </td>
          </tr>
        `;
      }
    }
  } catch (err) {
    if (header) header.innerHTML = `<div style="color: #dc2626; font-size: 12px;">Error: ${err.message}</div>`;
  }
}

// Daily Physical Stock XLSX Synchronization Modal
function initStockSyncModal() {
  const btnOpen = document.getElementById('btnSyncPhysicalStock');
  const modal = document.getElementById('modalSyncStock');
  if (!btnOpen || !modal) return;

  const dropzone = document.getElementById('syncStockDropzone');
  const fileInput = document.getElementById('inputStockFile');
  const fileLabel = document.getElementById('selectedStockFileName');
  const btnUpload = document.getElementById('btnUploadStockFile');
  const progressWrap = document.getElementById('stockSyncProgress');
  const statusText = document.getElementById('stockSyncStatusText');
  const resultBox = document.getElementById('stockSyncResultBox');

  let currentFile = null;

  async function loadSummary() {
    try {
      const res = await fetch('/api/stock/summary');
      if (res.ok) {
        const data = await res.json();
        const statTotal = document.getElementById('syncStatTotalParts');
        const statInStock = document.getElementById('syncStatInStockParts');
        const statPieces = document.getElementById('syncStatTotalPieces');
        const lastUpdated = document.getElementById('syncLastUpdatedText');

        if (statTotal) statTotal.textContent = Number(data.stats?.total_parts || 0).toLocaleString();
        if (statInStock) statInStock.textContent = Number(data.stats?.in_stock_parts || 0).toLocaleString();
        if (statPieces) statPieces.textContent = Number(data.stats?.total_pieces || 0).toLocaleString();
        if (lastUpdated) {
          if (data.latestLog) {
            const d = new Date(data.latestLog.created_at);
            lastUpdated.textContent = `Last physical stock update: ${d.toLocaleString()} (${data.latestLog.filename || 'uploaded file'})`;
          } else {
            lastUpdated.textContent = 'No previous stock sync log recorded.';
          }
        }
      }
    } catch (e) {
      console.error('Failed to load stock summary:', e);
    }
  }

  btnOpen.addEventListener('click', () => {
    modal.style.display = 'flex';
    if (progressWrap) progressWrap.style.display = 'none';
    if (resultBox) resultBox.style.display = 'none';
    if (fileLabel) fileLabel.style.display = 'none';
    if (btnUpload) {
      btnUpload.style.display = 'none';
      btnUpload.disabled = false;
    }
    if (fileInput) fileInput.value = '';
    currentFile = null;
    loadSummary();
  });

  // Dropzone click & drag-drop
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleSelectedFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleSelectedFile(fileInput.files[0]);
      }
    });
  }

  function handleSelectedFile(file) {
    if (!file.name.endsWith('.xlsx')) {
      showToast('Please select a valid .xlsx Excel workbook', 'warning');
      return;
    }
    currentFile = file;
    if (fileLabel) {
      fileLabel.textContent = `📄 Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
      fileLabel.style.display = 'inline-block';
    }
    if (btnUpload) btnUpload.style.display = 'inline-block';
  }

  if (btnUpload) {
    btnUpload.addEventListener('click', async () => {
      if (!currentFile) return;
      btnUpload.disabled = true;
      if (progressWrap) progressWrap.style.display = 'block';
      if (statusText) statusText.textContent = `Uploading and ingesting ${currentFile.name}...`;
      if (resultBox) resultBox.style.display = 'none';

      try {
        const buffer = await currentFile.arrayBuffer();
        const res = await fetch(`/api/stock/upload-xlsx?filename=${encodeURIComponent(currentFile.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        if (progressWrap) progressWrap.style.display = 'none';
        if (resultBox) {
          resultBox.style.display = 'block';
          const s = data.stats;
          resultBox.innerHTML = `
            <div style="font-weight: 700; font-size: 13.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; color: #166534;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Uploaded Physical Stock Processed!</span>
            </div>
            <div class="sync-result-grid">
              <div class="sync-result-card">
                <div class="kpi-val">${Number(s.totalRows).toLocaleString()}</div>
                <div class="kpi-lbl">Total Lines</div>
              </div>
              <div class="sync-result-card">
                <div class="kpi-val">${Number(s.uniqueParts).toLocaleString()}</div>
                <div class="kpi-lbl">Unique Parts</div>
              </div>
              <div class="sync-result-card">
                <div class="kpi-val">${Number(s.inStockParts).toLocaleString()}</div>
                <div class="kpi-lbl">In-Stock SKUs</div>
              </div>
              <div class="sync-result-card">
                <div class="kpi-val">${Number(s.totalQuantity).toLocaleString()}</div>
                <div class="kpi-lbl">Total Pieces</div>
              </div>
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 8px; text-align: right;">
              Execution time: ${(s.durationMs / 1000).toFixed(2)}s (${s.syncMode})
            </div>
          `;
        }
        showToast(`✓ Ingested ${data.stats.totalRows.toLocaleString()} stock entries from ${currentFile.name}`, 'success');
        loadSummary();
        await loadAndRenderParts();
        loadDirectoryCounts();
      } catch (err) {
        if (progressWrap) progressWrap.style.display = 'none';
        showToast('Upload error: ' + err.message, 'error');
      } finally {
        btnUpload.disabled = false;
      }
    });
  }
}

async function quickAdjustPartStock(partId, delta) {
  const part = (state.parts || []).find(p => p.id === partId);
  if (!part) return;

  const newQty = Math.max(0, (part.stock_qty || 0) + delta);
  try {
    const res = await fetch(`/api/parts/${partId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_qty: newQty })
    });
    if (!res.ok) throw new Error('Failed to update stock');
    const updated = await res.json();
    part.stock_qty = updated.stock_qty;

    showToast(`Stock updated: ${updated.stock_qty} units`, 'success');
    filterPartsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}


function openEditPartModal(part) {
  const modal = document.getElementById('modalEditPartMaster');
  if (!modal) return;

  const inpId = document.getElementById('editPartId');
  const inpName = document.getElementById('editPartName');
  const inpCode = document.getElementById('editPartCode');
  const inpCost = document.getElementById('editPartDefaultCost');
  const inpQty = document.getElementById('editPartStockQty');

  if (inpId) inpId.value = part.id;
  if (inpName) inpName.value = part.part_name || '';
  if (inpCode) inpCode.value = part.part_code || '';
  if (inpCost) inpCost.value = part.default_cost || 0;
  if (inpQty) inpQty.value = part.stock_qty || 0;

  modal.style.display = 'flex';
}

// Parts Orders Pipeline Monitoring
async function loadAndRenderPartsOrders() {
  try {
    const res = await fetch('/api/parts-orders');
    if (!res.ok) throw new Error('Failed to fetch parts orders');
    const orders = await res.json();
    state.partsOrders = orders;

    let pendingCount = 0;
    let orderedCount = 0;
    let arrivedCount = 0;
    let iaCount = 0;
    let pcaCount = 0;
    let caCount = 0;
    let totalCost = 0;

    orders.forEach(o => {
      const isArrived = (o.part_status || '').toUpperCase() === 'ARRIVED';
      const isOrdered = (o.part_status || '').toUpperCase() === 'ORDERED' && Number(o.current_stage_id) >= 6;
      const isIa = o.insurance_approved === 1 || o.company_approved === 1;
      const custStatus = (o.customer_approval_status || '').toUpperCase();
      const isAfterApproval = Number(o.current_stage_id) > 5;

      if (isArrived) arrivedCount++;
      else if (isOrdered) orderedCount++;
      else pendingCount++;

      if (isIa) iaCount++;
      else if (isAfterApproval && custStatus === 'APPROVED') caCount++;
      else if (isAfterApproval && custStatus === 'PENDING') pcaCount++;

      totalCost += (Number(o.total_cost) || 0);
    });

    const kpiTotal = document.getElementById('kpiTotalPartsOrdered') || document.getElementById('kpiTotalPartsOrders');
    const kpiIa = document.getElementById('kpiInsuranceApprovedParts');
    const kpiPca = document.getElementById('kpiPcaParts');
    const kpiCa = document.getElementById('kpiCaParts');
    const kpiPending = document.getElementById('kpiPendingPartsOrders');
    const kpiArrived = document.getElementById('kpiArrivedPartsOrders');
    const kpiCost = document.getElementById('kpiTotalProcurementCost');
    const badgePending = document.getElementById('badgePendingOrdersCount');

    if (kpiTotal) kpiTotal.textContent = orders.length;
    if (kpiIa) kpiIa.textContent = iaCount;
    if (kpiPca) kpiPca.textContent = pcaCount;
    if (kpiCa) kpiCa.textContent = caCount;
    if (kpiPending) kpiPending.textContent = orderedCount;
    if (kpiArrived) kpiArrived.textContent = arrivedCount;
    if (kpiCost) kpiCost.textContent = `₹${totalCost.toLocaleString('en-IN')}`;
    if (badgePending) badgePending.textContent = orderedCount;

    filterPartsOrders();
  } catch (err) {
    showToast('Failed to load parts orders: ' + err.message, 'error');
  }
}

function filterPartsOrders() {
  const searchInput = document.getElementById('partsOrdersSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const filter = (state.partsOrdersFilter || 'all').toUpperCase();

  let filtered = state.partsOrders || [];

  if (filter === 'ORDERED' || filter === 'POD') {
    filtered = filtered.filter(o => (o.part_status || '').toUpperCase() === 'ORDERED' && Number(o.current_stage_id) >= 6);
  } else if (filter === 'ARRIVED') {
    filtered = filtered.filter(o => (o.part_status || '').toUpperCase() === 'ARRIVED');
  } else if (filter === 'PENDING' || filter === 'PENDING_ORDER') {
    filtered = filtered.filter(o => (o.part_status || '').toUpperCase() !== 'ARRIVED' && !((o.part_status || '').toUpperCase() === 'ORDERED' && Number(o.current_stage_id) >= 6));
  } else if (filter === 'PCA') {
    filtered = filtered.filter(o => {
      const isAfterApproval = Number(o.current_stage_id) > 5;
      const isIa = o.insurance_approved === 1 || o.company_approved === 1;
      const custStatus = (o.customer_approval_status || '').toUpperCase();
      return isAfterApproval && !isIa && custStatus === 'PENDING';
    });
  } else if (filter === 'CA') {
    filtered = filtered.filter(o => {
      const isAfterApproval = Number(o.current_stage_id) > 5;
      return isAfterApproval && (o.customer_approval_status || '').toUpperCase() === 'APPROVED';
    });
  } else if (filter === 'IA' || filter === 'INSURANCE_APPROVED') {
    filtered = filtered.filter(o => o.insurance_approved === 1 || o.company_approved === 1);
  }

  if (query) {
    filtered = filtered.filter(o =>
      (o.part_name || '').toLowerCase().includes(query) ||
      (o.part_code || '').toLowerCase().includes(query) ||
      (o.ticket_number || '').toLowerCase().includes(query) ||
      (o.customer_name || '').toLowerCase().includes(query) ||
      (o.vehicle_no || '').toLowerCase().includes(query)
    );
  }

  renderPartsOrdersTable(filtered);
}

function updatePartsBulkToolbar() {
  const selectedCbs = document.querySelectorAll('#partsOrdersTableBody .part-row-select:checked');
  const bulkWrap = document.getElementById('partsBulkActionsWrap');
  const countBadge = document.getElementById('partsSelectedCount');
  const thSelectAll = document.getElementById('thPartsSelectAll');

  const count = selectedCbs.length;
  if (countBadge) countBadge.textContent = count;

  if (bulkWrap) {
    bulkWrap.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  const allCbs = document.querySelectorAll('#partsOrdersTableBody .part-row-select');
  if (thSelectAll) {
    thSelectAll.checked = allCbs.length > 0 && selectedCbs.length === allCbs.length;
  }
}

function renderPartsOrdersTable(orders) {
  const tbody = document.getElementById('partsOrdersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const thSelectAll = document.getElementById('thPartsSelectAll');
  if (thSelectAll) thSelectAll.checked = false;
  updatePartsBulkToolbar();

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; color: var(--text-subtle); padding: 36px;">
          No parts orders found matching current filter.
        </td>
      </tr>
    `;
    return;
  }

  orders.forEach(o => {
    const tr = document.createElement('tr');

    const isArrived = (o.part_status || '').toUpperCase() === 'ARRIVED';
    const isOrdered = (o.part_status || '').toUpperCase() === 'ORDERED' && Number(o.current_stage_id) >= 6;
    const isHold = (o.part_status || '').toUpperCase() === 'ON_HOLD';
    const isIa = o.insurance_approved === 1 || o.company_approved === 1;
    const custStatus = (o.customer_approval_status || '').toUpperCase();
    const isOrderAfterApproval = Number(o.current_stage_id) > 5;
    const isExempt = (o.customer_approval_exempt === 1 || custStatus === 'EXEMPT') && isOrderAfterApproval;

    let approvalBadge = '';
    if (isIa) {
      approvalBadge = `<span class="tag-part-lifecycle tag-ia" onclick="openPartsApprovalModal(${o.ticket_id})" title="Insurance Approved">Insurance Approved</span>`;
    } else if (!isOrderAfterApproval) {
      approvalBadge = `<span class="tag-part-lifecycle" onclick="openPartsApprovalModal(${o.ticket_id})" style="background:#f8fafc; color:#64748b; border: 1px solid #cbd5e1;" title="Estimate / Awaiting Surveyor Approval">Awaiting Approval</span>`;
    } else if (custStatus === 'APPROVED') {
      approvalBadge = `<span class="tag-part-lifecycle tag-ca" onclick="openPartsApprovalModal(${o.ticket_id})" title="Customer Approved">Customer Approved</span>`;
    } else if (isExempt) {
      approvalBadge = `<span class="tag-part-lifecycle tag-exempt" onclick="openPartsApprovalModal(${o.ticket_id})" title="Workshop Exemption Active">Exempt</span>`;
    } else {
      approvalBadge = `<span class="tag-part-lifecycle tag-pca" onclick="openPartsApprovalModal(${o.ticket_id})" title="Pending Customer Approval">Pending Cust. (PCA)</span>`;
    }

    const statusBadge = isArrived
      ? `<span class="order-status-badge arrived"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Arrived</span>`
      : (isOrdered
        ? `<span class="order-status-badge ordered"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Awaiting Delivery</span>`
        : (isHold
          ? `<span class="order-status-badge on-hold">On Hold</span>`
          : `<span class="order-status-badge pending"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Pending Order</span>`));

    const dateDisplay = isArrived
      ? `<div style="font-size: 11px; color: #047857; font-weight: 600;">Arrived: ${formatDateTime(o.arrived_at)}</div>`
      : (isOrdered
        ? `<div style="font-size: 11px; color: #b45309; font-weight: 600;">Ordered: ${formatDate(o.parts_order_date || o.updated_at || o.created_at)}</div>`
        : `<div style="font-size: 11px; color: #64748b;">Estimated: ${formatDate(o.created_at)}</div>`);
    const actionBtn = isArrived
      ? `<button type="button" class="btn btn-outline btn-xs btn-toggle-order-status" data-id="${o.id}" data-target="ORDERED" title="Revert back to Ordered">
           Mark Pending
         </button>`
      : `<button type="button" class="btn btn-primary btn-xs btn-toggle-order-status" data-id="${o.id}" data-target="ARRIVED" title="Mark Part as Arrived">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Mark Arrived
         </button>`;

    const plateBadge = o.vehicle_no
      ? renderPlateBadge(o.vehicle_no)
      : `<span style="font-size: 10.5px; color: #94a3b8;">${escapeHtml(o.model || 'Honda')}</span>`;

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="part-row-select" data-id="${o.id}">
      </td>
      <td>
        <div style="font-weight: 700; color: #0f172a;">${escapeHtml(o.part_name)}</div>
        ${o.part_code ? `<div style="font-family: var(--font-mono); font-size: 10.5px; color: #64748b;">SKU: ${escapeHtml(o.part_code)}</div>` : ''}
      </td>
      <td>
        <a href="javascript:void(0)" class="btn-jump-ticket" data-id="${o.ticket_id}" style="font-weight: 700; font-family: var(--font-mono); color: #1d4ed8; text-decoration: none;">
          ${escapeHtml(o.ticket_number)} &rarr;
        </a>
      </td>
      <td>
        <div style="font-weight: 600; color: #334155;">${escapeHtml(o.customer_name || 'Customer')}</div>
        <div style="margin-top: 2px;">${plateBadge}</div>
      </td>
      <td style="font-family: var(--font-mono); font-weight: 700; text-align: center;">${o.quantity}</td>
      <td style="font-family: var(--font-mono);">₹${Number(o.unit_cost || 0).toLocaleString('en-IN')}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #0f172a;">₹${Number(o.total_cost || 0).toLocaleString('en-IN')}</td>
      <td>${approvalBadge}</td>
      <td>${statusBadge}</td>
      <td>${dateDisplay}</td>
      <td style="text-align: right; white-space: nowrap;">
        <div style="display: inline-flex; align-items: center; gap: 5px; justify-content: flex-end;">
          <button type="button" class="btn btn-outline btn-xs" onclick="openPartsApprovalModal(${o.ticket_id})" title="Manage approvals for ticket #${escapeHtml(o.ticket_number)}">
            Manage
          </button>
          ${actionBtn}
          <button type="button" class="btn btn-outline-danger btn-xs btn-del-part-order" data-id="${o.id}" data-name="${escapeHtml(o.part_name)}" data-ticket="${escapeHtml(o.ticket_number)}" title="Delete part order item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </td>
    `;

    // Row selection listener
    const cb = tr.querySelector('.part-row-select');
    if (cb) {
      cb.addEventListener('change', updatePartsBulkToolbar);
    }

    tbody.appendChild(tr);
  });

  // Action listeners
  tbody.querySelectorAll('.btn-toggle-order-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = parseInt(btn.dataset.id);
      const targetStatus = btn.dataset.target;
      await togglePartOrderStatus(orderId, targetStatus);
    });
  });

  tbody.querySelectorAll('.btn-del-part-order').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deletePartOrder(btn.dataset.id, btn.dataset.name, btn.dataset.ticket);
    });
  });

  tbody.querySelectorAll('.btn-jump-ticket').forEach(link => {
    link.addEventListener('click', () => {
      const ticketId = parseInt(link.dataset.id);
      if (ticketId) openTicketDetailPage(ticketId);
    });
  });
}

async function executePartsBulkAction(action) {
  const selectedCbs = document.querySelectorAll('#partsOrdersTableBody .part-row-select:checked');
  const partIds = Array.from(selectedCbs).map(cb => Number(cb.dataset.id)).filter(id => id > 0);
  if (partIds.length === 0) {
    showToast('No parts selected', 'warning');
    return;
  }

  const actionLabels = {
    CUSTOMER_APPROVE: 'Customer Approve',
    INSURANCE_APPROVE: 'Insurance Approve',
    MARK_ARRIVED: 'Mark as Arrived'
  };
  const label = actionLabels[action] || action;

  if (!await showConfirmDialog({
    title: `Bulk ${label}`,
    message: `Apply "${label}" to ${partIds.length} selected part items?`,
    confirmText: `Confirm ${label}`
  })) return;

  try {
    showGlobalLoader();
    const res = await fetch('/api/parts-orders/bulk-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partIds, action })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to execute bulk action');
    }
    const data = await res.json();
    showToast(`✓ Bulk action applied to ${data.count} parts`, 'success');
    await loadAndRenderPartsOrders();
    refreshTickets().catch(() => { });
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideGlobalLoader();
  }
}

async function togglePartOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/parts-orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Failed to update part order status');

    showToast(`Part status changed to ${newStatus}`, 'success');
    await loadAndRenderPartsOrders();
    // Also update board tickets in background
    refreshTickets().catch(() => { });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// INSURANCE & SURVEYORS DIRECTORY CONTROLLER
// ====================================================
async function loadAndRenderInsurers() {
  try {
    const res = await fetch('/api/insurers');
    const insurers = await res.json();
    state.insurers = insurers;

    let totalSurveyors = 0;
    let totalActiveClaims = 0;
    let totalClaims = 0;
    insurers.forEach(ins => {
      totalSurveyors += (ins.surveyors ? ins.surveyors.length : 0);
      totalActiveClaims += (ins.active_tickets || 0);
      totalClaims += (ins.total_tickets || 0);
    });

    const statTotal = document.getElementById('insStatTotal');
    const statSurv = document.getElementById('insStatSurveyors');
    const statAct = document.getElementById('insStatActive');
    const statTotCl = document.getElementById('insStatTotalClaims');
    const bIns = document.getElementById('badgeInsuranceCount');

    if (statTotal) statTotal.textContent = insurers.length;
    if (statSurv) statSurv.textContent = totalSurveyors;
    if (statAct) statAct.textContent = totalActiveClaims;
    if (statTotCl) statTotCl.textContent = totalClaims;
    if (bIns) bIns.textContent = insurers.length;

    renderInsurersMasterList(insurers);

    // Auto-select insurer
    if (insurers.length > 0) {
      if (!state.selectedInsurerId || !insurers.some(i => i.id === state.selectedInsurerId)) {
        selectInsurer(insurers[0].id);
      } else {
        selectInsurer(state.selectedInsurerId);
      }
    } else {
      const dossier = document.getElementById('insurerDetailDossier');
      if (dossier) {
        dossier.innerHTML = `
          <div class="hub-empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <p>No insurance partners found.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    showToast('Failed to load insurance directory: ' + err.message, 'error');
  }
}

function renderInsurersMasterList(insurers) {
  const container = document.getElementById('insurersMasterList');
  if (!container) return;
  container.innerHTML = '';

  if (!insurers || insurers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-subtle); padding: 30px; font-size: 12px;">
        No insurance companies found matching search.
      </div>
    `;
    return;
  }

  insurers.forEach(ins => {
    const card = document.createElement('div');
    card.className = `hub-item-card ${ins.id === state.selectedInsurerId ? 'active' : ''}`;
    card.dataset.id = ins.id;

    const initials = (ins.name || 'I').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const survCount = ins.surveyors ? ins.surveyors.length : 0;

    card.innerHTML = `
      <div class="hub-avatar ins-avatar">${initials}</div>
      <div class="hub-item-info">
        <div class="hub-item-top">
          <span class="hub-item-title">${escapeHtml(ins.name)}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${ins.active_tickets > 0
        ? `<span class="badge-stage" style="background: var(--sla-amber-bg); color: var(--sla-amber-text); border: 1px solid var(--sla-amber-border); font-size: 10px; font-weight: 700;">${ins.active_tickets} Claims</span>`
        : `<span style="font-size: 10px; color: var(--text-subtle);">${ins.total_tickets || 0} Settled</span>`}
            ${renderCardActions(`openEditInsurerById(${ins.id})`, `deleteInsurer(${ins.id}, '${escapeHtml(ins.name).replace(/'/g, "\\'")}')`, 'Edit Insurer', 'Delete Insurer')}
          </div>
        </div>
        ${ins.contact_info ? `
          <div class="hub-item-sub">
            <span>${escapeHtml(ins.contact_info)}</span>
          </div>
        ` : ''}
        <div class="hub-item-veh-row">
          <span class="hub-veh-tag">${survCount} Authorized Surveyors</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectInsurer(ins.id);
    });

    container.appendChild(card);
  });
}

async function selectInsurer(insurerId) {
  state.selectedInsurerId = insurerId;

  // Highlight active in list
  document.querySelectorAll('#insurersMasterList .hub-item-card').forEach(card => {
    card.classList.toggle('active', parseInt(card.dataset.id) === insurerId);
  });

  const dossier = document.getElementById('insurerDetailDossier');
  if (!dossier) return;

  dossier.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-subtle);">Loading insurance partner dossier...</div>`;

  try {
    const res = await fetch(`/api/insurers/${insurerId}`);
    if (!res.ok) throw new Error('Insurer not found');
    const ins = await res.json();

    const initials = (ins.name || 'I').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    // Build Surveyors Cards HTML
    let surveyorsCardsHtml = '';
    if (ins.surveyors && ins.surveyors.length > 0) {
      surveyorsCardsHtml = ins.surveyors.map(s => `
        <div class="surveyor-card clickable" data-surv-id="${s.id}" title="Click to view full surveyor SLA dossier">
          <div class="surveyor-card-info">
            <span class="surveyor-card-name">${escapeHtml(s.name)}</span>
            <div style="display: inline-flex; align-items: center;">
              <a href="tel:${escapeHtml(s.phone)}" class="surveyor-card-phone" title="Click to call surveyor"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>${escapeHtml(s.phone)}</a>
              ${renderPhoneCopyBtn(s.phone)}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${s.active_claims > 0
          ? `<span class="surveyor-claims-count">${s.active_claims} Active</span>`
          : `<span style="font-size: 11px; color: #94a3b8;">0 Active</span>`}
            <button type="button" class="btn-remove-surv" data-surv-id="${s.id}" data-ins-id="${ins.id}" data-surv-name="${escapeHtml(s.name)}" title="Remove surveyor from this insurer">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `).join('');
    }

    const addSurveyorCardHtml = `
      <div class="surveyor-card-add" id="btnGridAddSurveyor" data-insid="${ins.id}" title="Register and map surveyor to ${escapeHtml(ins.name)}">
        <span class="plus-icon">+</span>
        <span>Add Surveyor</span>
      </div>
    `;

    const surveyorsHtml = surveyorsCardsHtml + addSurveyorCardHtml;

    // Build Active & Past Claims Tickets Table HTML
    let claimsHtml = `
      <div style="padding: 24px; text-align: center; color: var(--text-subtle); font-size: 12.5px;">
        No workshop claims tickets currently recorded under ${escapeHtml(ins.name)}.
      </div>
    `;

    if (ins.tickets && ins.tickets.length > 0) {
      claimsHtml = `
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Ticket No</th>
                <th>Customer Name</th>
                <th>Vehicle & Plate</th>
                <th>Current Claim Stage</th>
                <th>Surveyor</th>
                <th>Est. Repair Cost</th>
                <th>SLA / Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${ins.tickets.map(t => {
        const isClosed = t.status === 'CLOSED';
        return `
                  <tr data-ticket-id="${t.id}" oncontextmenu="event.preventDefault(); openTicketContextMenu(event, ${t.id});" style="cursor: pointer;" title="Right-click for options, click to view">
                    <td>
                      <a href="javascript:void(0)" class="card-ticket-no" onclick="event.stopPropagation(); openTicketPage(${t.id})" oncontextmenu="event.preventDefault(); openTicketContextMenu(event, ${t.id});" title="View Ticket Page">
                        <strong>${escapeHtml(t.ticket_number)}</strong>
                      </a>
                    </td>
                    <td>
                      <div><strong>${escapeHtml(t.customer_name || '-')}</strong></div>
                      <div style="font-size: 11px; color: #64748b; font-family: var(--font-mono);">${escapeHtml(t.customer_phone || '')}</div>
                    </td>
                    <td>
                      <div>${escapeHtml(t.model || '-')}</div>
                      <div style="margin-top: 2px;">${renderPlateBadge(t.vehicle_no)}</div>
                    </td>
                    <td><span class="ctx-stage-tag" style="font-size: 11px;">Stage #${t.current_stage_id} (${escapeHtml(t.stage_name || '')})</span></td>
                    <td><strong>${escapeHtml(t.surveyor_name || 'Unassigned')}</strong></td>
                    <td><span style="font-family: var(--font-mono); font-weight: 700; color: #15803d;">₹${Number(t.estimated_cost || 0).toLocaleString('en-IN')}</span></td>
                    <td>
                      ${isClosed
            ? `<span class="badge" style="background: #f1f5f9; color: #64748b;">Settled & Closed</span>`
            : `<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">In Process</span>`}
                    </td>
                    <td>
                      <button type="button" class="btn btn-xs btn-outline" onclick="openTicketPage(${t.id})">View</button>
                    </td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    dossier.innerHTML = `
      <div class="dossier-hero">
        <div class="dossier-hero-left">
          <div class="dossier-avatar-lg ins-lg">${initials}</div>
          <div class="dossier-title-wrap">
            <h3>${escapeHtml(ins.name)}</h3>
            <div class="dossier-meta-row">
              ${ins.contact_info ? `<span>Contact: <strong>${escapeHtml(ins.contact_info)}</strong></span>` : ''}
              <span>Partner ID: <strong>#${ins.id}</strong></span>
              <span>Total Handled Claims: <strong>${ins.tickets ? ins.tickets.length : 0}</strong></span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" class="btn btn-outline btn-sm" id="btnDossierEditInsurer" title="Edit Insurance Company Details">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            Edit Insurer
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm" id="btnDossierDeleteInsurer" title="Delete Insurance Partner">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete Insurer
          </button>
        </div>
      </div>

      <div class="dossier-section-title">
        <h4>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Authorized Claim Surveyors (${ins.surveyors ? ins.surveyors.length : 0})
        </h4>
      </div>
      <div class="surveyor-grid">${surveyorsHtml}</div>

      <div class="dossier-section-title">
        <h4>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Live Insurance Claims Tracker (${ins.tickets ? ins.tickets.length : 0})
        </h4>
      </div>
      ${claimsHtml}
    `;

    const btnEditIns = document.getElementById('btnDossierEditInsurer');
    if (btnEditIns) {
      btnEditIns.addEventListener('click', () => openEditInsurerModal(ins));
    }

    const btnDelIns = document.getElementById('btnDossierDeleteInsurer');
    if (btnDelIns) {
      btnDelIns.addEventListener('click', () => deleteInsurer(ins.id, ins.name));
    }

    const btnGridAdd = document.getElementById('btnGridAddSurveyor');
    if (btnGridAdd) {
      btnGridAdd.addEventListener('click', () => {
        populateSurvModalInsurers(ins.id);
        const modal = document.getElementById('modalAddSurveyor');
        if (modal) modal.style.display = 'flex';
      });
    }

    // Clicking surveyor card navigates to dedicated surveyor profile
    dossier.querySelectorAll('.surveyor-card.clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.surveyor-card-phone') || e.target.closest('.btn-remove-surv')) return;
        const survId = parseInt(card.dataset.survId, 10);
        if (survId) {
          const subSurvTab = document.getElementById('subtabSurveyors');
          if (subSurvTab) subSurvTab.click();
          selectSurveyor(survId);
        }
      });
    });

    // Hook up Remove Surveyor buttons
    dossier.querySelectorAll('.btn-remove-surv').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const survId = btn.dataset.survId;
        const insId = btn.dataset.insId;
        const survName = btn.dataset.survName || 'this surveyor';

        if (!await showConfirmDialog({
          title: 'Remove Surveyor',
          message: `Remove surveyor "${survName}" from ${ins.name}?`,
          confirmText: 'Remove'
        })) {
          return;
        }

        try {
          const delRes = await fetch(`/api/insurers/${insId}/surveyors/${survId}`, {
            method: 'DELETE'
          });
          if (!delRes.ok) throw new Error('Failed to unmap surveyor');
          showToast(`✓ Removed ${survName} from ${ins.name}`, 'info');
          await loadAndRenderInsurers();
          selectInsurer(parseInt(insId));
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    state.currentInsurerTickets = ins.tickets || [];
    dossier.querySelectorAll('.dossier-table tbody tr').forEach(tr => {
      const tid = tr.dataset.ticketId;
      if (tid) {
        tr.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openTicketContextMenu(e, tid);
        });
      }
    });

  } catch (err) {
    dossier.innerHTML = `<div style="color: var(--sla-breached-text); padding: 30px; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function filterInsurersList(q) {
  const query = (q || '').trim().toLowerCase();
  if (!query) {
    renderInsurersMasterList(state.insurers);
    return;
  }
  const filtered = state.insurers.filter(ins => {
    const matchName = (ins.name || '').toLowerCase().includes(query);
    const matchContact = (ins.contact_info || '').toLowerCase().includes(query);
    const matchSurv = (ins.surveyors || []).some(s =>
      (s.name || '').toLowerCase().includes(query) ||
      (s.phone || '').includes(query)
    );
    return matchName || matchContact || matchSurv;
  });
  renderInsurersMasterList(filtered);
}

async function populateSurvModalInsurers(selectedId) {
  const sel = document.getElementById('survModalInsurerSelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Insurance Partner --</option>';
    (state.insurers || []).forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.id;
      opt.textContent = ins.name;
      if (selectedId && ins.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // Populate existing surveyors dropdown
  const survSel = document.getElementById('survModalExistingSelect');
  if (survSel) {
    survSel.innerHTML = '<option value="">-- Choose from Existing Surveyors --</option>';
    let surveyors = state.surveyors || [];
    if (!surveyors || surveyors.length === 0) {
      try {
        const res = await fetch('/api/surveyors');
        if (res.ok) {
          surveyors = await res.json();
          state.surveyors = surveyors;
        }
      } catch (e) { }
    }

    const currentIns = (state.insurers || []).find(i => i.id === (selectedId || (sel ? parseInt(sel.value) : null)));
    const mappedIds = new Set((currentIns?.surveyors || []).map(s => s.id));

    (surveyors || []).forEach(s => {
      const isMapped = mappedIds.has(s.id);
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.phone})${isMapped ? ' — Already Linked' : ''}`;
      if (isMapped) opt.disabled = true;
      survSel.appendChild(opt);
    });
  }

  // Reset toggle and fields
  const newFields = document.getElementById('newSurveyorFields');
  if (newFields) newFields.style.display = 'none';
  const toggleBtn = document.getElementById('btnToggleNewSurveyor');
  if (toggleBtn) toggleBtn.textContent = '+ Or register a new surveyor in directory';
  const nameInput = document.getElementById('survModalName');
  const phoneInput = document.getElementById('survModalPhone');
  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
}

async function handleSaveNewSurveyor(e) {
  e.preventDefault();
  const insurerId = document.getElementById('survModalInsurerSelect').value;
  const existingSurvId = document.getElementById('survModalExistingSelect')?.value;
  const newFields = document.getElementById('newSurveyorFields');
  const isCreatingNew = newFields && newFields.style.display !== 'none';
  const name = document.getElementById('survModalName')?.value?.trim();
  const phone = document.getElementById('survModalPhone')?.value?.trim();

  if (!insurerId) {
    showToast('Please select an insurance company', 'warning');
    return;
  }

  let payload = {};
  if (isCreatingNew) {
    if (!name || !phone) {
      showToast('Please enter surveyor name and phone number', 'warning');
      return;
    }
    payload = { name, phone };
  } else {
    if (!existingSurvId) {
      showToast('Please select an existing surveyor from the list', 'warning');
      return;
    }
    payload = { surveyor_id: existingSurvId };
  }

  try {
    const res = await fetch(`/api/insurers/${insurerId}/surveyors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to link surveyor');
    }

    showToast('✓ Authorized surveyor linked successfully!', 'success');
    const modal = document.getElementById('modalAddSurveyor');
    if (modal) modal.style.display = 'none';
    document.getElementById('formAddSurveyorModal').reset();
    if (newFields) newFields.style.display = 'none';

    state.selectedInsurerId = parseInt(insurerId);
    await loadAndRenderInsurers();
    if (typeof loadAndRenderSurveyorsPerformance === 'function') {
      loadAndRenderSurveyorsPerformance();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSaveNewInsurer(e) {
  e.preventDefault();
  const name = document.getElementById('insurerModalName').value.trim();
  const contact_info = document.getElementById('insurerModalContact').value.trim();

  if (!name) {
    showToast('Insurance company name is required', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/insurers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_info })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to add insurance company');
    }

    showToast(`✓ Insurance company "${name}" registered successfully!`, 'success');
    const modal = document.getElementById('modalAddInsurer');
    if (modal) modal.style.display = 'none';
    document.getElementById('formAddInsurerModal').reset();

    state.selectedInsurerId = data.id;
    await loadAndRenderInsurers();
    selectInsurer(data.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditInsurerModal(ins) {
  const modal = document.getElementById('modalEditInsurer');
  if (!modal || !ins) return;

  document.getElementById('editInsurerId').value = ins.id;
  document.getElementById('editInsurerName').value = ins.name || '';
  document.getElementById('editInsurerContact').value = ins.contact_info || '';

  modal.style.display = 'flex';
  const nameInp = document.getElementById('editInsurerName');
  if (nameInp) nameInp.focus();
}

async function handleSaveEditInsurer(e) {
  e.preventDefault();
  const id = document.getElementById('editInsurerId').value;
  const name = document.getElementById('editInsurerName').value.trim();
  const contact_info = document.getElementById('editInsurerContact').value.trim();

  if (!name) {
    showToast('Insurance company name is required', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/insurers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_info })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update insurance company');
    }

    showToast(`✓ Insurance company "${name}" updated successfully!`, 'success');
    const modal = document.getElementById('modalEditInsurer');
    if (modal) modal.style.display = 'none';

    await loadAndRenderInsurers();
    selectInsurer(parseInt(id));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditSurveyorModal(surv) {
  const modal = document.getElementById('modalEditSurveyor');
  if (!modal || !surv) return;

  document.getElementById('editSurveyorId').value = surv.id;
  document.getElementById('editSurveyorName').value = surv.name || '';
  document.getElementById('editSurveyorPhone').value = surv.phone || '';

  modal.style.display = 'flex';
  const nameInp = document.getElementById('editSurveyorName');
  if (nameInp) nameInp.focus();
}

async function handleSaveEditSurveyor(e) {
  e.preventDefault();
  const id = document.getElementById('editSurveyorId').value;
  const name = document.getElementById('editSurveyorName').value.trim();
  const phone = document.getElementById('editSurveyorPhone').value.trim();

  if (!name || !phone) {
    showToast('Surveyor name and phone number are required', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/surveyors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update surveyor');
    }

    showToast(`✓ Surveyor "${name}" updated successfully!`, 'success');
    const modal = document.getElementById('modalEditSurveyor');
    if (modal) modal.style.display = 'none';

    await loadAndRenderSurveyors();
    selectSurveyor(parseInt(id));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// SURVEYORS & SLA PERFORMANCE CONTROLLER (DEDICATED DOSSIER)
// ====================================================
async function loadAndRenderSurveyors() {
  try {
    const res = await fetch('/api/surveyors');
    if (!res.ok) throw new Error('Failed to load surveyors');
    const surveyors = await res.json();
    state.surveyors = surveyors;

    // Calculate Summary KPIs for Surveyors Ribbon
    const totalSurv = surveyors.length;
    let totalActive = 0;
    let sumWd = 0;
    let countWd = 0;
    let sumAdherence = 0;
    let countAdherence = 0;

    surveyors.forEach(s => {
      totalActive += (s.active_claims || 0);
      if (s.avg_sla_days_wd !== null) {
        sumWd += s.avg_sla_days_wd;
        countWd++;
      }
      if (s.sla_adherence_pct !== null) {
        sumAdherence += s.sla_adherence_pct;
        countAdherence++;
      }
    });

    const avgWd = countWd > 0 ? (sumWd / countWd).toFixed(1) + ' WD' : '—';
    const avgAdh = countAdherence > 0 ? Math.round(sumAdherence / countAdherence) + '%' : '—';

    const kpiTotal = document.getElementById('survStatTotal');
    const kpiActive = document.getElementById('survStatActive');
    const kpiAvgWd = document.getElementById('survStatAvgWd');
    const kpiAdh = document.getElementById('survStatAdherence');

    if (kpiTotal) kpiTotal.textContent = totalSurv;
    if (kpiActive) kpiActive.textContent = totalActive;
    if (kpiAvgWd) kpiAvgWd.textContent = avgWd;
    if (kpiAdh) kpiAdh.textContent = avgAdh;

    renderSurveyorsMasterList(surveyors);

    // Auto-select surveyor
    if (surveyors.length > 0) {
      if (!state.selectedSurveyorId || !surveyors.some(s => s.id === state.selectedSurveyorId)) {
        selectSurveyor(surveyors[0].id);
      } else {
        selectSurveyor(state.selectedSurveyorId);
      }
    } else {
      const dossier = document.getElementById('surveyorDetailDossier');
      if (dossier) {
        dossier.innerHTML = `
          <div class="hub-empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <p>No claim surveyors registered yet. Click "+ Add Surveyor" to register one.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    showToast('Failed to load surveyors: ' + err.message, 'error');
  }
}

function renderSurveyorsMasterList(surveyors) {
  const container = document.getElementById('surveyorsMasterList');
  if (!container) return;

  container.innerHTML = '';

  if (!surveyors || surveyors.length === 0) {
    container.innerHTML = `
      <div style="padding: 28px 16px; text-align: center; color: var(--text-subtle); font-size: 13px;">
        No claim surveyors found matching your search.
      </div>
    `;
    return;
  }

  surveyors.forEach(s => {
    const card = document.createElement('div');
    const isSelected = s.id === state.selectedSurveyorId;
    card.className = `hub-item-card ${isSelected ? 'active' : ''}`;
    card.dataset.id = s.id;

    const initials = (s.name || 'S').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const insurersStr = (s.insurers && s.insurers.length > 0)
      ? s.insurers.map(i => escapeHtml(i.name)).join(', ')
      : 'Unmapped';

    let speedBadge = '';
    if (s.total_claims > 0 && s.sla_rating === 'FAST') {
      speedBadge = `<span class="sla-speed-pill fast" style="font-size: 10px; padding: 1px 6px;">Fast (${s.avg_sla_days_wd || s.avg_show_up_wd}d)</span>`;
    } else if (s.total_claims > 0 && s.sla_rating === 'BREACHED') {
      speedBadge = `<span class="sla-speed-pill breached" style="font-size: 10px; padding: 1px 6px;">Breached</span>`;
    }

    card.innerHTML = `
      <div class="hub-avatar surv-avatar">${initials}</div>
      <div class="hub-item-info">
        <div class="hub-item-top">
          <span class="hub-item-title">${escapeHtml(s.name)}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${speedBadge}
            ${renderCardActions(`openEditSurveyorById(${s.id})`, `deleteSurveyor(${s.id}, '${escapeHtml(s.name).replace(/'/g, "\\'")}')`, 'Edit Surveyor', 'Delete Surveyor')}
          </div>
        </div>
        <div class="hub-item-sub">
          <span style="display: inline-flex; align-items: center; font-family: var(--font-mono); font-weight: 600;">${escapeHtml(s.phone)}${renderPhoneCopyBtn(s.phone)}</span>
        </div>
        <div class="hub-item-veh-row">
          <span class="hub-veh-tag" title="Insurers: ${escapeHtml(insurersStr)}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>${escapeHtml(insurersStr)}</span>
          ${s.active_claims > 0 ? `<span class="hub-veh-tag" style="background:#eff6ff;color:#1d4ed8;font-weight:700;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>${s.active_claims} Active</span>` : ''}
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectSurveyor(s.id);
    });

    container.appendChild(card);
  });
}

function filterSurveyorsMasterList() {
  const query = (state.surveyorSearchQuery || '').trim().toLowerCase();
  const filter = state.surveyorFilter || 'all';

  let filtered = (state.surveyors || []).slice();

  if (filter === 'active') {
    filtered = filtered.filter(s => (s.active_claims || 0) > 0);
  } else if (filter === 'fast') {
    filtered = filtered.filter(s => s.total_claims > 0 && s.sla_rating === 'FAST');
  }

  if (query) {
    filtered = filtered.filter(s => {
      const matchName = (s.name || '').toLowerCase().includes(query);
      const matchPhone = (s.phone || '').includes(query);
      const matchIns = (s.insurers || []).some(i => (i.name || '').toLowerCase().includes(query));
      return matchName || matchPhone || matchIns;
    });
  }

  renderSurveyorsMasterList(filtered);
}

async function selectSurveyor(surveyorId) {
  state.selectedSurveyorId = surveyorId;
  state.surveyorTicketsPage = 1;

  document.querySelectorAll('#surveyorsMasterList .hub-item-card').forEach(card => {
    card.classList.toggle('active', parseInt(card.dataset.id) === surveyorId);
  });

  const dossier = document.getElementById('surveyorDetailDossier');
  if (!dossier) return;

  dossier.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-subtle);">Loading surveyor performance dossier...</div>`;

  try {
    const res = await fetch(`/api/surveyors/${surveyorId}`);
    if (!res.ok) throw new Error('Surveyor not found');
    const s = await res.json();

    const initials = (s.name || 'S').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    const insurersHtml = (s.insurers && s.insurers.length > 0)
      ? s.insurers.map(i => `<span class="surv-insurer-badge">${escapeHtml(i.name)}</span>`).join('')
      : '<span style="color: #94a3b8; font-size: 11px;">Unmapped</span>';

    let speedPill = '';
    if (s.total_claims > 0 && s.sla_rating) {
      if (s.sla_rating === 'FAST') {
        speedPill = `<span class="sla-speed-pill fast"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>Fast Turnaround (${s.avg_sla_days_wd || s.avg_show_up_wd} WD)</span>`;
      } else if (s.sla_rating === 'BREACHED') {
        speedPill = `<span class="sla-speed-pill breached"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>SLA Breaching (${s.avg_sla_days_wd || s.avg_show_up_wd} WD)</span>`;
      } else if (s.sla_rating === 'ON_TRACK') {
        speedPill = `<span class="sla-speed-pill on-track">On Track (≤3 WD)</span>`;
      }
    } else {
      speedPill = `<span class="sla-speed-pill" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">No Claims Recorded</span>`;
    }

    state.currentSurveyorTickets = s.tickets || [];

    dossier.innerHTML = `
      <div class="dossier-hero">
        <div class="dossier-hero-left">
          <div class="dossier-avatar-lg surv-lg">${initials}</div>
          <div class="dossier-title-wrap">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h3>${escapeHtml(s.name)}</h3>
              ${speedPill}
            </div>
            <div class="dossier-meta-row">
              <span style="display: inline-flex; align-items: center;">
                <a href="tel:${escapeHtml(s.phone)}" class="surveyor-card-phone" title="Click to call">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  ${escapeHtml(s.phone)}
                </a>
                ${renderPhoneCopyBtn(s.phone)}
              </span>
              <span>Surveyor ID: <strong>#${s.id}</strong></span>
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                Insurers: ${insurersHtml}
              </span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" class="btn btn-outline btn-sm" id="btnDossierEditSurveyor" title="Edit Surveyor Details">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            Edit Surveyor
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm" id="btnDossierDeleteSurveyor" title="Delete Surveyor">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete Surveyor
          </button>
        </div>
      </div>

      <!-- 4 SLA PERFORMANCE KPI METRICS -->
      <div class="surveyor-kpi-grid">
        <div class="surv-kpi-card">
          <span class="kpi-label">Total Claims</span>
          <span class="kpi-val" style="color: #0f172a;">${s.total_claims || 0}</span>
        </div>
        <div class="surv-kpi-card">
          <span class="kpi-label">Approved</span>
          <span class="kpi-val" style="color: #059669;">${s.approved_claims ?? (s.tickets ? s.tickets.filter(t => t.is_approved).length : 0)}</span>
        </div>
        <div class="surv-kpi-card">
          <span class="kpi-label">SLA Days</span>
          <span class="kpi-val" style="color: ${(s.total_claims > 0 && s.avg_show_up_wd !== null) ? (s.avg_show_up_wd <= 3.0 ? '#059669' : '#d97706') : '#94a3b8'};">
            ${(s.total_claims > 0 && s.avg_show_up_wd !== null && s.avg_show_up_wd !== undefined) ? s.avg_show_up_wd + ' WD' : ((s.total_claims > 0 && s.avg_sla_days_wd !== null) ? s.avg_sla_days_wd + ' WD' : '—')}
          </span>
          <span style="font-size: 10.5px; color: #64748b; margin-top: -2px;" title="Average working days from insurance intimation to Approval">Intimation to Approval</span>
        </div>
        <div class="surv-kpi-card">
          <span class="kpi-label">Active Claims</span>
          <span class="kpi-val" style="color: #2563eb;">${s.active_claims || 0}</span>
        </div>
      </div>

      <!-- CLAIMS & SLA HISTORY TABLE CONTAINER -->
      <div class="dossier-section-title">
        <h4>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Surveyor History (${(s.tickets || []).length})
        </h4>
      </div>

      <div id="surveyorTicketsTableContainer">
        <!-- Rendered by renderSurveyorTicketsHistory -->
      </div>
    `;

    const btnEditSurv = document.getElementById('btnDossierEditSurveyor');
    if (btnEditSurv) {
      btnEditSurv.addEventListener('click', () => openEditSurveyorModal(s));
    }

    const btnDelSurv = document.getElementById('btnDossierDeleteSurveyor');
    if (btnDelSurv) {
      btnDelSurv.addEventListener('click', () => deleteSurveyor(s.id, s.name));
    }

    renderSurveyorTicketsHistory();
  } catch (err) {
    dossier.innerHTML = `<div style="text-align: center; padding: 40px; color: #dc2626;">Failed to load surveyor details: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSurveyorTicketsHistory() {
  const container = document.getElementById('surveyorTicketsTableContainer');
  if (!container) return;

  const tickets = state.currentSurveyorTickets || [];
  if (tickets.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-subtle); font-size: 12.5px; background: #f8fafc; border-radius: 6px; border: 1px dashed #cbd5e1;">
        No workshop claims tickets currently recorded under this surveyor.
      </div>
    `;
    return;
  }

  const effectivePageSize = (state.surveyorTicketsPageSize === 'ALL') ? tickets.length : (parseInt(state.surveyorTicketsPageSize, 10) || 10);
  const totalPages = Math.max(1, Math.ceil(tickets.length / (effectivePageSize || 1)));
  const page = Math.min(Math.max(1, state.surveyorTicketsPage), totalPages);
  const startIndex = (page - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, tickets.length);
  const pagedTickets = (state.surveyorTicketsPageSize === 'ALL') ? tickets : tickets.slice(startIndex, endIndex);

  container.innerHTML = `
    <div class="dossier-table-wrap">
      <table class="dossier-table">
        <thead>
          <tr>
            <th>Ticket No</th>
            <th>Customer Name</th>
            <th>Vehicle & Plate</th>
            <th>Insurance Company</th>
            <th>Approved</th>
            <th>SLA Days</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${pagedTickets.map(t => {
    const isClosed = t.status === 'CLOSED';
    const isApproved = t.is_approved ?? Boolean(t.approval_date || t.current_stage_id > 5 || isClosed);
    const approvedBadge = isApproved
      ? `<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; padding: 3px 8px;" title="Claim Approved">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <polyline points="20 6 9 17 4 12"></polyline>
                   </svg>
                   Approved
                 </span>`
      : `<span class="badge" style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; padding: 3px 8px;" title="Approval Pending">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <circle cx="12" cy="12" r="10"></circle>
                     <polyline points="12 6 12 12 16 14"></polyline>
                   </svg>
                   Pending
                 </span>`;

    const stage4Wd = t.stage4_elapsed_wd !== null && t.stage4_elapsed_wd !== undefined ? `${t.stage4_elapsed_wd} WD` : '—';
    const showUpWd = t.show_up_wd !== null && t.show_up_wd !== undefined ? `${t.show_up_wd} WD` : stage4Wd;
    let slaTag = '<span class="badge" style="background:#ecfdf5;color:#047857;">On Track</span>';
    if (t.stage4_sla_status === 'BREACHED' || t.isBreached || (t.show_up_wd && t.show_up_wd > 3)) {
      slaTag = '<span class="badge" style="background:#fef2f2;color:#b91c1c;">Breached</span>';
    } else if (t.isDueSoon) {
      slaTag = '<span class="badge" style="background:#fffbeb;color:#b45309;">Due Soon</span>';
    }

    return `
              <tr data-ticket-id="${t.id}" oncontextmenu="event.preventDefault(); openTicketContextMenu(event, ${t.id});" style="cursor: pointer;" title="Right-click for options, click to view">
                <td>
                  <a href="javascript:void(0)" class="card-ticket-no" onclick="event.stopPropagation(); openTicketPage(${t.id})" oncontextmenu="event.preventDefault(); openTicketContextMenu(event, ${t.id});" title="View Ticket Page / Right-click for options">
                    <strong>${escapeHtml(t.ticket_number)}</strong>
                  </a>
                </td>
                <td>
                  <div><strong>${escapeHtml(t.customer_name || '-')}</strong></div>
                  <div style="font-size: 11px; color: #64748b; font-family: var(--font-mono); display: inline-flex; align-items: center;">
                    <span>${escapeHtml(t.customer_phone || '')}</span>
                    ${renderPhoneCopyBtn(t.customer_phone)}
                  </div>
                </td>
                <td>
                  <div>${escapeHtml(t.model || '-')}</div>
                  <div style="margin-top: 2px;">${renderPlateBadge(t.vehicle_no)}</div>
                </td>
                <td><span class="surv-insurer-badge">${escapeHtml(t.insurance_company || 'Direct')}</span></td>
                <td>${approvedBadge}</td>
                <td>
                  <strong style="font-family: var(--font-mono); color: #0284c7;" title="Working days from intimation to survey visit">${showUpWd}</strong>
                  <div style="margin-top: 2px;">${slaTag}</div>
                </td>
                <td>
                  ${isClosed
        ? `<span class="badge" style="background: #f1f5f9; color: #64748b;">Closed</span>`
        : `<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">In Process</span>`}
                </td>
                <td>
                  <button type="button" class="btn btn-xs btn-outline" onclick="openTicketPage(${t.id})">View</button>
                </td>
              </tr>
            `;
  }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Table Pagination Footer -->
    <div class="table-pagination-bar" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748b; flex-wrap: wrap; gap: 8px;">
      <div id="survTicketsPaginationInfo">
        Showing ${startIndex + 1}–${endIndex} of ${tickets.length} claims (Page ${page} of ${totalPages})
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <span>Per page:</span>
          <select id="survTicketsPageSize" class="form-select" style="padding: 2px 8px; font-size: 11.5px; height: 26px;">
            <option value="5" ${state.surveyorTicketsPageSize === '5' ? 'selected' : ''}>5</option>
            <option value="10" ${state.surveyorTicketsPageSize === '10' ? 'selected' : ''}>10</option>
            <option value="25" ${state.surveyorTicketsPageSize === '25' ? 'selected' : ''}>25</option>
            <option value="ALL" ${state.surveyorTicketsPageSize === 'ALL' ? 'selected' : ''}>All</option>
          </select>
        </div>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn btn-xs btn-outline" id="btnSurvTicketsPrev" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
          <button type="button" class="btn btn-xs btn-outline" id="btnSurvTicketsNext" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    </div>
  `;

  // Attach context menu listener on all rows in the surveyor dossier table
  container.querySelectorAll('.dossier-table tbody tr').forEach(tr => {
    tr.addEventListener('contextmenu', (e) => {
      const tid = tr.getAttribute('data-ticket-id');
      if (tid) {
        e.preventDefault();
        openTicketContextMenu(e, tid);
      }
    });
  });

  const selSize = document.getElementById('survTicketsPageSize');
  if (selSize) {
    selSize.addEventListener('change', (e) => {
      state.surveyorTicketsPageSize = e.target.value;
      state.surveyorTicketsPage = 1;
      renderSurveyorTicketsHistory();
    });
  }

  const btnPrev = document.getElementById('btnSurvTicketsPrev');
  if (btnPrev && page > 1) {
    btnPrev.addEventListener('click', () => {
      state.surveyorTicketsPage = page - 1;
      renderSurveyorTicketsHistory();
    });
  }

  const btnNext = document.getElementById('btnSurvTicketsNext');
  if (btnNext && page < totalPages) {
    btnNext.addEventListener('click', () => {
      state.surveyorTicketsPage = page + 1;
      renderSurveyorTicketsHistory();
    });
  }
}

// Backwards compatibility alias
const loadAndRenderSurveyorsPerformance = loadAndRenderSurveyors;
const filterSurveyorsPerfList = filterSurveyorsMasterList;

// ====================================================
// SETTINGS > HOLIDAYS CONTROLLER
// ====================================================
async function loadAndRenderHolidays() {
  try {
    const res = await fetch('/api/holidays');
    const holidays = await res.json();
    state.holidays = holidays;

    const countEl = document.getElementById('holidaysCount');
    const bHol = document.getElementById('badgeHolidaysCount');
    if (countEl) countEl.textContent = holidays.length;
    if (bHol) bHol.textContent = holidays.length;

    renderHolidaysTable(holidays);
  } catch (err) {
    showToast('Failed to load holidays: ' + err.message, 'error');
  }
}

function renderHolidaysTable(holidays) {
  state.lastHolidaysList = holidays || state.holidays || [];
  const tbody = document.getElementById('holidaysTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const total = state.lastHolidaysList.length;
  const pagination = renderPaginationControls({
    infoElId: 'holidaysPaginationInfo',
    numbersElId: 'holidaysPageNumbers',
    prevBtnId: 'btnHolPrevPage',
    nextBtnId: 'btnHolNextPage',
    sizeSelectId: 'holidaysPageSize',
    totalItems: total,
    currentPage: state.holidaysPage,
    pageSize: state.holidaysPageSize,
    itemLabel: 'holidays',
    onPageChange: (newPage) => {
      state.holidaysPage = newPage;
      renderHolidaysTable(state.lastHolidaysList);
    },
    onSizeChange: (newSize) => {
      state.holidaysPageSize = newSize;
      state.holidaysPage = 1;
      renderHolidaysTable(state.lastHolidaysList);
    }
  });

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-subtle); padding: 30px;">
          No workshop holidays configured. Only standard Sundays are non-working days.
        </td>
      </tr>
    `;
    return;
  }

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pagedHolidays = pagination.pagedItems(state.lastHolidaysList);

  pagedHolidays.forEach(h => {
    const tr = document.createElement('tr');
    const dateObj = new Date(h.date + 'T00:00:00');
    const dayName = isNaN(dateObj.getTime()) ? '—' : daysOfWeek[dateObj.getDay()];

    tr.innerHTML = `
      <td><span style="font-family: var(--font-mono); font-weight: 600;">${escapeHtml(h.date)}</span></td>
      <td><span style="color: var(--text-main); font-weight: 500;">${dayName}</span></td>
      <td><strong>${escapeHtml(h.name)}</strong></td>
      <td><span class="badge-status-normal">Exempted Non-Working Day</span></td>
      <td style="text-align: right;">
        <button type="button" class="btn-del-holiday" data-date="${escapeHtml(h.date)}" data-name="${escapeHtml(h.name)}" title="Remove Holiday">
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-holiday').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      const name = btn.dataset.name;
      deleteHoliday(date, name);
    });
  });
}

async function handleAddHolidaySubmit(e) {
  e.preventDefault();
  const dateInput = document.getElementById('holidayDate');
  const nameInput = document.getElementById('holidayName');
  const date = dateInput.value.trim();
  const name = nameInput.value.trim();

  if (!date || !name) {
    showToast('Please enter both date and holiday name', 'error');
    return;
  }

  try {
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to add holiday');
    }

    dateInput.value = '';
    nameInput.value = '';
    showToast(`Holiday "${name}" saved to config/holidays.json! SLA recalibrated.`, 'success');

    await loadAndRenderHolidays();
    await refreshTickets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteHoliday(date, name) {
  if (!await showConfirmDialog({
    title: 'Remove Holiday',
    message: `Are you sure you want to remove "${name}" (${date}) from workshop holidays? This will recalibrate ticket SLA working days.`,
    confirmText: 'Remove Holiday'
  })) {
    return;
  }

  try {
    const res = await fetch(`/api/holidays/${encodeURIComponent(date)}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to delete holiday');
    }

    showToast(`Removed "${name}" from holidays. SLA recalculations updated.`, 'success');
    await loadAndRenderHolidays();
    await refreshTickets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// SETTINGS > PIPELINE SLA TIMING CONTROLLER
// ====================================================
async function loadAndRenderSlaSettings() {
  try {
    const res = await fetch('/api/settings/stages-sla');
    const stages = await res.json();
    state.stages = stages;
    renderSlaConfigTable(stages);
  } catch (err) {
    showToast('Failed to load SLA stage configuration: ' + err.message, 'error');
  }
}

function renderSlaConfigTable(stages) {
  state.lastSlaStagesList = stages || state.stages || [];
  const tbody = document.getElementById('slaConfigTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const total = state.lastSlaStagesList.length;
  const pagination = renderPaginationControls({
    infoElId: 'slaConfigPaginationInfo',
    numbersElId: 'slaConfigPageNumbers',
    prevBtnId: 'btnSlaPrevPage',
    nextBtnId: 'btnSlaNextPage',
    sizeSelectId: 'slaConfigPageSize',
    totalItems: total,
    currentPage: state.slaConfigPage,
    pageSize: state.slaConfigPageSize,
    itemLabel: 'stages',
    onPageChange: (newPage) => {
      state.slaConfigPage = newPage;
      renderSlaConfigTable(state.lastSlaStagesList);
    },
    onSizeChange: (newSize) => {
      state.slaConfigPageSize = newSize;
      state.slaConfigPage = 1;
      renderSlaConfigTable(state.lastSlaStagesList);
    }
  });

  const pagedStages = pagination.pagedItems(state.lastSlaStagesList);

  pagedStages.forEach(st => {
    const tr = document.createElement('tr');
    tr.dataset.stageId = st.id;

    // Column badge color
    let colBadgeClass = 'dot-inprogress';
    if (st.kanbanColumn === 'OPEN') colBadgeClass = 'dot-open';
    else if (st.kanbanColumn === 'CLOSED') colBadgeClass = 'dot-closed';

    // Type badge
    const typeBadgeHtml = st.isOptional
      ? `<span class="stage-type-pill type-optional">Optional</span>`
      : `<span class="stage-type-pill type-mandatory">Mandatory</span>`;

    // SLA Input Cell
    let slaInputHtml = '';
    if (st.id === 13 || st.kanbanColumn === 'CLOSED') {
      slaInputHtml = `
        <div class="sla-input-wrap">
          <span class="sla-limit-unit" style="font-weight:700;color:#10b981;">WD (Done)</span>
        </div>
      `;
    } else {
      slaInputHtml = `
        <div class="sla-input-wrap">
          <button type="button" class="sla-stepper-btn" onclick="stepSlaInput(${st.id}, -1)">−</button>
          <input type="number" id="slaInputStage_${st.id}" class="sla-limit-input" data-stage-id="${st.id}" value="${st.slaLimitWD !== null ? st.slaLimitWD : 1}" min="1" max="99" step="1">
          <button type="button" class="sla-stepper-btn" onclick="stepSlaInput(${st.id}, 1)">+</button>
          <span class="sla-limit-unit">WD</span>
        </div>
      `;
    }

    // Default reference
    const defaultRefText = st.defaultRef || (st.defaultSlaLimitWD !== null ? `${st.defaultSlaLimitWD} WD` : (st.id === 13 ? 'Done' : '—'));

    // Note cell
    const noteText = st.note || (st.id === 13 ? 'Delivered' : '');

    tr.innerHTML = `
      <td><span class="sla-stage-num-badge">#${st.id}</span></td>
      <td>
        <div class="sla-stage-title">${escapeHtml(st.name)}</div>
        <div class="sla-stage-desc">${escapeHtml(st.description || '')}</div>
      </td>
      <td>
        <span class="col-pill">
          <span class="col-dot ${colBadgeClass}" style="display:inline-block;margin-right:4px;"></span>
          ${escapeHtml(st.kanbanColumn)}
        </span>
      </td>
      <td>${typeBadgeHtml}</td>
      <td>${slaInputHtml}</td>
      <td><span class="default-ref-tag">${escapeHtml(defaultRefText)}</span></td>
      <td>
        ${noteText ? `<span class="sla-note-text" ${st.id === 13 ? 'style="color:#10b981;font-weight:600;"' : ''}>${escapeHtml(noteText)}</span>` : '<span style="color:#94a3b8;">—</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.stepSlaInput = function (stageId, delta) {
  const input = document.getElementById(`slaInputStage_${stageId}`);
  if (!input) return;
  let val = parseInt(input.value, 10);
  if (isNaN(val)) val = 1;
  val += delta;
  if (val < 1) val = 1;
  if (val > 99) val = 99;
  input.value = val;
};

async function handleSaveAllSla() {
  const inputs = document.querySelectorAll('.sla-config-table input[data-stage-id]');
  const updates = [];

  inputs.forEach(input => {
    const stageId = Number(input.dataset.stageId);
    const slaLimitWD = parseInt(input.value, 10);
    if (!isNaN(stageId) && !isNaN(slaLimitWD) && slaLimitWD >= 0) {
      updates.push({ id: stageId, slaLimitWD });
    }
  });

  if (updates.length === 0) {
    showToast('No SLA limits found to save', 'info');
    return;
  }

  try {
    const res = await fetch('/api/settings/stages-sla', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: updates })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save SLA configuration');
    }

    const data = await res.json();
    state.stages = data.stages;

    showToast('✓ Pipeline stage SLA limits updated & persisted! Recalibrating tickets...', 'success');
    renderSlaConfigTable(state.stages);
    await refreshTickets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleResetDefaultSla() {
  if (!await showConfirmDialog({
    title: 'Reset SLA Limits',
    message: 'Are you sure you want to reset all 12 pipeline stages back to factory default Honda SLA limits?',
    confirmText: 'Reset Defaults'
  })) {
    return;
  }

  try {
    const res = await fetch('/api/settings/stages-sla/reset', {
      method: 'POST'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reset SLA configuration');
    }

    const data = await res.json();
    state.stages = data.stages;

    showToast('✓ Reset all stages back to default Honda SLA limits!', 'success');
    renderSlaConfigTable(state.stages);
    await refreshTickets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// NATIVE BUTTON CLICK MATERIAL RIPPLE & STAGE PROGRESS ANIMATIONS
// ====================================================
let lastCursorX = window.innerWidth / 2;
let lastCursorY = window.innerHeight / 2;
let cursorHaloEl = null;

document.addEventListener('mousemove', (e) => {
  lastCursorX = e.clientX;
  lastCursorY = e.clientY;
  if (cursorHaloEl && cursorHaloEl.classList.contains('active')) {
    cursorHaloEl.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  }
}, { passive: true });

function triggerStageProgressCursorAnimation(x, y, label = 'Stage Advanced ✓') {
  const posX = typeof x === 'number' ? x : lastCursorX;
  const posY = typeof y === 'number' ? y : lastCursorY;

  // 1. Dynamic Cursor Halo that follows the mouse pointer for 1.2s
  if (!cursorHaloEl) {
    cursorHaloEl = document.createElement('div');
    cursorHaloEl.id = 'cursorStageHalo';
    cursorHaloEl.className = 'cursor-stage-halo';
    document.body.appendChild(cursorHaloEl);
  }
  cursorHaloEl.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
  cursorHaloEl.classList.add('active');

  setTimeout(() => {
    if (cursorHaloEl) cursorHaloEl.classList.remove('active');
  }, 1200);

  // 2. High-Impact Shockwave Burst + Starburst Particles + Floating Stage Pill
  const burst = document.createElement('div');
  burst.className = 'cursor-stage-progress-burst';
  burst.style.left = `${posX}px`;
  burst.style.top = `${posY}px`;

  burst.innerHTML = `
    <div class="burst-shockwave"></div>
    <div class="burst-shockwave-inner"></div>
    <div class="burst-particle p1"></div>
    <div class="burst-particle p2"></div>
    <div class="burst-particle p3"></div>
    <div class="burst-particle p4"></div>
    <div class="burst-particle p5"></div>
    <div class="burst-particle p6"></div>
    <div class="burst-pill">
      <svg class="burst-check-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${escapeHtml(label)}</span>
    </div>
  `;

  document.body.appendChild(burst);

  setTimeout(() => {
    burst.remove();
  }, 1250);
}

window.triggerStageProgressCursorAnimation = triggerStageProgressCursorAnimation;

function setupMousePointerAnimations() {
  // Click Material Ripple Effect delegation on interactive buttons
  const rippleHostSelector = 'button, .btn, .context-menu-item, .filter-pill, .tab-btn, .btn-circle-advance, .card-note-icon-btn, .preset-chip, .nav-item';

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;

    const rippleHost = target.closest(rippleHostSelector);
    if (!rippleHost) return;

    const rect = rippleHost.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'mouse-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    const computedPos = window.getComputedStyle(rippleHost).position;
    if (computedPos === 'static') {
      rippleHost.style.position = 'relative';
    }
    const computedOverflow = window.getComputedStyle(rippleHost).overflow;
    if (computedOverflow !== 'hidden') {
      rippleHost.style.overflow = 'hidden';
    }

    rippleHost.appendChild(ripple);

    ripple.addEventListener('animationend', () => {
      ripple.remove();
    }, { once: true });
  });
}

// ====================================================
// AUTHENTICATION & USER MANAGEMENT SYSTEM
// ====================================================

/**
 * Check auth on page load. If a token exists in localStorage,
 * call /api/auth/me to validate. If valid, populate state.currentUser.
 * Returns true if authenticated, false otherwise.
 */
async function checkAuthOnLoad() {
  const token = localStorage.getItem('honda_auth_token');
  if (!token) {
    updateUserProfileUI();
    return false;
  }

  try {
    const res = await originalFetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) {
      localStorage.removeItem('honda_auth_token');
      updateUserProfileUI();
      return false;
    }
    const data = await res.json();
    state.currentUser = data.user;
    updateUserProfileUI();
    return true;
  } catch (err) {
    localStorage.removeItem('honda_auth_token');
    updateUserProfileUI();
    return false;
  }
}

function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'flex';
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';
  const usernameInput = document.getElementById('loginUsername');
  if (usernameInput) {
    setTimeout(() => usernameInput.focus(), 60);
  }
}

function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
  const alertBox = document.getElementById('loginAlertBox');
  if (alertBox) alertBox.style.display = 'none';
}

let isLoginFormSetup = false;

/**
 * Setup the login UI - wire up form and toggle button listeners.
 */
function setupLoginUI() {
  if (isLoginFormSetup) return;
  isLoginFormSetup = true;

  // Toggle password visibility
  const btnToggle = document.getElementById('btnToggleLoginPwd');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      const pwdInput = document.getElementById('loginPassword');
      const eyeIcon = document.getElementById('pwdEyeIcon');
      if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        btnToggle.title = 'Hide password';
        if (eyeIcon) {
          eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          `;
        }
      } else {
        pwdInput.type = 'password';
        btnToggle.title = 'Show password';
        if (eyeIcon) {
          eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          `;
        }
      }
    });
  }

  // Login form submit handler
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const alertBox = document.getElementById('loginAlertBox');
      const submitBtn = document.getElementById('btnLoginSubmit');
      const btnText = submitBtn.querySelector('.btn-text');
      const btnSpinner = submitBtn.querySelector('.btn-spinner');

      if (!username || !password) {
        if (alertBox) {
          alertBox.textContent = 'Please enter both username and password.';
          alertBox.style.display = 'block';
        }
        return;
      }

      // Show loading state
      if (btnText) btnText.textContent = 'Signing in...';
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      submitBtn.disabled = true;
      if (alertBox) alertBox.style.display = 'none';

      try {
        const res = await originalFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Login failed.');
        }

        // Save token and user
        localStorage.setItem('honda_auth_token', data.token);
        state.currentUser = data.user;
        updateUserProfileUI();

        // Hide login overlay
        hideLoginOverlay();

        // Initialize authenticated application
        await initAuthenticatedApp();

      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message;
          alertBox.style.display = 'block';
        }
      } finally {
        if (btnText) btnText.textContent = 'Sign In';
        if (btnSpinner) btnSpinner.style.display = 'none';
        submitBtn.disabled = false;
      }
    });
  }
}

/**
 * Update the top-right user profile badge with current user info.
 */
function updateUserProfileUI() {
  const u = state.currentUser;
  const wrapEl = document.getElementById('userProfileMenuWrap');
  if (!u) {
    if (wrapEl) wrapEl.style.display = 'none';
    return;
  }
  if (wrapEl) wrapEl.style.display = 'flex';

  const avatarEl = document.getElementById('userAvatarCircle');
  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userRoleBadge');
  const dropdownName = document.getElementById('dropdownUserName');
  const dropdownRole = document.getElementById('dropdownUserRole');

  const displayName = u.displayName || u.display_name || u.username || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = displayName;
  if (roleEl) {
    roleEl.textContent = u.role === 'admin' ? 'ADMIN' : 'USER';
    roleEl.className = 'user-role-badge' + (u.role === 'admin' ? ' role-admin' : ' role-user');
  }
  if (dropdownName) dropdownName.textContent = displayName;
  if (dropdownRole) dropdownRole.textContent = u.role === 'admin' ? 'System Administrator' : 'Standard User';

  // Show/hide admin-only menu items
  const btnUserMgmt = document.getElementById('btnMenuUserManagement');
  if (btnUserMgmt) {
    btnUserMgmt.style.display = u.role === 'admin' ? 'flex' : 'none';
  }
}

/**
 * Setup auth-related UI event handlers (profile dropdown, logout, etc.)
 * Called after successful auth + app init.
 */
function setupAuthUI() {
  // User Profile Dropdown Toggle
  const btnProfile = document.getElementById('btnUserProfile');
  const dropdown = document.getElementById('userProfileDropdown');
  if (btnProfile && dropdown) {
    btnProfile.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'block';
      dropdown.style.display = isOpen ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#userProfileMenuWrap')) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Logout
  const btnLogout = document.getElementById('btnMenuLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      dropdown.style.display = 'none';
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (_) { /* ignore */ }
      localStorage.removeItem('honda_auth_token');
      state.currentUser = null;
      window.location.reload();
    });
  }

  // Open User Management Modal (admin only)
  const btnUserMgmt = document.getElementById('btnMenuUserManagement');
  if (btnUserMgmt) {
    btnUserMgmt.addEventListener('click', () => {
      dropdown.style.display = 'none';
      openUserManagementModal();
    });
  }

  // Change Password Modal (self-service)
  const btnChangePwd = document.getElementById('btnMenuChangePassword');
  if (btnChangePwd) {
    btnChangePwd.addEventListener('click', () => {
      dropdown.style.display = 'none';
      openChangePasswordModal();
    });
  }

  // User Management Modal - Close buttons
  const btnCloseUM = document.getElementById('btnCloseUserManagement');
  const btnCloseUMBottom = document.getElementById('btnCloseUserManagementBottom');
  if (btnCloseUM) btnCloseUM.addEventListener('click', () => { document.getElementById('modalUserManagement').style.display = 'none'; });
  if (btnCloseUMBottom) btnCloseUMBottom.addEventListener('click', () => { document.getElementById('modalUserManagement').style.display = 'none'; });

  // User Management - Search filter
  const searchInput = document.getElementById('inputSearchUsers');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => filterUsersTable(searchInput.value), 200);
    });
  }

  // User Management - Add User button
  const btnAdd = document.getElementById('btnOpenCreateUser');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => openUserFormModal(null));
  }

  // User Form Modal - Close & Cancel
  const btnCloseUF = document.getElementById('btnCloseUserForm');
  const btnCancelUF = document.getElementById('btnCancelUserForm');
  if (btnCloseUF) btnCloseUF.addEventListener('click', () => { document.getElementById('modalUserForm').style.display = 'none'; });
  if (btnCancelUF) btnCancelUF.addEventListener('click', () => { document.getElementById('modalUserForm').style.display = 'none'; });

  // User Form - Role change toggles permission matrix visibility
  const roleSelect = document.getElementById('userFormRole');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      const isAdmin = roleSelect.value === 'admin';
      const matrixContainer = document.getElementById('stageMatrixContainer');
      const adminNotice = document.getElementById('adminFullNotice');
      const matrixTable = document.getElementById('stageMatrixTable');
      if (isAdmin) {
        if (adminNotice) adminNotice.style.display = 'flex';
        if (matrixTable) matrixTable.style.opacity = '0.4';
        if (matrixTable) matrixTable.style.pointerEvents = 'none';
      } else {
        if (adminNotice) adminNotice.style.display = 'none';
        if (matrixTable) matrixTable.style.opacity = '1';
        if (matrixTable) matrixTable.style.pointerEvents = 'auto';
      }
    });
  }

  // Permission Presets
  const btnPresetFull = document.getElementById('btnPresetFull');
  const btnPresetReadOnly = document.getElementById('btnPresetReadOnly');
  const btnPresetFloor = document.getElementById('btnPresetFloor');
  const btnPresetClear = document.getElementById('btnPresetClear');
  if (btnPresetFull) btnPresetFull.addEventListener('click', () => setPermissionPreset('full'));
  if (btnPresetReadOnly) btnPresetReadOnly.addEventListener('click', () => setPermissionPreset('readonly'));
  if (btnPresetFloor) btnPresetFloor.addEventListener('click', () => setPermissionPreset('floor'));
  if (btnPresetClear) btnPresetClear.addEventListener('click', () => setPermissionPreset('clear'));

  // User Form Submit
  const userForm = document.getElementById('userForm');
  if (userForm) {
    userForm.addEventListener('submit', handleUserFormSubmit);
  }

  // Reset Password Modal - Close & Cancel
  const btnCloseRP = document.getElementById('btnCloseResetPassword');
  const btnCancelRP = document.getElementById('btnCancelResetPassword');
  if (btnCloseRP) btnCloseRP.addEventListener('click', () => { document.getElementById('modalResetPassword').style.display = 'none'; });
  if (btnCancelRP) btnCancelRP.addEventListener('click', () => { document.getElementById('modalResetPassword').style.display = 'none'; });

  // Reset Password Form Submit
  const resetPwdForm = document.getElementById('resetPasswordForm');
  if (resetPwdForm) {
    resetPwdForm.addEventListener('submit', handleResetPasswordSubmit);
  }

  // Change Password Modal - Close & Cancel
  const btnCloseCP = document.getElementById('btnCloseChangePassword');
  const btnCancelCP = document.getElementById('btnCancelChangePassword');
  if (btnCloseCP) btnCloseCP.addEventListener('click', () => { document.getElementById('modalChangePassword').style.display = 'none'; });
  if (btnCancelCP) btnCancelCP.addEventListener('click', () => { document.getElementById('modalChangePassword').style.display = 'none'; });

  // Change Password Form Submit
  const changePwdForm = document.getElementById('changePasswordForm');
  if (changePwdForm) {
    changePwdForm.addEventListener('submit', handleChangePasswordSubmit);
  }
}

// ====================================================
// USER MANAGEMENT MODAL FUNCTIONS
// ====================================================

let _cachedUsersList = [];

async function openUserManagementModal() {
  const modal = document.getElementById('modalUserManagement');
  if (!modal) return;
  modal.style.display = 'flex';

  const tbody = document.getElementById('usersTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-subtle);">Loading users...</td></tr>';

  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Failed to load users');
    _cachedUsersList = await res.json();
    renderUsersTable(_cachedUsersList);
  } catch (err) {
    showToast('Failed to load users: ' + err.message, 'error');
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  const countEl = document.getElementById('userMgmtCount');
  if (!tbody) return;

  if (countEl) countEl.textContent = `Showing ${users.length} user${users.length !== 1 ? 's' : ''}`;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-subtle);">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    const displayName = u.display_name || u.username;
    const isActive = u.is_active === 1;
    const roleBadge = u.role === 'admin'
      ? '<span class="user-role-pill role-admin">Admin</span>'
      : '<span class="user-role-pill role-user">User</span>';
    const statusBadge = isActive
      ? '<span class="user-status-pill status-active">Active</span>'
      : '<span class="user-status-pill status-inactive">Inactive</span>';

    // Mini permissions summary
    let permsSummary = '';
    if (u.role === 'admin') {
      permsSummary = '<span class="perm-summary-admin">Full Access (All 13 Stages)</span>';
    } else {
      const perms = u.permissions || [];
      const readCount = perms.filter(p => p.can_read).length;
      const writeCount = perms.filter(p => p.can_write).length;
      const deleteCount = perms.filter(p => p.can_delete).length;
      permsSummary = `<span class="perm-summary-mini">R:${readCount} W:${writeCount} D:${deleteCount}</span>`;
    }

    tr.innerHTML = `
      <td>
        <div class="user-name-cell">
          <div class="user-avatar-sm">${displayName.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-cell-name">${escapeHtml(displayName)}</div>
            <div class="user-cell-username">@${escapeHtml(u.username)}</div>
          </div>
        </div>
      </td>
      <td>${roleBadge}</td>
      <td>${statusBadge}</td>
      <td>${permsSummary}</td>
      <td style="text-align: right;">
        <div class="user-action-btns">
          <button type="button" class="btn btn-xs btn-outline" onclick="openUserFormModal(${u.id})" title="Edit user">Edit</button>
          <button type="button" class="btn btn-xs btn-outline" onclick="openResetPasswordModal(${u.id}, '${escapeHtml(u.username)}')" title="Reset password">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 0 3 3l3.5-3.5M19 5l2 2m-4-2l2 2"></path></svg>
            <span style="margin-left:2px;">Reset</span>
          </button>
          <button type="button" class="btn btn-xs ${isActive ? 'btn-warning-outline' : 'btn-success-outline'}" onclick="toggleUserActive(${u.id}, ${isActive ? 0 : 1})" title="${isActive ? 'Deactivate' : 'Activate'}">${isActive ? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="btn btn-xs btn-danger-outline" onclick="deleteUserConfirm(${u.id}, '${escapeHtml(u.username)}')" title="Delete user">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterUsersTable(query) {
  if (!query || !query.trim()) {
    renderUsersTable(_cachedUsersList);
    return;
  }
  const q = query.toLowerCase().trim();
  const filtered = _cachedUsersList.filter(u =>
    (u.username || '').toLowerCase().includes(q) ||
    (u.display_name || '').toLowerCase().includes(q) ||
    (u.role || '').toLowerCase().includes(q)
  );
  renderUsersTable(filtered);
}

// ====================================================
// USER FORM MODAL (CREATE / EDIT)
// ====================================================

async function openUserFormModal(userId) {
  const modal = document.getElementById('modalUserForm');
  if (!modal) return;
  modal.style.display = 'flex';

  const titleEl = document.getElementById('userFormTitle');
  const usernameInput = document.getElementById('userFormUsername');
  const displayNameInput = document.getElementById('userFormDisplayName');
  const passwordInput = document.getElementById('userFormPassword');
  const passwordLabel = document.getElementById('userFormPasswordLabel');
  const passwordHint = document.getElementById('userFormPasswordHint');
  const roleSelect = document.getElementById('userFormRole');
  const activeCheckbox = document.getElementById('userFormActive');
  const idInput = document.getElementById('userFormId');
  const adminNotice = document.getElementById('adminFullNotice');
  const matrixTable = document.getElementById('stageMatrixTable');

  // Build the 13-stage permissions matrix rows
  buildStagePermissionsMatrix();

  if (userId) {
    // Edit mode
    titleEl.textContent = 'Edit User';
    passwordInput.required = false;
    passwordLabel.innerHTML = 'New Password <small>(leave blank to keep current)</small>';
    passwordHint.textContent = 'Only fill to change existing password.';

    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error('User not found');
      const user = await res.json();

      idInput.value = user.id;
      usernameInput.value = user.username;
      usernameInput.disabled = true; // Can't change username
      displayNameInput.value = user.display_name || '';
      passwordInput.value = '';
      roleSelect.value = user.role || 'user';
      activeCheckbox.checked = user.is_active === 1;

      // Load permissions
      const permRes = await fetch(`/api/users/${userId}/permissions`);
      if (permRes.ok) {
        const perms = await permRes.json();
        populatePermissionsMatrix(perms);
      }

      // Toggle admin notice
      const isAdminRole = roleSelect.value === 'admin';
      if (adminNotice) adminNotice.style.display = isAdminRole ? 'flex' : 'none';
      if (matrixTable) {
        matrixTable.style.opacity = isAdminRole ? '0.4' : '1';
        matrixTable.style.pointerEvents = isAdminRole ? 'none' : 'auto';
      }
    } catch (err) {
      showToast('Failed to load user: ' + err.message, 'error');
    }
  } else {
    // Create mode
    titleEl.textContent = 'Add New User';
    passwordInput.required = true;
    passwordLabel.innerHTML = 'Password <span class="text-danger">*</span>';
    passwordHint.textContent = 'Set initial account password.';
    idInput.value = '';
    usernameInput.value = '';
    usernameInput.disabled = false;
    displayNameInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'user';
    activeCheckbox.checked = true;

    // Clear all checkboxes
    setPermissionPreset('clear');
    if (adminNotice) adminNotice.style.display = 'none';
    if (matrixTable) {
      matrixTable.style.opacity = '1';
      matrixTable.style.pointerEvents = 'auto';
    }
  }
}
window.openUserFormModal = openUserFormModal;

function buildStagePermissionsMatrix() {
  const tbody = document.getElementById('stageMatrixTbody');
  if (!tbody) return;
  if (tbody.children.length === 13) return; // Already built

  tbody.innerHTML = '';
  const stages = state.stages || [];

  for (let i = 1; i <= 13; i++) {
    const stageDef = stages.find(s => s.id === i);
    const stageName = stageDef ? stageDef.name : `Stage ${i}`;
    const tr = document.createElement('tr');
    tr.dataset.stageId = i;
    tr.innerHTML = `
      <td>
        <div class="matrix-stage-cell">
          <span class="matrix-stage-num">#${i}</span>
          <span class="matrix-stage-name">${escapeHtml(stageName)}</span>
        </div>
      </td>
      <td style="text-align:center;">
        <label class="matrix-check-label">
          <input type="checkbox" class="perm-check perm-read" data-stage="${i}" data-perm="read">
          <span class="check-visual"></span>
        </label>
      </td>
      <td style="text-align:center;">
        <label class="matrix-check-label">
          <input type="checkbox" class="perm-check perm-write" data-stage="${i}" data-perm="write">
          <span class="check-visual"></span>
        </label>
      </td>
      <td style="text-align:center;">
        <label class="matrix-check-label">
          <input type="checkbox" class="perm-check perm-delete" data-stage="${i}" data-perm="delete">
          <span class="check-visual"></span>
        </label>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function populatePermissionsMatrix(permissions) {
  // Uncheck all first
  document.querySelectorAll('#stageMatrixTbody .perm-check').forEach(cb => { cb.checked = false; });

  if (!Array.isArray(permissions)) return;

  permissions.forEach(p => {
    const stageId = p.stage_id;
    const readCb = document.querySelector(`.perm-check[data-stage="${stageId}"][data-perm="read"]`);
    const writeCb = document.querySelector(`.perm-check[data-stage="${stageId}"][data-perm="write"]`);
    const deleteCb = document.querySelector(`.perm-check[data-stage="${stageId}"][data-perm="delete"]`);
    if (readCb) readCb.checked = p.can_read === 1 || p.can_read === true;
    if (writeCb) writeCb.checked = p.can_write === 1 || p.can_write === true;
    if (deleteCb) deleteCb.checked = p.can_delete === 1 || p.can_delete === true;
  });
}

function collectPermissionsFromMatrix() {
  const permissions = [];
  for (let i = 1; i <= 13; i++) {
    const readCb = document.querySelector(`.perm-check[data-stage="${i}"][data-perm="read"]`);
    const writeCb = document.querySelector(`.perm-check[data-stage="${i}"][data-perm="write"]`);
    const deleteCb = document.querySelector(`.perm-check[data-stage="${i}"][data-perm="delete"]`);
    permissions.push({
      stage_id: i,
      can_read: readCb ? (readCb.checked ? 1 : 0) : 0,
      can_write: writeCb ? (writeCb.checked ? 1 : 0) : 0,
      can_delete: deleteCb ? (deleteCb.checked ? 1 : 0) : 0
    });
  }
  return permissions;
}

function setPermissionPreset(preset) {
  const checkboxes = document.querySelectorAll('#stageMatrixTbody .perm-check');
  checkboxes.forEach(cb => {
    const stage = parseInt(cb.dataset.stage, 10);
    const perm = cb.dataset.perm;

    switch (preset) {
      case 'full':
        cb.checked = true;
        break;
      case 'readonly':
        cb.checked = perm === 'read';
        break;
      case 'floor':
        // Workshop Floor: Stages 6-9 full access, rest read-only
        if (stage >= 6 && stage <= 9) {
          cb.checked = true;
        } else {
          cb.checked = perm === 'read';
        }
        break;
      case 'clear':
        cb.checked = false;
        break;
    }
  });
}

async function handleUserFormSubmit(e) {
  e.preventDefault();

  const idInput = document.getElementById('userFormId');
  const userId = idInput.value ? parseInt(idInput.value, 10) : null;
  const username = document.getElementById('userFormUsername').value.trim().toLowerCase();
  const displayName = document.getElementById('userFormDisplayName').value.trim();
  const password = document.getElementById('userFormPassword').value;
  const role = document.getElementById('userFormRole').value;
  const isActive = document.getElementById('userFormActive').checked ? 1 : 0;
  const permissions = collectPermissionsFromMatrix();

  if (!username) {
    showToast('Username is required.', 'warning');
    return;
  }

  try {
    if (userId) {
      // Update existing user
      const updateRes = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, role, isActive })
      });
      if (!updateRes.ok) {
        const err = await updateRes.json();
        throw new Error(err.error || 'Failed to update user.');
      }

      // Update permissions (only for non-admin users)
      if (role !== 'admin') {
        const permRes = await fetch(`/api/users/${userId}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions })
        });
        if (!permRes.ok) {
          const err = await permRes.json();
          throw new Error(err.error || 'Failed to update permissions.');
        }
      }

      // Update password if provided
      if (password) {
        const pwdRes = await fetch(`/api/users/${userId}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: password })
        });
        if (!pwdRes.ok) {
          const err = await pwdRes.json();
          throw new Error(err.error || 'Failed to update password.');
        }
      }

      showToast(`✓ User "${username}" updated successfully.`, 'success');
    } else {
      // Create new user
      if (!password) {
        showToast('Password is required for new users.', 'warning');
        return;
      }

      const createRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName, role, isActive, permissions })
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create user.');
      }

      showToast(`✓ User "${username}" created successfully.`, 'success');
    }

    // Close form modal and refresh the users list
    document.getElementById('modalUserForm').style.display = 'none';
    openUserManagementModal(); // Refresh the list

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// TOGGLE ACTIVE / DELETE USER
// ====================================================

async function toggleUserActive(userId, newActiveState) {
  try {
    const res = await fetch(`/api/users/${userId}/toggle-active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: newActiveState })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update user status.');
    }
    showToast(`✓ User ${newActiveState ? 'activated' : 'deactivated'}.`, 'success');
    openUserManagementModal(); // Refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.toggleUserActive = toggleUserActive;

async function deleteUserConfirm(userId, username) {
  if (!await showConfirmDialog({
    title: 'Delete User Account',
    message: `Are you sure you want to permanently delete user "${username}"? This action cannot be undone.`,
    confirmText: 'Delete User'
  })) {
    return;
  }
  try {
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete user.');
    }
    showToast(`✓ User "${username}" deleted.`, 'success');
    openUserManagementModal(); // Refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.deleteUserConfirm = deleteUserConfirm;

// ====================================================
// RESET PASSWORD MODAL (ADMIN)
// ====================================================

function openResetPasswordModal(userId, username) {
  const modal = document.getElementById('modalResetPassword');
  if (!modal) return;
  modal.style.display = 'flex';

  document.getElementById('resetPasswordUserId').value = userId;
  document.getElementById('resetPasswordUserLabel').textContent = `Setting new password for @${username}`;
  document.getElementById('resetPasswordInput').value = '';
}
window.openResetPasswordModal = openResetPasswordModal;

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('resetPasswordUserId').value;
  const newPassword = document.getElementById('resetPasswordInput').value;

  if (!newPassword) {
    showToast('Please enter a new password.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reset password.');
    }
    showToast('✓ Password reset successfully.', 'success');
    document.getElementById('modalResetPassword').style.display = 'none';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ====================================================
// CHANGE PASSWORD MODAL (SELF-SERVICE)
// ====================================================

function openChangePasswordModal() {
  const modal = document.getElementById('modalChangePassword');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('changePasswordCurrent').value = '';
  document.getElementById('changePasswordNew').value = '';
  document.getElementById('changePasswordConfirm').value = '';
}

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('changePasswordCurrent').value;
  const newPassword = document.getElementById('changePasswordNew').value;
  const confirmPassword = document.getElementById('changePasswordConfirm').value;

  if (!currentPassword || !newPassword) {
    showToast('All fields are required.', 'warning');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New password and confirmation do not match.', 'warning');
    return;
  }

  if (newPassword.length < 3) {
    showToast('New password must be at least 3 characters.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to change password.');
    }
    showToast('✓ Password changed successfully. Please sign in again with your new password.', 'success');
    document.getElementById('modalChangePassword').style.display = 'none';

    // Log out after password change for security
    setTimeout(async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) { }
      localStorage.removeItem('honda_auth_token');
      state.currentUser = null;
      window.location.reload();
    }, 2000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

