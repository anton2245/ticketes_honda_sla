import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Upload, Plus, Download, Package, CheckSquare, Square, ShoppingCart, Check, X, ArrowRight, ShieldCheck, CheckCircle2, Database, AlertTriangle } from 'lucide-react';
import { fetchInventoryParts, createInventoryPart, updateInventoryPart, deleteInventoryPart, fetchPartsOrders, updatePartsOrderStatus, bulkPartsOrdersAction, uploadStockXlsx, fetchMasterCategories, importMasterCsv } from '../../api/inventory.js';
import { TableRowSkeleton } from '../../components/Skeletons.jsx';

export default function InventoryHub({ onOpenTicket }) {
  const [activeTab, setActiveTab] = useState('STOCK'); // STOCK or ORDERS

  // --- STOCK TAB STATE ---
  const [parts, setParts] = useState([]);
  const [totalParts, setTotalParts] = useState(0);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL'); // ALL, IN_STOCK, LOW_STOCK, OUT_OF_STOCK
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [categories, setCategories] = useState([]);
  const [stockPage, setStockPage] = useState(1);
  const [isLoadingParts, setIsLoadingParts] = useState(false);
  const [isNewPartModalOpen, setIsNewPartModalOpen] = useState(false);
  const [isUploadXlsxModalOpen, setIsUploadXlsxModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [isMasterImporting, setIsMasterImporting] = useState(false);
  const [masterImportResult, setMasterImportResult] = useState(null);

  // Form for New Part
  const [newPartForm, setNewPartForm] = useState({
    part_code: '',
    part_name: '',
    locators: '',
    stock_qty: 0,
    default_cost: 0,
  });

  // --- ORDERS TAB STATE ---
  const [orders, setOrders] = useState([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderFilter, setOrderFilter] = useState('ALL'); // ALL, PCA, CA, POD, ARRIVED, IA
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [isSubmittingOrderAction, setIsSubmittingOrderAction] = useState(false);

  // Load categories on mount
  useEffect(() => {
    fetchMasterCategories()
      .then(cats => setCategories(Array.isArray(cats) ? cats : []))
      .catch(() => {});
  }, []);

  // Debounce stock search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(stockSearchQuery);
      setStockPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [stockSearchQuery]);

  // Load stock catalog with dynamic limit & offset
  const PAGE_SIZE = 50;
  const loadParts = useCallback(async () => {
    setIsLoadingParts(true);
    try {
      const res = await fetchInventoryParts({
        q: debouncedSearch,
        limit: PAGE_SIZE,
        offset: (stockPage - 1) * PAGE_SIZE,
        category: categoryFilter,
        inStock: stockFilter === 'IN_STOCK'
      });
      // API returns { total, parts, limit, offset }
      if (res && typeof res === 'object' && Array.isArray(res.parts)) {
        setParts(res.parts);
        setTotalParts(res.total || res.parts.length);
      } else if (Array.isArray(res)) {
        setParts(res);
        setTotalParts(res.length);
      } else {
        setParts([]);
        setTotalParts(0);
      }
    } catch (err) {
      console.error('Failed to load inventory parts:', err);
    } finally {
      setIsLoadingParts(false);
    }
  }, [debouncedSearch, stockPage, categoryFilter, stockFilter]);

  // Load parts orders
  const loadOrders = useCallback(async () => {
    try {
      const list = await fetchPartsOrders({ q: orderSearchQuery, status: orderFilter });
      setOrders(list || []);
    } catch (err) {
      console.error('Failed to load parts orders:', err);
    }
  }, [orderSearchQuery, orderFilter]);

  useEffect(() => {
    if (activeTab === 'STOCK') {
      loadParts();
    } else {
      loadOrders();
    }
  }, [activeTab, loadParts, loadOrders]);

  // Stock filtering (client-side for stock status since server handles category)
  const filteredParts = useMemo(() => {
    return parts.filter(p => {
      if (stockFilter === 'LOW_STOCK') return (p.stock_qty || 0) > 0 && (p.stock_qty || 0) <= 3;
      if (stockFilter === 'OUT_OF_STOCK') return (p.stock_qty || 0) <= 0;
      // IN_STOCK is now sent to server via inStock param
      return true;
    });
  }, [parts, stockFilter]);

  // Stock KPI counts (from current page)
  const stockStats = useMemo(() => {
    return {
      total: totalParts,
      inStock: parts.filter(p => (p.stock_qty || 0) > 0).length,
      lowStock: parts.filter(p => (p.stock_qty || 0) > 0 && (p.stock_qty || 0) <= 3).length,
      outOfStock: parts.filter(p => (p.stock_qty || 0) <= 0).length,
    };
  }, [parts, totalParts]);

  // Orders KPI counts
  const ordersStats = useMemo(() => {
    let pca = 0, ca = 0, pod = 0, arrived = 0, ia = 0, totalSpend = 0;
    orders.forEach(o => {
      const qty = o.quantity || 1;
      const total = o.total_cost || (qty * (o.unit_cost || 0));
      totalSpend += total;
      if (o.part_status === 'ARRIVED') arrived += qty;
      if (o.part_status === 'ORDERED') pod += qty;
      if (o.customer_approval_status === 'APPROVED') ca += qty;
      if (o.customer_approval_status === 'PENDING' && !o.insurance_approved) pca += qty;
      if (o.insurance_approved) ia += qty;
    });
    return { total: orders.length, pca, ca, pod, arrived, ia, totalSpend };
  }, [orders]);

  // Handle XLSX upload
  const handleUploadXlsx = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadResult(null);
    try {
      const arrayBuffer = await uploadFile.arrayBuffer();
      const res = await uploadStockXlsx(arrayBuffer, uploadFile.name);
      setUploadResult(res);
      await loadParts();
    } catch (err) {
      alert(`Stock upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Master CSV Import
  const handleMasterCsvImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsMasterImporting(true);
    setMasterImportResult(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const res = await importMasterCsv(arrayBuffer);
      setMasterImportResult(res);
      // Refresh categories and parts
      const cats = await fetchMasterCategories();
      setCategories(Array.isArray(cats) ? cats : []);
      await loadParts();
    } catch (err) {
      alert(`Master import failed: ${err.message}`);
    } finally {
      setIsMasterImporting(false);
      e.target.value = '';
    }
  };

  // Handle Add Part submit
  const handleAddPart = async (e) => {
    e.preventDefault();
    if (!newPartForm.part_code || !newPartForm.part_name) {
      alert('Part code and name are required');
      return;
    }
    try {
      await createInventoryPart(newPartForm);
      setIsNewPartModalOpen(false);
      setNewPartForm({ part_code: '', part_name: '', locators: '', stock_qty: 0, default_cost: 0 });
      await loadParts();
    } catch (err) {
      alert(`Failed to add part: ${err.message}`);
    }
  };

  // Orders Multi-select
  const toggleSelectOrder = (id) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOrderIds(next);
  };

  const toggleSelectAllOrders = () => {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
    }
  };

  const handleBulkOrderAction = async (action) => {
    if (selectedOrderIds.size === 0) return;
    setIsSubmittingOrderAction(true);
    try {
      await bulkPartsOrdersAction(action, Array.from(selectedOrderIds));
      setSelectedOrderIds(new Set());
      await loadOrders();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setIsSubmittingOrderAction(false);
    }
  };

  const handleUpdateOrderStatus = async (id, status) => {
    try {
      await updatePartsOrderStatus(id, status);
      await loadOrders();
    } catch (err) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleExportStockCsv = () => {
    const headers = ['SKU', 'Description', 'Category', 'MRP (₹)', 'Stock Qty', 'Batch Price (₹)', 'Locators', 'Status'];
    const rows = filteredParts.map(p => [
      `"${p.sku || p.part_code || ''}"`,
      `"${p.part_name || ''}"`,
      `"${p.category_code || ''} - ${p.category_label || ''}"`,
      p.mrp || 0,
      p.stock_qty || 0,
      p.batch_price || p.default_cost || 0,
      `"${p.locators || ''}"`,
      p.stock_status || ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Honda_Master_Inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalParts / PAGE_SIZE) || 1;

  // Category badge color helper
  const catColor = (code) => {
    const colors = {
      STD: '#3b82f6', ACC: '#8b5cf6', OTH: '#6b7280', WGD: '#f59e0b',
      HLM: '#ef4444', TYR: '#10b981', LUB: '#0ea5e9', BTR: '#f97316',
      AMC: '#ec4899', EW: '#14b8a6', EHA: '#a855f7'
    };
    return colors[code] || '#6b7280';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
      {/* Top Header & Subnav */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-light)', padding: '0 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} color="var(--honda-red)" />
            <h1 style={{ fontSize: '16px', fontWeight: 800 }}>Parts Master & Inventory Hub</h1>
            {totalParts > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 600, backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>
                {totalParts.toLocaleString()} master items
              </span>
            )}
          </div>

          {/* Subtab Buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn-toggle ${activeTab === 'STOCK' ? 'active' : ''}`}
              onClick={() => setActiveTab('STOCK')}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 700 }}
            >
              Master Inventory
            </button>
            <button
              className={`btn-toggle ${activeTab === 'ORDERS' ? 'active' : ''}`}
              onClick={() => setActiveTab('ORDERS')}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 700 }}
            >
              Parts Orders Pipeline
            </button>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab === 'STOCK' ? (
              <>
                <label
                  className="btn btn-outline"
                  style={{ padding: '5px 12px', fontSize: '12px', gap: '6px', cursor: 'pointer' }}
                >
                  <Database size={13} />
                  <span>{isMasterImporting ? 'Importing...' : 'Import Master (.csv)'}</span>
                  <input
                    type="file"
                    accept=".csv"
                    style={{ display: 'none' }}
                    onChange={handleMasterCsvImport}
                    disabled={isMasterImporting}
                  />
                </label>
                <button
                  onClick={() => setIsUploadXlsxModalOpen(true)}
                  className="btn btn-outline"
                  style={{ padding: '5px 12px', fontSize: '12px', gap: '6px' }}
                >
                  <Upload size={13} />
                  <span>Update Stock (.xlsx)</span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Master Import Result Banner */}
      {masterImportResult && (
        <div style={{
          padding: '8px 20px',
          backgroundColor: 'var(--sla-green-bg)',
          color: 'var(--sla-green-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontWeight: 600
        }}>
          <CheckCircle2 size={14} />
          <span>{masterImportResult.message || `Imported ${masterImportResult.stats?.upsertedCount || 0} master parts.`}</span>
          <button onClick={() => setMasterImportResult(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', marginLeft: 'auto' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* SUBTAB 1: STOCK INVENTORY */}
      {activeTab === 'STOCK' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--border-light)',
            backgroundColor: '#fafbfc',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="input-with-icon" style={{ width: '300px' }}>
                  <Search size={14} className="search-icon-svg" />
                  <input
                    type="text"
                    value={stockSearchQuery}
                    onChange={e => setStockSearchQuery(e.target.value)}
                    placeholder="Search SKU, part name..."
                    className="form-input"
                    style={{ fontSize: '12px', height: '30px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className={`hub-chip ${stockFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setStockFilter('ALL'); setStockPage(1); }}>
                    All
                  </button>
                  <button className={`hub-chip ${stockFilter === 'IN_STOCK' ? 'active' : ''}`} onClick={() => { setStockFilter('IN_STOCK'); setStockPage(1); }} style={{ color: 'var(--sla-green-text)' }}>
                    In Stock
                  </button>
                  <button className={`hub-chip ${stockFilter === 'LOW_STOCK' ? 'active' : ''}`} onClick={() => { setStockFilter('LOW_STOCK'); setStockPage(1); }} style={{ color: 'var(--sla-amber-text)' }}>
                    Low Stock
                  </button>
                  <button className={`hub-chip ${stockFilter === 'OUT_OF_STOCK' ? 'active' : ''}`} onClick={() => { setStockFilter('OUT_OF_STOCK'); setStockPage(1); }} style={{ color: 'var(--honda-red)' }}>
                    Out of Stock
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={handleExportStockCsv} className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '12px', gap: '4px' }}>
                  <Download size={13} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Category Filter Chips */}
            {categories.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-subtle)', marginRight: '4px' }}>Category:</span>
                <button
                  className={`hub-chip ${categoryFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => { setCategoryFilter('ALL'); setStockPage(1); }}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.category_code}
                    className={`hub-chip ${categoryFilter === cat.category_code ? 'active' : ''}`}
                    onClick={() => { setCategoryFilter(cat.category_code); setStockPage(1); }}
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: catColor(cat.category_code),
                      marginRight: '4px'
                    }} />
                    {cat.category_code} ({cat.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table Container */}
          <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#ffffff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--border-medium)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '150px' }}>SKU</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Description</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '90px' }}>Category</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '100px', textAlign: 'right' }}>MRP (₹)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '80px', textAlign: 'center' }}>Stock</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '100px', textAlign: 'right' }}>Batch Price</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '140px' }}>Locators</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: '80px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingParts ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <TableRowSkeleton key={i} cols={8} />
                  ))
                ) : filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                      No parts found matching search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredParts.map((part, idx) => {
                    const qty = part.stock_qty || 0;
                    const isOut = qty <= 0;
                    const isLow = !isOut && qty <= 3;
                    const mrpVal = Number(part.mrp || 0);
                    const batchPrice = Number(part.batch_price || part.default_cost || 0);
                    return (
                      <tr
                        key={part.id || idx}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafbfc',
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '11.5px' }}>
                          {part.sku || part.part_code || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {part.part_name}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {part.category_code ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: catColor(part.category_code),
                              backgroundColor: `${catColor(part.category_code)}15`,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {part.category_code}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }}>
                          {mrpVal > 0 ? `₹${mrpVal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                          {qty}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: batchPrice > 0 ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                          {batchPrice > 0 ? `₹${batchPrice.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                          {part.locators ? (
                            <span style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                              {part.locators}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: isOut ? 'var(--sla-red-bg)' : (isLow ? 'var(--sla-amber-bg)' : 'var(--sla-green-bg)'),
                            color: isOut ? 'var(--sla-red-text)' : (isLow ? 'var(--sla-amber-text)' : 'var(--sla-green-text)'),
                          }}>
                            {isOut ? 'OUT' : (isLow ? 'LOW' : 'IN STOCK')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border-light)',
            backgroundColor: '#fafbfc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>
              Page {stockPage} of {totalPages} • Showing {filteredParts.length} of {totalParts.toLocaleString()} master items
              {categoryFilter !== 'ALL' && ` • Category: ${categoryFilter}`}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-outline btn-xs"
                disabled={stockPage <= 1 || isLoadingParts}
                onClick={() => setStockPage(p => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn btn-outline btn-xs"
                disabled={stockPage >= totalPages || isLoadingParts}
                onClick={() => setStockPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: PARTS ORDERS PIPELINE */}
      {activeTab === 'ORDERS' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* KPI Ribbon */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid var(--border-light)',
            overflowX: 'auto',
          }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 600 }}>Total Demanded:</span>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>{ordersStats.total} items</div>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-light)' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'var(--sla-green-text)', fontWeight: 600 }}>Insurance Approved:</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--sla-green-text)' }}>{ordersStats.ia}</div>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-light)' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'var(--sla-amber-text)', fontWeight: 600 }}>Pending Cust. (PCA):</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--sla-amber-text)' }}>{ordersStats.pca}</div>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-light)' }} />
            <div>
              <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>Cust. Approved (CA):</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#7c3aed' }}>{ordersStats.ca}</div>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-light)' }} />
            <div>
              <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>Awaiting Arrival (POD):</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0284c7' }}>{ordersStats.pod}</div>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-light)' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'var(--sla-green-text)', fontWeight: 600 }}>Arrived:</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--sla-green-text)' }}>{ordersStats.arrived}</div>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-light)' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 600 }}>Total Order Value:</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--honda-red)' }}>
                ₹{ordersStats.totalSpend.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Orders Filter Toolbar */}
          <div style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--border-light)',
            backgroundColor: '#fafbfc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="input-with-icon" style={{ width: '280px' }}>
                <Search size={14} className="search-icon-svg" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={e => setOrderSearchQuery(e.target.value)}
                  placeholder="Search part, ticket #, customer..."
                  className="form-input"
                  style={{ fontSize: '12px', height: '30px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button className={`hub-chip ${orderFilter === 'ALL' ? 'active' : ''}`} onClick={() => setOrderFilter('ALL')}>All Orders</button>
                <button className={`hub-chip ${orderFilter === 'PCA' ? 'active' : ''}`} onClick={() => setOrderFilter('PCA')}>PCA (Pending Cust.)</button>
                <button className={`hub-chip ${orderFilter === 'CA' ? 'active' : ''}`} onClick={() => setOrderFilter('CA')}>CA (Cust. Approved)</button>
                <button className={`hub-chip ${orderFilter === 'POD' ? 'active' : ''}`} onClick={() => setOrderFilter('POD')}>POD (Awaiting)</button>
                <button className={`hub-chip ${orderFilter === 'ARRIVED' ? 'active' : ''}`} onClick={() => setOrderFilter('ARRIVED')}>Arrived</button>
                <button className={`hub-chip ${orderFilter === 'IA' ? 'active' : ''}`} onClick={() => setOrderFilter('IA')}>Insurance Approved</button>
              </div>
            </div>

            {/* Bulk actions */}
            {selectedOrderIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-subtle)' }}>
                  {selectedOrderIds.size} selected
                </span>
                <button
                  disabled={isSubmittingOrderAction}
                  onClick={() => handleBulkOrderAction('CUSTOMER_APPROVE')}
                  className="btn btn-outline"
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  Cust. Approve
                </button>
                <button
                  disabled={isSubmittingOrderAction}
                  onClick={() => handleBulkOrderAction('INSURANCE_APPROVE')}
                  className="btn btn-outline"
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  Insurance Approve
                </button>
                <button
                  disabled={isSubmittingOrderAction}
                  onClick={() => handleBulkOrderAction('MARK_ARRIVED')}
                  className="btn btn-primary"
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  Mark Arrived
                </button>
              </div>
            )}
          </div>

          {/* Orders Table */}
          <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#ffffff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--border-medium)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ width: '40px', textAlign: 'center', padding: '10px 8px' }}>
                    <button
                      type="button"
                      onClick={toggleSelectAllOrders}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                    >
                      {selectedOrderIds.size > 0 && selectedOrderIds.size === orders.length ? (
                        <CheckSquare size={16} color="var(--honda-red)" />
                      ) : (
                        <Square size={16} color="var(--text-subtle)" />
                      )}
                    </button>
                  </th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Part Item</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, width: '120px' }}>Ticket #</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Vehicle & Customer</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, width: '60px', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, width: '90px', textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, width: '90px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, width: '140px' }}>Approval Coverage</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, width: '120px' }}>Order Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right', width: '110px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                      No parts orders found matching criteria.
                    </td>
                  </tr>
                ) : (
                  orders.map((order, idx) => {
                    const isSelected = selectedOrderIds.has(order.id);
                    const qty = order.quantity || 1;
                    const total = order.total_cost || (qty * (order.unit_cost || 0));
                    return (
                      <tr
                        key={order.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#fafbfc'),
                        }}
                      >
                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                          <button
                            type="button"
                            onClick={() => toggleSelectOrder(order.id)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                          >
                            {isSelected ? <CheckSquare size={15} color="var(--honda-red)" /> : <Square size={15} color="var(--text-subtle)" />}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700 }}>{order.part_name}</div>
                          {order.part_code && <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>{order.part_code}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--honda-red)' }}>
                          {order.ticket_number}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600 }}>{order.vehicle_no || 'Unregistered'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.customer_name}</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>
                          {qty}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          ₹{Number(order.unit_cost || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                          ₹{Number(total).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {order.insurance_approved ? (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sla-green-text)', backgroundColor: 'var(--sla-green-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                              Insurance Approved
                            </span>
                          ) : order.customer_approval_status === 'APPROVED' ? (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f3e8ff', padding: '2px 6px', borderRadius: '4px' }}>
                              Cust. Approved (CA)
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sla-amber-text)', backgroundColor: 'var(--sla-amber-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                              PCA Pending
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: order.part_status === 'ARRIVED' ? 'var(--sla-green-bg)' : '#e0f2fe',
                            color: order.part_status === 'ARRIVED' ? 'var(--sla-green-text)' : '#0369a1',
                          }}>
                            {order.part_status || 'PENDING'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {order.part_status !== 'ARRIVED' ? (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'ARRIVED')}
                              className="btn btn-primary"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                            >
                              Arrived
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--sla-green-text)', fontWeight: 600 }}>✓ Verified</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload XLSX Modal */}
      {isUploadXlsxModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadXlsxModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: uploadResult?.stats?.rejectedCount > 0 ? '700px' : '480px', maxWidth: '95vw', transition: 'width 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Update Physical Stock (.xlsx)</h3>
              <button onClick={() => setIsUploadXlsxModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleUploadXlsx}>
              <div style={{ border: '2px dashed var(--border-medium)', borderRadius: '8px', padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', marginBottom: '16px' }}>
                <Upload size={30} color="var(--honda-red)" style={{ margin: '0 auto 6px auto' }} />
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  Choose or drag Honda warehouse stock spreadsheet (.xlsx)
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '10px' }}>
                  Matches parts against authoritative <code>parts_master</code>. Uncataloged SKUs will be rejected.
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  required
                  onChange={e => setUploadFile(e.target.files[0])}
                  style={{ fontSize: '12px' }}
                />
              </div>

              {uploadResult && (
                <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{
                    padding: '12px',
                    backgroundColor: 'var(--sla-green-bg)',
                    border: '1px solid var(--sla-green-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--sla-green-text)'
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                      ✓ Physical Stock Synchronized Successfully
                    </div>
                    {uploadResult.stats && (
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11.5px', marginTop: '4px' }}>
                        <span>Total Rows: <strong>{uploadResult.stats.totalRows?.toLocaleString()}</strong></span>
                        <span>Accepted: <strong>{uploadResult.stats.acceptedRows?.toLocaleString()}</strong></span>
                        <span>Unique Master Parts: <strong>{uploadResult.stats.uniqueParts?.toLocaleString()}</strong></span>
                        <span>Total Units: <strong>{uploadResult.stats.totalQuantity?.toLocaleString()}</strong></span>
                      </div>
                    )}
                  </div>

                  {uploadResult.stats?.rejectedCount > 0 && (
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#991b1b'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                          <AlertTriangle size={15} color="#dc2626" />
                          <span>{uploadResult.stats.rejectedCount} SKUs Rejected (Not in parts_master)</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          style={{ borderColor: '#fca5a5', color: '#991b1b', fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => {
                            const csvHeader = 'SKU,Description,Quantity,Unit Price,Locator,Reason\n';
                            const csvRows = (uploadResult.stats.rejectedSkus || []).map(r =>
                              `"${(r.sku || '').replace(/"/g, '""')}","${(r.description || '').replace(/"/g, '""')}",${r.quantity},${r.unit_price},"${(r.locator || '').replace(/"/g, '""')}","${r.reason}"`
                            ).join('\n');
                            const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `rejected_stock_skus_${Date.now()}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          <Download size={11} />
                          <span>Export Rejected (.csv)</span>
                        </button>
                      </div>
                      <p style={{ fontSize: '11px', color: '#7f1d1d', margin: '0 0 8px 0' }}>
                        These SKUs were rejected and excluded from inventory because they are not cataloged in <code>parts_master</code>:
                      </p>
                      <div style={{
                        maxHeight: '180px',
                        overflowY: 'auto',
                        border: '1px solid #fee2e2',
                        borderRadius: '4px',
                        backgroundColor: '#ffffff'
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#fff5f5', borderBottom: '1px solid #fee2e2', textAlign: 'left', color: '#991b1b' }}>
                              <th style={{ padding: '6px 8px', width: '28%' }}>SKU / Part #</th>
                              <th style={{ padding: '6px 8px', width: '36%' }}>Description</th>
                              <th style={{ padding: '6px 8px', width: '12%', textAlign: 'center' }}>Qty</th>
                              <th style={{ padding: '6px 8px', width: '24%' }}>Locator</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(uploadResult.stats.rejectedSkus || []).map((rej, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #fef2f2' }}>
                                <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#b91c1c' }}>
                                  {rej.sku}
                                </td>
                                <td style={{ padding: '5px 8px', color: '#374151' }}>
                                  {rej.description || '—'}
                                </td>
                                <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600, color: '#b91c1c' }}>
                                  {rej.quantity}
                                </td>
                                <td style={{ padding: '5px 8px', color: '#6b7280' }}>
                                  {rej.locator || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsUploadXlsxModalOpen(false)} className="btn btn-outline">Close</button>
                <button type="submit" disabled={isUploading} className="btn btn-primary">
                  {isUploading ? 'Processing...' : 'Upload & Sync'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {isNewPartModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewPartModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Add Part to Inventory</h3>
              <button onClick={() => setIsNewPartModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleAddPart}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Part Number / SKU *</label>
                <input
                  type="text"
                  required
                  value={newPartForm.part_code}
                  onChange={e => setNewPartForm({ ...newPartForm, part_code: e.target.value.toUpperCase() })}
                  className="form-input"
                  placeholder="e.g. 45022-TG0-T00"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Description / Part Name *</label>
                <input
                  type="text"
                  required
                  value={newPartForm.part_name}
                  onChange={e => setNewPartForm({ ...newPartForm, part_name: e.target.value })}
                  className="form-input"
                  placeholder="e.g. FRONT BRAKE PAD SET"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Rack / Bin Locators</label>
                <input
                  type="text"
                  value={newPartForm.locators}
                  onChange={e => setNewPartForm({ ...newPartForm, locators: e.target.value })}
                  className="form-input"
                  placeholder="e.g. RACK-B2-SHELF-4"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Initial Stock Quantity</label>
                  <input
                    type="number"
                    min={0}
                    value={newPartForm.stock_qty}
                    onChange={e => setNewPartForm({ ...newPartForm, stock_qty: Number(e.target.value) })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Unit Price (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={newPartForm.default_cost}
                    onChange={e => setNewPartForm({ ...newPartForm, default_cost: Number(e.target.value) })}
                    className="form-input"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsNewPartModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Part</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
