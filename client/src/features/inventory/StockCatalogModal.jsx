import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Package, MapPin, Upload, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { lookupParts } from '../../api/parts.js';
import { uploadStockXlsx } from '../../api/inventory.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';
import { TableRowSkeleton } from '../../components/Skeletons.jsx';

export default function StockCatalogModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadParts = (q = '') => {
    setLoading(true);
    lookupParts(q)
      .then(res => {
        setParts(Array.isArray(res) ? res : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadParts(debouncedQuery);
  }, [debouncedQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadParts(query);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const res = await uploadStockXlsx(arrayBuffer, file.name);
      setUploadStatus({
        success: true,
        message: res.message || 'XLSX uploaded and synced successfully!',
        stats: res.stats
      });
      loadParts(query);
    } catch (err) {
      setUploadStatus({ success: false, message: err.message });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <DesktopWindow
      title="Physical Stock & Multi-Batch Catalog"
      icon={Package}
      onClose={onClose}
      defaultWidth="880px"
      defaultHeight="85vh"
    >
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Top toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={14} color="var(--text-subtle)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '32px', width: '100%' }}
              placeholder="Search part #, description, or locator bins..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Upload physical stock Excel spreadsheet"
            >
              <Upload size={13} />
              <span>{isUploading ? 'Syncing...' : 'Upload Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {uploadStatus && (
          <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{
              padding: '8px 14px',
              backgroundColor: uploadStatus.success ? 'var(--sla-green-bg)' : 'var(--sla-red-bg)',
              color: uploadStatus.success ? 'var(--sla-green-text)' : 'var(--sla-red-text)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {uploadStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{uploadStatus.message}</span>
              </div>
              {uploadStatus.stats && (
                <span style={{ fontSize: '11px', opacity: 0.9 }}>
                  Accepted: {uploadStatus.stats.acceptedRows?.toLocaleString()} rows
                </span>
              )}
            </div>

            {uploadStatus.stats?.rejectedCount > 0 && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                fontSize: '11.5px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                  <AlertTriangle size={14} color="#dc2626" />
                  <span>{uploadStatus.stats.rejectedCount} SKUs Rejected (Not cataloged in parts_master)</span>
                </div>
                <div style={{ maxHeight: '90px', overflowY: 'auto', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  {(uploadStatus.stats.rejectedSkus || []).slice(0, 15).map((r, i) => (
                    <span key={i} style={{ display: 'inline-block', backgroundColor: '#ffffff', padding: '1px 5px', margin: '2px', borderRadius: '3px', border: '1px solid #fca5a5' }}>
                      {r.sku} (x{r.quantity})
                    </span>
                  ))}
                  {(uploadStatus.stats.rejectedSkus || []).length > 15 && (
                    <span style={{ marginLeft: '4px', color: '#7f1d1d' }}>+{uploadStatus.stats.rejectedSkus.length - 15} more...</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)', position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ padding: '8px 12px', width: '18%' }}>SKU</th>
                <th style={{ padding: '8px 12px', width: '30%' }}>DESCRIPTION</th>
                <th style={{ padding: '8px 12px', width: '10%' }}>CATEGORY</th>
                <th style={{ padding: '8px 12px', width: '12%', textAlign: 'right' }}>MRP (₹)</th>
                <th style={{ padding: '8px 12px', width: '10%', textAlign: 'center' }}>STOCK</th>
                <th style={{ padding: '8px 12px', width: '10%', textAlign: 'right' }}>BATCH (₹)</th>
                <th style={{ padding: '8px 12px', width: '10%' }}>LOCATOR(S)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={7} />
                ))
              ) : parts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-subtle)' }}>
                    No inventory parts found matching "{query}".
                  </td>
                </tr>
              ) : (
                parts.map((p, idx) => {
                  const mrpVal = Number(p.mrp || 0);
                  const batchPrice = Number(p.batch_price || p.default_cost || 0);

                  return (
                    <tr key={p.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-main)', fontSize: '11px' }}>
                        {p.sku || p.part_code || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-main)', fontWeight: 500 }}>
                        {p.part_name}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {p.category_code ? (
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', backgroundColor: '#f1f5f9', color: 'var(--text-subtle)' }}>
                            {p.category_code}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                        {mrpVal > 0 ? `₹${mrpVal.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 700,
                          color: (p.stock_qty || 0) > 0 ? '#047857' : '#b91c1c',
                          backgroundColor: (p.stock_qty || 0) > 0 ? '#ecfdf5' : '#fef2f2',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {p.stock_qty || 0}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '11px' }}>
                        {batchPrice > 0 ? `₹${batchPrice.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-subtle)' }}>
                        {p.locators ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={11} />
                            <span>{p.locators}</span>
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
            Showing {parts.length} catalog items. Unit prices display the highest batch price for estimation.
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </DesktopWindow>
  );
}
