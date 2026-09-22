import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, CheckCircle2, Printer, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { lookupParts } from '../../api/parts.js';
import { request } from '../../api/client.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';
import { downloadEstimateXlsx } from '../../utils/estimateXlsxExporter.js';

export default function Stage2EstimationModal({
  ticket,
  onClose,
  onSubmit,
  isSubmitting,
  onOpenPrintView,
}) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoadingParts, setIsLoadingParts] = useState(false);
  const [parts, setParts] = useState(() => {
    if (ticket?.parts && Array.isArray(ticket.parts) && ticket.parts.length > 0) {
      return ticket.parts.map(p => ({
        id: p.id,
        part_name: p.master_part_name || p.part_name || '',
        part_code: p.part_code || '',
        category_code: p.category_code || '',
        quantity: Number(p.quantity) || 1,
        mrp: Number(p.master_mrp) || Number(p.mrp) || Number(p.unit_cost) || 0,
        labour_charges: Number(p.labour_charges) || 0,
        painting_charges: Number(p.painting_charges) || 0,
      }));
    }
    return [{ part_name: '', part_code: '', category_code: '', quantity: 1, mrp: 0, labour_charges: 0, painting_charges: 0 }];
  });

  const [jobNotes, setJobNotes] = useState(ticket?.damaged_parts || '');

  // Load existing parts entered previously for this ticket if not in ticket prop
  useEffect(() => {
    if (!ticket?.id) return;
    let active = true;

    if (Array.isArray(ticket.parts) && ticket.parts.length > 0) {
      return;
    }

    setIsLoadingParts(true);
    request(`/api/tickets/${ticket.id}/parts`)
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : (data?.parts || []);
        if (list.length > 0) {
          setParts(
            list.map((p) => ({
              id: p.id,
              part_name: p.master_part_name || p.part_name || '',
              part_code: p.part_code || '',
              category_code: p.category_code || '',
              quantity: Number(p.quantity) || 1,
              mrp: Number(p.master_mrp) || Number(p.mrp) || Number(p.unit_cost) || 0,
              labour_charges: Number(p.labour_charges) || 0,
              painting_charges: Number(p.painting_charges) || 0,
            }))
          );
        }
      })
      .catch((err) => {
        console.error('Failed to load existing estimation parts:', err);
      })
      .finally(() => {
        if (active) setIsLoadingParts(false);
      });

    return () => {
      active = false;
    };
  }, [ticket?.id]);

  useEffect(() => {
    if (ticket?.damaged_parts && !jobNotes) {
      setJobNotes(ticket.damaged_parts);
    }
  }, [ticket?.damaged_parts]);

  // Recalculate subtotals & taxes (18% GST on Labour and Painting)
  const partsSubtotal = parts.reduce((acc, p) => {
    const q = Number(p.quantity) || 0;
    const m = Number(p.mrp) || 0;
    return acc + Math.round(q * m);
  }, 0);

  const labourSubtotal = parts.reduce((acc, p) => {
    return acc + Math.round(Number(p.labour_charges) || 0);
  }, 0);

  const paintingSubtotal = parts.reduce((acc, p) => {
    return acc + Math.round(Number(p.painting_charges) || 0);
  }, 0);

  const labourTax = Math.round(labourSubtotal * 0.18);
  const labourWithTax = labourSubtotal + labourTax;

  const paintingTax = Math.round(paintingSubtotal * 0.18);
  const paintingWithTax = paintingSubtotal + paintingTax;

  const totalTax = labourTax + paintingTax;
  const grandTotal = partsSubtotal + labourSubtotal + paintingSubtotal;
  const grandTotalWithTax = partsSubtotal + labourWithTax + paintingWithTax;

  const handleAddRow = () => {
    setParts(prev => [...prev, { part_name: '', part_code: '', category_code: '', quantity: 1, mrp: 0, labour_charges: 0, painting_charges: 0 }]);
  };

  const handleRemoveRow = (idx) => {
    setParts(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [{ part_name: '', part_code: '', category_code: '', quantity: 1, mrp: 0, labour_charges: 0, painting_charges: 0 }];
    });
  };

  const handlePartChange = (idx, field, value) => {
    setErrorMsg('');
    setParts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    const validParts = parts
      .filter(p => p.part_name && p.part_name.trim().length > 0)
      .map(p => {
        const q = Math.max(1, Number(p.quantity) || 1);
        const m = Math.max(0, Number(p.mrp) || 0);
        const l = Math.max(0, Number(p.labour_charges) || 0);
        const pt = Math.max(0, Number(p.painting_charges) || 0);
        const lineTotal = Math.round((q * m) + l + pt);
        const lineLabourTax = Math.round(l * 0.18);
        const linePaintingTax = Math.round(pt * 0.18);
        const lineTotalWithTax = lineTotal + lineLabourTax + linePaintingTax;
        return {
          part_name: p.part_name.trim(),
          part_code: p.part_code || null,
          category_code: p.category_code || null,
          quantity: q,
          unit_cost: m, // Stored as unit_cost in DB (MRP)
          mrp: m,
          labour_charges: l,
          painting_charges: pt,
          total_cost: lineTotalWithTax,
          total_cost_without_tax: lineTotal,
        };
      });

    if (validParts.length === 0) {
      setErrorMsg('At least 1 product / part is mandatory to prepare and confirm the estimate.');
      return;
    }

    onSubmit({
      targetStageId: 2,
      parts: validParts,
      estimatedCost: grandTotalWithTax,
      damagedParts: jobNotes,
    });
  };

  return (
    <DesktopWindow
      title="Stage 2: Estimate Preparation"
      icon={Plus}
      onClose={onClose}
      defaultWidth="960px"
    >
      {/* Header */}
      <div className="modal-header">
        <div className="modal-title">
          <span style={{
            backgroundColor: 'var(--honda-red)',
            color: '#ffffff',
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 800
          }}>
            STAGE 2
          </span>
          <span>Estimate Preparation</span>
          <span style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 500 }}>
            — {ticket?.vehicle_plate || 'Vehicle'} ({ticket?.vehicle_model || 'Honda'})
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Body Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="modal-body">
          {errorMsg && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)',
              color: '#991b1b',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} color="#dc2626" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="form-label" style={{ margin: 0 }}>Required Parts (Demand List)</span>
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                MRP is fetched from <code>parts_master</code>. Enter labour and painting charges per line.
              </span>
            </div>

            {/* Table */}
            <div style={{
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              overflow: 'visible',
              backgroundColor: '#ffffff'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px', width: '35%' }}>PART DESCRIPTION / ITEM</th>
                    <th style={{ padding: '8px 10px', width: '8%', textAlign: 'center' }}>QTY</th>
                    <th style={{ padding: '8px 10px', width: '13%', textAlign: 'right' }}>MRP (₹)</th>
                    <th style={{ padding: '8px 10px', width: '14%', textAlign: 'right' }}>
                      LABOUR (₹)
                      <div style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text-subtle)' }}>+18% GST</div>
                    </th>
                    <th style={{ padding: '8px 10px', width: '14%', textAlign: 'right' }}>
                      PAINTING (₹)
                      <div style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text-subtle)' }}>+18% GST</div>
                    </th>
                    <th style={{ padding: '8px 10px', width: '13%', textAlign: 'right' }}>
                      TOTAL (₹)
                      <div style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text-subtle)' }}>Inc. Taxes</div>
                    </th>
                    <th style={{ padding: '8px 6px', width: '3%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, idx) => (
                    <PartRowItem
                      key={idx}
                      index={idx}
                      part={part}
                      onChange={(field, val) => handlePartChange(idx, field, val)}
                      onRemove={() => handleRemoveRow(idx)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add row & Subtotal Ribbon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '10px',
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                onClick={handleAddRow}
              >
                <Plus size={13} />
                <span>Add Part Item</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Parts MRP: </span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                    ₹{partsSubtotal.toLocaleString('en-IN')}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Labour: </span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: '#2563eb' }}>
                    ₹{labourSubtotal.toLocaleString('en-IN')}
                  </strong>
                  {labourSubtotal > 0 && (
                    <span style={{ fontSize: '10.5px', color: '#2563eb', marginLeft: '4px', fontWeight: 600 }}>
                      (+18%: ₹{labourTax.toLocaleString('en-IN')})
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Painting: </span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: '#7c3aed' }}>
                    ₹{paintingSubtotal.toLocaleString('en-IN')}
                  </strong>
                  {paintingSubtotal > 0 && (
                    <span style={{ fontSize: '10.5px', color: '#7c3aed', marginLeft: '4px', fontWeight: 600 }}>
                      (+18%: ₹{paintingTax.toLocaleString('en-IN')})
                    </span>
                  )}
                </div>
                {totalTax > 0 && (
                  <div style={{
                    backgroundColor: '#fef3c7',
                    border: '1px solid #fde68a',
                    color: '#b45309',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    18% Tax: +₹{totalTax.toLocaleString('en-IN')}
                  </div>
                )}
                <div style={{ paddingLeft: '10px', borderLeft: '2px solid var(--border-medium)', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Total Estimate:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: '#047857' }}>
                    ₹{grandTotalWithTax.toLocaleString('en-IN')}
                  </strong>
                  {totalTax > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                      (₹{grandTotal.toLocaleString('en-IN')} + taxes)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Scope / Remarks */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Job Scope / Damage Remarks</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={jobNotes}
              onChange={e => setJobNotes(e.target.value)}
              placeholder="e.g. Front bumper overhaul, painting & refinishing, right fender dent repair..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={async () => {
                const validParts = parts.filter(p => p.part_name && p.part_name.trim().length > 0);
                try {
                  await downloadEstimateXlsx({
                    ...ticket,
                    parts: validParts,
                    estimated_cost: grandTotalWithTax,
                  }, { skipFetchParts: true });
                } catch (err) {
                  alert(`Could not download XLSX: ${err.message}`);
                }
              }}
              style={{ gap: '5px', fontSize: '12px' }}
              title="Download Current Estimate in XLSX format"
            >
              <FileSpreadsheet size={13} color="#059669" />
              <span>Download XLSX</span>
            </button>

            {onOpenPrintView && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const validParts = parts.filter(p => p.part_name && p.part_name.trim().length > 0);
                  onOpenPrintView({
                    ...ticket,
                    parts: validParts,
                    estimated_cost: grandTotalWithTax,
                  });
                }}
                style={{ gap: '5px', fontSize: '12px' }}
                title="Print Preview of Estimate"
              >
                <Printer size={13} color="#0284c7" />
                <span>Print Estimate</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{
                backgroundColor: 'var(--honda-red)',
                borderColor: 'var(--honda-red)',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{isSubmitting ? 'Saving Estimate...' : 'Confirm & Save Estimate'}</span>
            </button>
          </div>
        </div>
      </form>
    </DesktopWindow>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-component: PartRowItem (Autocomplete for parts_master)
// ─────────────────────────────────────────────────────────────
function PartRowItem({ index, part, onChange, onRemove }) {
  const [query, setQuery] = useState(part.part_name || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const qtyRef = useRef(null);

  useEffect(() => {
    setQuery(part.part_name || '');
  }, [part.part_name]);

  const handleInputChange = (val) => {
    setQuery(val);
    onChange('part_name', val);

    clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const list = await lookupParts(val);
        setSuggestions(list || []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      }
    }, 150);
  };

  const handleSelectSuggestion = (s) => {
    const sMrp = Number(s.mrp || 0);
    const chosenMrp = sMrp > 0 ? sMrp : Number(s.default_cost || 0);

    setQuery(s.part_name);
    onChange('part_name', s.part_name);
    onChange('part_code', s.part_code || s.sku || '');
    onChange('category_code', s.category_code || '');
    onChange('mrp', chosenMrp);
    setShowDropdown(false);

    // Focus Qty field directly so estimator can type demanded quantity
    if (qtyRef.current) {
      qtyRef.current.focus();
      qtyRef.current.select();
    }
  };

  const rowQty = Math.max(1, Number(part.quantity) || 1);
  const rowMrp = Math.max(0, Number(part.mrp) || 0);
  const rowLabour = Math.max(0, Number(part.labour_charges) || 0);
  const rowPainting = Math.max(0, Number(part.painting_charges) || 0);
  const rowLabourTax = Math.round(rowLabour * 0.18);
  const rowPaintingTax = Math.round(rowPainting * 0.18);
  const rowTax = rowLabourTax + rowPaintingTax;
  const rowTotal = Math.round((rowQty * rowMrp) + rowLabour + rowPainting);
  const rowTotalWithTax = rowTotal + rowTax;

  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      {/* Part Name with Autocomplete */}
      <td style={{ padding: '6px 10px', position: 'relative' }}>
        <input
          type="text"
          className="form-input"
          style={{ padding: '5px 8px', fontSize: '12px' }}
          placeholder="Search master SKU or enter description..."
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />
        {part.part_code && (
          <div style={{
            position: 'absolute',
            right: '16px',
            top: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{
              fontSize: '9.5px',
              color: 'var(--text-subtle)',
              backgroundColor: '#f1f5f9',
              padding: '1px 5px',
              borderRadius: '3px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)'
            }}>
              {part.part_code}
            </span>
            {part.category_code && (
              <span style={{
                fontSize: '9px',
                color: '#475569',
                backgroundColor: '#e2e8f0',
                padding: '1px 4px',
                borderRadius: '3px',
                fontWeight: 600
              }}>
                {part.category_code}
              </span>
            )}
          </div>
        )}

        {/* Suggestions Dropdown */}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '10px',
            right: '10px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 50,
          }}>
            {suggestions.length > 0 ? (
              suggestions.map((s, idx) => {
                const sMrp = Number(s.mrp || 0);
                const displayPrice = sMrp > 0 ? sMrp : Number(s.default_cost || 0);
                const stockQty = Number(s.stock_qty || 0);

                return (
                  <div
                    key={s.id || idx}
                    onMouseDown={() => handleSelectSuggestion(s)}
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
                          color: '#b91c1c',
                          backgroundColor: '#fef2f2',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontWeight: 600
                        }}>
                          Out of stock (PO Req)
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#047857' }}>
                        ₹{displayPrice.toLocaleString('en-IN')}
                      </span>
                      {sMrp > 0 ? (
                        <div style={{ fontSize: '9px', color: 'var(--text-subtle)', fontWeight: 600 }}>Master MRP</div>
                      ) : (
                        <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: 600 }}>batch price</div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-subtle)', textAlign: 'center' }}>
                Press Tab to use custom part
              </div>
            )}
          </div>
        )}
      </td>

      {/* Qty Input */}
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <input
          ref={qtyRef}
          type="number"
          min="1"
          step="1"
          className="form-input"
          style={{ textAlign: 'center', padding: '5px 4px', fontSize: '12px' }}
          value={part.quantity}
          onChange={e => onChange('quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
        />
      </td>

      {/* MRP Input */}
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
        <input
          type="number"
          min="0"
          step="any"
          className="form-input"
          style={{ textAlign: 'right', padding: '5px 6px', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
          value={part.mrp ?? 0}
          onChange={e => onChange('mrp', Math.max(0, parseFloat(e.target.value) || 0))}
          title="MRP from parts_master"
        />
      </td>

      {/* Labour Charges Input */}
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
        <input
          type="number"
          min="0"
          step="any"
          className="form-input"
          placeholder="0"
          style={{ textAlign: 'right', padding: '5px 6px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#2563eb' }}
          value={part.labour_charges ?? 0}
          onChange={e => onChange('labour_charges', Math.max(0, parseFloat(e.target.value) || 0))}
          title="Labour charges for this part (excluding tax)"
        />
        {rowLabour > 0 && (
          <div style={{ fontSize: '9.5px', color: '#2563eb', fontFamily: 'var(--font-mono)', marginTop: '2px', fontWeight: 600 }}>
            +18%: ₹{rowLabourTax}
          </div>
        )}
      </td>

      {/* Painting Charges Input */}
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
        <input
          type="number"
          min="0"
          step="any"
          className="form-input"
          placeholder="0"
          style={{ textAlign: 'right', padding: '5px 6px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#7c3aed' }}
          value={part.painting_charges ?? 0}
          onChange={e => onChange('painting_charges', Math.max(0, parseFloat(e.target.value) || 0))}
          title="Painting charges for this part (excluding tax)"
        />
        {rowPainting > 0 && (
          <div style={{ fontSize: '9.5px', color: '#7c3aed', fontFamily: 'var(--font-mono)', marginTop: '2px', fontWeight: 600 }}>
            +18%: ₹{rowPaintingTax}
          </div>
        )}
      </td>

      {/* Line Total */}
      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-main)' }}>
          ₹{rowTotal.toLocaleString('en-IN')}
        </div>
        {rowTax > 0 && (
          <div style={{ fontSize: '9.5px', color: '#047857', fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: '2px' }} title={`Base: ₹${rowTotal} + 18% GST: ₹${rowTax}`}>
            +tax: ₹{rowTotalWithTax.toLocaleString('en-IN')}
          </div>
        )}
      </td>

      {/* Remove Row */}
      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onRemove}
          title="Remove row"
          style={{ color: 'var(--text-subtle)' }}
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}
