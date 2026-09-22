import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  ShoppingCart,
  Package,
  Clock,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  Warehouse,
  Check,
  ArrowRight,
  Layers,
  PlusCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { request } from '../../api/client.js';
import { lookupParts } from '../../api/parts.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';

export default function Stage6PartsOrderModal({
  ticket,
  onClose,
  onSubmit,
  onSaved,
  isStandalone = false,
  isSubmitting = false,
}) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab state: 'all' vs 'customer_approved'
  const [activeTab, setActiveTab] = useState('all');

  // Row-level edit state: { [partId]: { orderQty: number, purchaseId: string, error: string, success: boolean } }
  const [rowOrders, setRowOrders] = useState({});
  const [submittingRowId, setSubmittingRowId] = useState(null);
  const [procuringRowId, setProcuringRowId] = useState(null);

  // Inline "New Order Item" form state in Tab 2
  const [isNewPartFormOpen, setIsNewPartFormOpen] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartQty, setNewPartQty] = useState(1);
  const [newPartCost, setNewPartCost] = useState('');
  const [newPartPo, setNewPartPo] = useState('');
  const [isAddingNewPart, setIsAddingNewPart] = useState(false);
  const [newPartError, setNewPartError] = useState(null);
  const [newPartSuccess, setNewPartSuccess] = useState(false);

  // Autocomplete state for new part search dropdown
  const [newPartSuggestions, setNewPartSuggestions] = useState([]);
  const [showNewPartDropdown, setShowNewPartDropdown] = useState(false);
  const newPartDebounceRef = useRef(null);
  const newPartQtyInputRef = useRef(null);

  const handlePartSearchChange = (val) => {
    setNewPartName(val);
    setNewPartError(null);

    clearTimeout(newPartDebounceRef.current);
    if (!val.trim()) {
      setNewPartSuggestions([]);
      setShowNewPartDropdown(false);
      return;
    }

    newPartDebounceRef.current = setTimeout(async () => {
      try {
        const list = await lookupParts(val);
        setNewPartSuggestions(list || []);
        setShowNewPartDropdown(true);
      } catch {
        setNewPartSuggestions([]);
      }
    }, 150);
  };

  const handleSelectNewPartSuggestion = (s) => {
    const sMrp = Number(s.mrp || 0);
    const chosenCost = sMrp > 0 ? sMrp : Number(s.default_cost || 0);

    setNewPartName(s.part_name);
    setNewPartCode(s.part_code || s.sku || '');
    setNewPartCost(chosenCost > 0 ? String(chosenCost) : '');
    setShowNewPartDropdown(false);

    if (newPartQtyInputRef.current) {
      newPartQtyInputRef.current.focus();
      newPartQtyInputRef.current.select();
    }
  };

  // Load ticket parts with real-time warehouse stock and approval status
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    request(`/api/tickets/${ticket.id}/parts`)
      .then((data) => {
        if (!active) return;
        const fetchedParts = Array.isArray(data) ? data : (data?.parts || []);
        setParts(fetchedParts);

        // Initialize row order state
        const initial = {};
        fetchedParts.forEach((p) => {
          const reqQty = Number(p.quantity) || 1;
          const stockQty = Number(p.stock_qty) || 0;
          const alreadyOrdered = Number(p.ordered_qty) || 0;
          const isOrdered = (p.part_status || '').toUpperCase() === 'ORDERED';

          let defaultOrderQty = reqQty;
          if (isOrdered && alreadyOrdered > 0) {
            defaultOrderQty = alreadyOrdered;
          } else if (stockQty > 0 && stockQty < reqQty) {
            defaultOrderQty = reqQty - stockQty;
          }

          initial[p.id] = {
            orderQty: defaultOrderQty,
            purchaseId: p.purchase_id || '',
            error: null,
            success: false,
          };
        });
        setRowOrders(initial);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to fetch parts for Order modal:', err);
        setError('Failed to load parts breakdown. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ticket.id]);

  // Handle row-level field change
  const handleRowChange = (partId, field, val) => {
    setRowOrders((prev) => ({
      ...prev,
      [partId]: {
        ...prev[partId],
        [field]: val,
        error: field === 'purchaseId' && String(val).trim() ? null : prev[partId]?.error,
      },
    }));
  };

  // Single-row Order button click
  const handleOrderSingleRow = async (part) => {
    const row = rowOrders[part.id] || {};
    const purchaseId = (row.purchaseId || '').trim();
    const orderQty = Math.max(1, Number(row.orderQty) || 1);

    // Mandatory Purchase ID validation
    if (!purchaseId) {
      setRowOrders((prev) => ({
        ...prev,
        [part.id]: {
          ...prev[part.id],
          error: 'Purchase ID is mandatory',
        },
      }));
      return;
    }

    setSubmittingRowId(part.id);
    try {
      const res = await request(`/api/tickets/${ticket.id}/parts/${part.id}/order`, {
        method: 'POST',
        body: JSON.stringify({
          orderQty,
          purchaseId,
          notes: `PO #${purchaseId}`,
          expectedArrivalDate: ticket.expected_parts_arrival_date || null,
        }),
      });

      if (res && res.parts) {
        setParts(res.parts);
      } else if (res && res.part) {
        setParts((prev) => prev.map((p) => (p.id === part.id ? res.part : p)));
      }

      setRowOrders((prev) => ({
        ...prev,
        [part.id]: {
          ...prev[part.id],
          purchaseId,
          orderQty,
          error: null,
          success: true,
        },
      }));

      setTimeout(() => {
        setRowOrders((prev) => ({
          ...prev,
          [part.id]: {
            ...prev[part.id],
            success: false,
          },
        }));
      }, 3000);
    } catch (err) {
      setRowOrders((prev) => ({
        ...prev,
        [part.id]: {
          ...prev[part.id],
          error: err.message || 'Order failed',
        },
      }));
    } finally {
      setSubmittingRowId(null);
    }
  };

  // Procure single part directly from warehouse stock
  const handleProcureFromStock = async (part) => {
    const row = rowOrders[part.id] || {};
    const stockCount = Number(part.stock_qty) || 0;
    const reqQty = Math.max(1, Number(row.orderQty) || Number(part.quantity) || 1);

    if (stockCount <= 0) {
      if (!window.confirm(`Current registered warehouse inventory for "${part.master_part_name || part.part_name}" is 0. Do you still want to mark this item as procured from stock?`)) {
        return;
      }
    }

    setProcuringRowId(part.id);
    try {
      const res = await request(`/api/tickets/${ticket.id}/parts/${part.id}/procure-stock`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: reqQty,
        }),
      });

      if (res && res.parts) {
        setParts(res.parts);
      }
      setRowOrders((prev) => ({
        ...prev,
        [part.id]: {
          ...prev[part.id],
          error: null,
          success: true,
          purchaseId: 'STOCK',
        },
      }));
      if (onSaved) onSaved();
    } catch (err) {
      setRowOrders((prev) => ({
        ...prev,
        [part.id]: {
          ...prev[part.id],
          error: err.message || 'Failed to procure from stock',
        },
      }));
    } finally {
      setProcuringRowId(null);
    }
  };

  // Add brand new part & place order (Tab 2: New Order)
  const handleAddNewPartOrder = async (e) => {
    e.preventDefault();
    setNewPartError(null);

    const name = newPartName.trim();
    if (!name) {
      setNewPartError('Part name / description is required.');
      return;
    }

    const purchaseId = (newPartPo || '').trim();
    if (!purchaseId) {
      setNewPartError('Purchase ID is mandatory to place an order.');
      return;
    }

    const qty = Math.max(1, Number(newPartQty) || 1);
    const cost = Math.max(0, Number(newPartCost) || 0);

    setIsAddingNewPart(true);
    try {
      const res = await request(`/api/tickets/${ticket.id}/parts/add`, {
        method: 'POST',
        body: JSON.stringify({
          part_name: name,
          part_code: newPartCode.trim() || null,
          quantity: qty,
          unit_cost: cost,
          purchase_id: purchaseId,
          part_status: 'ORDERED',
          notes: 'Ordered via New Order form',
        }),
      });

      if (res && res.parts) {
        setParts(res.parts);
        // Initialize newly added part in rowOrders
        const addedPart = res.part;
        if (addedPart) {
          setRowOrders((prev) => ({
            ...prev,
            [addedPart.id]: {
              orderQty: qty,
              purchaseId,
              error: null,
              success: true,
            },
          }));
        }
      }

      setNewPartName('');
      setNewPartCode('');
      setNewPartQty(1);
      setNewPartCost('');
      setNewPartPo('');
      setShowNewPartDropdown(false);
      setNewPartSuggestions([]);
      setNewPartSuccess(true);
      setTimeout(() => setNewPartSuccess(false), 3000);
    } catch (err) {
      setNewPartError(err.message || 'Failed to add and order part.');
    } finally {
      setIsAddingNewPart(false);
    }
  };

  // Submit and Advance Ticket to Stage 6 (or Close if standalone)
  const handleFinalSubmit = (e) => {
    e.preventDefault();

    if (isStandalone) {
      if (onSaved) onSaved();
      onClose();
      return;
    }

    // Only include parts in orders that have an explicit row-level purchaseId entered/saved
    const orders = parts
      .map((p) => {
        const row = rowOrders[p.id] || {};
        const purchaseId = (row.purchaseId || '').trim();
        return {
          partId: p.id,
          orderQty: Math.max(1, Number(row.orderQty) || Number(p.quantity) || 1),
          purchaseId,
        };
      })
      .filter((o) => o.purchaseId);

    onSubmit({
      targetStageId: 6,
      poNumber: orders[0]?.purchaseId || ticket.po_number || null,
      purchaseId: orders[0]?.purchaseId || ticket.po_number || null,
      expectedArrivalDate: ticket.expected_parts_arrival_date || null,
      notes: orders[0]?.purchaseId ? `PO #${orders[0].purchaseId}` : '',
      orders,
    });
  };

  // Filter parts for the active tab
  const caParts = parts.filter(
    (p) =>
      (p.customer_approval_status || '').toUpperCase() === 'APPROVED' ||
      Number(p.customer_approved_qty) > 0
  );

  const displayedParts = activeTab === 'customer_approved' ? caParts : parts;


  return (
    <DesktopWindow
      title={`${isStandalone ? 'Parts Procurement & Ordering' : 'Stage 6: Place Replacement Parts Order'} — ${ticket?.vehicle_plate || ''}`}
      icon={ShoppingCart}
      onClose={onClose}
      defaultWidth="960px"
      defaultHeight="680px"
    >
      <div className="modal-header" style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-light)' }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            backgroundColor: isStandalone ? '#0284c7' : '#ea580c',
            color: '#ffffff',
            fontSize: '10.5px',
            padding: '2px 7px',
            borderRadius: '4px',
            fontWeight: 800,
            letterSpacing: '0.5px'
          }}>
            {isStandalone ? 'ORDER' : 'STAGE 6'}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
            {isStandalone ? 'Order Parts' : 'Place Replacement Parts Order'}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 500 }}>
            — {ticket.vehicle_plate} ({ticket.model || ticket.vehicle_model || 'Honda'})
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleFinalSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Order Navigation Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '2px solid #e2e8f0',
            paddingBottom: '2px',
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: activeTab === 'all' ? '#ea580c' : '#64748b',
                borderBottom: activeTab === 'all' ? '2.5px solid #ea580c' : '2.5px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.15s ease',
              }}
            >
              <Package size={16} color={activeTab === 'all' ? '#ea580c' : '#64748b'} />
              <span>All Items / Estimation</span>
              <span style={{
                fontSize: '11px',
                backgroundColor: activeTab === 'all' ? '#ffedd5' : '#f1f5f9',
                color: activeTab === 'all' ? '#c2410c' : '#64748b',
                padding: '1px 7px',
                borderRadius: '10px',
                fontWeight: 700,
              }}>
                {parts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('customer_approved')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: activeTab === 'customer_approved' ? '#047857' : '#64748b',
                borderBottom: activeTab === 'customer_approved' ? '2.5px solid #059669' : '2.5px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.15s ease',
              }}
            >
              <UserCheck size={16} color={activeTab === 'customer_approved' ? '#059669' : '#64748b'} />
              <span>Customer Approved</span>
              <span style={{
                fontSize: '11px',
                backgroundColor: activeTab === 'customer_approved' ? '#d1fae5' : '#f1f5f9',
                color: activeTab === 'customer_approved' ? '#065f46' : '#64748b',
                padding: '1px 7px',
                borderRadius: '10px',
                fontWeight: 700,
              }}>
                {caParts.length}
              </span>
            </button>
          </div>



          {/* Quick "Add New Part Item to Order" in Tab (All Items) */}
          {activeTab === 'all' && (
            <div style={{
              backgroundColor: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                onClick={() => setIsNewPartFormOpen(prev => !prev)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusCircle size={15} color="#ea580c" />
                  <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#9a3412' }}>
                    + Add New Part Item to Order
                  </span>
                  <span style={{ fontSize: '11px', color: '#c2410c' }}>
                    (Order additional parts directly on this ticket)
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsNewPartFormOpen(prev => !prev);
                  }}
                >
                  {isNewPartFormOpen ? <ChevronUp size={15} color="#9a3412" /> : <ChevronDown size={15} color="#9a3412" />}
                </button>
              </div>

              {isNewPartFormOpen && (
                <div style={{ marginTop: '12px', borderTop: '1px dashed #fdba74', paddingTop: '10px' }}>
                  {newPartError && (
                    <div style={{
                      padding: '8px 12px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '5px',
                      color: '#991b1b',
                      fontSize: '11.5px',
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <AlertCircle size={14} />
                      <span>{newPartError}</span>
                    </div>
                  )}

                  {newPartSuccess && (
                    <div style={{
                      padding: '8px 12px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '5px',
                      color: '#166534',
                      fontSize: '11.5px',
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Check size={14} />
                      <span>Part added and order recorded successfully!</span>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.6fr 0.8fr 1.2fr auto', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={{ position: 'relative' }}>
                      <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#9a3412', display: 'block', marginBottom: '3px' }}>
                        Part Name / Description <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Search master SKU or enter description..."
                        value={newPartName}
                        onChange={(e) => handlePartSearchChange(e.target.value)}
                        onFocus={() => { if (newPartSuggestions.length > 0) setShowNewPartDropdown(true); }}
                        onBlur={() => setTimeout(() => setShowNewPartDropdown(false), 200)}
                        style={{ fontSize: '12px', backgroundColor: '#ffffff' }}
                      />

                      {/* Dropdown Suggestions */}
                      {showNewPartDropdown && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: '#ffffff',
                          border: '1px solid var(--border-medium)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow: 'var(--shadow-lg)',
                          maxHeight: '220px',
                          overflowY: 'auto',
                          zIndex: 50,
                        }}>
                          {newPartSuggestions.length > 0 ? (
                            newPartSuggestions.map((s, idx) => {
                              const sMrp = Number(s.mrp || 0);
                              const displayPrice = sMrp > 0 ? sMrp : Number(s.default_cost || 0);
                              const stockQty = Number(s.stock_qty || 0);

                              return (
                                <div
                                  key={s.id || idx}
                                  onMouseDown={() => handleSelectNewPartSuggestion(s)}
                                  style={{
                                    padding: '8px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                                >
                                  <div>
                                    <span style={{ fontWeight: 700, color: 'var(--text-main)', marginRight: '6px', fontFamily: 'var(--font-mono)' }}>
                                      {s.part_code || s.sku || 'SKU'}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)' }}>{s.part_name}</span>
                                    {s.category_code && (
                                      <span style={{
                                        marginLeft: '6px',
                                        fontSize: '9px',
                                        color: 'var(--text-subtle)',
                                        backgroundColor: '#f1f5f9',
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        fontWeight: 600
                                      }}>
                                        {s.category_code}
                                      </span>
                                    )}
                                    {stockQty > 0 ? (
                                      <span style={{
                                        marginLeft: '6px',
                                        fontSize: '9.5px',
                                        color: '#047857',
                                        backgroundColor: '#ecfdf5',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        fontWeight: 600
                                      }}>
                                        Stock: {stockQty}
                                      </span>
                                    ) : (
                                      <span style={{
                                        marginLeft: '6px',
                                        fontSize: '9.5px',
                                        color: '#94a3b8',
                                        backgroundColor: '#f8fafc',
                                        padding: '1px 4px',
                                        borderRadius: '3px'
                                      }}>
                                        Nil
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono)', marginLeft: '10px', whiteSpace: 'nowrap' }}>
                                    ₹{displayPrice.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ padding: '8px 10px', color: 'var(--text-subtle)', fontStyle: 'italic', fontSize: '11.5px' }}>
                              No matching catalog items. Custom part will be created.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#9a3412', display: 'block', marginBottom: '3px' }}>
                        Part Number / SKU
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 71501-TEA-Z00"
                        value={newPartCode}
                        onChange={(e) => setNewPartCode(e.target.value)}
                        style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#9a3412', display: 'block', marginBottom: '3px' }}>
                        Qty <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        ref={newPartQtyInputRef}
                        type="number"
                        className="form-input"
                        min="1"
                        value={newPartQty}
                        onChange={(e) => setNewPartQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        style={{ fontSize: '12px', textAlign: 'center', backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#9a3412', display: 'block', marginBottom: '3px' }}>
                        Unit Price (₹)
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        min="0"
                        placeholder="0"
                        value={newPartCost}
                        onChange={(e) => setNewPartCost(e.target.value)}
                        style={{ fontSize: '12px', backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#9a3412', display: 'block', marginBottom: '3px' }}>
                        Purchase ID <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. PO-9482"
                        value={newPartPo}
                        onChange={(e) => setNewPartPo(e.target.value)}
                        style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleAddNewPartOrder}
                        disabled={isAddingNewPart}
                        style={{
                          backgroundColor: '#ea580c',
                          borderColor: '#ea580c',
                          height: '34px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <PlusCircle size={14} />
                        <span>{isAddingNewPart ? 'Adding...' : 'Add & Order'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Parts Table Breakdown */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <div style={{
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} color="#64748b" />
                <span>
                  {activeTab === 'customer_approved'
                    ? `Approved Parts (${caParts.length})`
                    : `All Replacement Parts (${parts.length})`}
                </span>
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                Purchasers can specify custom order quantities per row
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>
                <div className="spinner" style={{ margin: '0 auto 10px', width: '22px', height: '22px' }}></div>
                <div style={{ fontSize: '12px' }}>Loading parts inventory & approval records...</div>
              </div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#b91c1c', backgroundColor: '#fef2f2' }}>
                <AlertCircle size={18} style={{ marginBottom: '6px' }} />
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{error}</div>
              </div>
            ) : displayedParts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                {activeTab === 'customer_approved' ? (
                  <>
                    <UserCheck size={28} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                      No customer approved items on this ticket yet.
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px', marginBottom: '12px' }}>
                      Customer authorization is completed in Stage 5 (Approval). You can switch to All Items to view and procure all estimated parts.
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      onClick={() => setActiveTab('all')}
                      style={{ margin: '0 auto' }}
                    >
                      <Package size={12} />
                      <span>Switch to All Items ({parts.length} items)</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Package size={28} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>No parts recorded on this ticket</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      You can add custom parts above using "+ Add New Part Item to Order".
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '330px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px', width: '220px' }}>Part Details</th>
                      <th style={{ padding: '8px 8px', width: '65px', textAlign: 'center' }}>Req Qty</th>
                      <th style={{ padding: '8px 10px', width: '135px' }}>Approval Status</th>
                      <th style={{ padding: '8px 10px', width: '115px' }}>Stock Avail.</th>
                      <th style={{ padding: '8px 8px', width: '90px', textAlign: 'center' }}>Order Qty</th>
                      <th style={{ padding: '8px 10px', width: '145px' }}>
                        Purchase ID <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
                      </th>
                      <th style={{ padding: '8px 12px', width: '120px', textAlign: 'right' }}>Action / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedParts.map((p) => {
                      const row = rowOrders[p.id] || {};
                      const isOrdered = (p.part_status || '').toUpperCase() === 'ORDERED';
                      const isArrived = (p.part_status || '').toUpperCase() === 'ARRIVED';
                      const isStockProcured = isArrived && ((p.purchase_id || '').toUpperCase() === 'STOCK' || (p.notes || '').includes('Procured from stock'));
                      const stockCount = Number(p.stock_qty) || 0;
                      const hasStock = stockCount > 0;
                      const reqQty = Number(p.quantity) || 1;

                      // Approval state
                      const isInsApproved = Boolean(p.insurance_approved) || Number(p.insurance_approved_qty) > 0;
                      const isCustApproved = !isInsApproved && (
                        (p.customer_approval_status || '').toUpperCase() === 'APPROVED' ||
                        Number(p.customer_approved_qty) > 0
                      );

                      const isSubmittingThisRow = submittingRowId === p.id;
                      const isProcuringThisRow = procuringRowId === p.id;
                      const hasRowError = Boolean(row.error);

                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: hasRowError ? '#fef2f2' : isOrdered ? '#f0fdf4' : '#ffffff',
                            transition: 'background-color 0.12s ease'
                          }}
                        >
                          {/* Part Details */}
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.25 }}>
                              {p.master_part_name || p.part_name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                                {p.part_code || '—'}
                              </span>
                              {p.category_code && (
                                <span style={{
                                  fontSize: '9.5px',
                                  backgroundColor: '#f1f5f9',
                                  color: '#475569',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontWeight: 600
                                }}>
                                  {p.category_code}
                                </span>
                              )}
                              <span style={{ fontSize: '10.5px', color: 'var(--text-subtle)' }}>
                                ₹{Number(p.unit_cost || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                          </td>

                          {/* Req Qty */}
                          <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px' }}>
                            {reqQty}
                          </td>

                          {/* Approval Status */}
                          <td style={{ padding: '8px 10px' }}>
                            {isInsApproved ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: '#047857',
                                backgroundColor: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                <ShieldCheck size={11} />
                                <span>Ins. Appr. ({p.insurance_approved_qty || reqQty})</span>
                              </span>
                            ) : isCustApproved ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: '#0284c7',
                                backgroundColor: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                <UserCheck size={11} />
                                <span>Cust. Appr. ({p.customer_approved_qty || reqQty})</span>
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                color: '#64748b',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                <span>Pending Approval</span>
                              </span>
                            )}
                          </td>

                          {/* Stock Avail */}
                          <td style={{ padding: '8px 10px' }}>
                            {hasStock ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#059669'
                                }}>
                                  <Warehouse size={12} />
                                  <span>{stockCount} in Stock</span>
                                </span>
                                {p.stock_locators && (
                                  <span style={{ fontSize: '9.5px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                                    {p.stock_locators}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                Nil in Stock
                              </span>
                            )}
                          </td>

                          {/* Order Qty */}
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={row.orderQty ?? reqQty}
                              disabled={isOrdered}
                              onChange={(e) => handleRowChange(p.id, 'orderQty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                              style={{
                                width: '60px',
                                padding: '4px 6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                textAlign: 'center',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                backgroundColor: isOrdered ? '#f1f5f9' : '#ffffff',
                                color: isOrdered ? '#64748b' : '#0f172a'
                              }}
                            />
                          </td>

                          {/* Purchase ID (Mandatory) */}
                          <td style={{ padding: '8px 10px' }}>
                            <div>
                              <input
                                type="text"
                                placeholder="PO / Purchase ID"
                                value={row.purchaseId ?? ''}
                                disabled={isOrdered}
                                onChange={(e) => handleRowChange(p.id, 'purchaseId', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '4px 8px',
                                  fontSize: '11.5px',
                                  fontFamily: 'var(--font-mono)',
                                  border: row.error ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  backgroundColor: isOrdered ? '#f1f5f9' : '#ffffff',
                                  color: isOrdered ? '#0369a1' : '#0f172a',
                                  fontWeight: isOrdered ? 700 : 500
                                }}
                              />
                              {row.error && (
                                <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px', fontWeight: 600 }}>
                                  {row.error}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Action / Status */}
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {isStockProcured ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#047857',
                                backgroundColor: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                padding: '3px 8px',
                                borderRadius: '4px'
                              }}>
                                <Warehouse size={12} />
                                <span>From Stock ({p.ordered_qty || row.orderQty || reqQty})</span>
                              </span>
                            ) : isArrived ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#16a34a',
                                backgroundColor: '#dcfce7',
                                padding: '3px 8px',
                                borderRadius: '4px'
                              }}>
                                <Check size={12} />
                                <span>Arrived</span>
                              </span>
                            ) : isOrdered ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#0369a1',
                                backgroundColor: '#e0f2fe',
                                padding: '3px 8px',
                                borderRadius: '4px'
                              }}>
                                <Check size={12} />
                                <span>Ordered ({p.ordered_qty || row.orderQty || reqQty})</span>
                              </span>
                            ) : row.success ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#16a34a',
                                backgroundColor: '#dcfce7',
                                padding: '3px 8px',
                                borderRadius: '4px'
                              }}>
                                <Check size={12} />
                                <span>Done!</span>
                              </span>
                            ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  onClick={() => handleOrderSingleRow(p)}
                                  disabled={isSubmittingThisRow || isProcuringThisRow}
                                  style={{
                                    backgroundColor: '#ea580c',
                                    borderColor: '#ea580c',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Order part from supplier with Purchase ID"
                                >
                                  <ShoppingCart size={11} />
                                  <span>{isSubmittingThisRow ? 'Ordering...' : 'Order'}</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs"
                                  onClick={() => handleProcureFromStock(p)}
                                  disabled={isSubmittingThisRow || isProcuringThisRow}
                                  style={{
                                    backgroundColor: stockCount > 0 ? '#ecfdf5' : '#f8fafc',
                                    color: stockCount > 0 ? '#047857' : '#64748b',
                                    border: `1px solid ${stockCount > 0 ? '#a7f3d0' : '#cbd5e1'}`,
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '4px 8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={stockCount > 0
                                    ? `Procure directly from warehouse stock (${stockCount} available). Deducts from inventory now.`
                                    : 'Procure from stock (0 registered in system)'
                                  }
                                >
                                  <Warehouse size={11} />
                                  <span>{isProcuringThisRow ? 'Taking...' : 'From Stock'}</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {isStandalone ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (onSaved) onSaved();
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#0284c7',
                  borderColor: '#0284c7'
                }}
              >
                <Check size={14} />
                <span>Done & Close</span>
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ea580c',
                  borderColor: '#ea580c'
                }}
              >
                <CheckCircle2 size={14} />
                <span>{isSubmitting ? 'Continuing...' : 'Continue'}</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </form>
    </DesktopWindow>
  );
}
