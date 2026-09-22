import React, { useEffect, useState } from 'react';
import { Printer, Download, X, FileSpreadsheet } from 'lucide-react';
import { fetchTicketParts } from '../api/tickets.js';
import { downloadEstimateXlsx } from '../utils/estimateXlsxExporter.js';

function formatDDMMYYYY(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export default function EstimatePrintModal({ ticket, onClose }) {
  const [parts, setParts] = useState(() => Array.isArray(ticket?.parts) ? ticket.parts : []);
  const [isLoadingParts, setIsLoadingParts] = useState(parts.length === 0);
  const [isDownloadingXlsx, setIsDownloadingXlsx] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (parts.length === 0 && ticket?.id) {
      setIsLoadingParts(true);
      fetchTicketParts(ticket.id)
        .then(res => {
          if (isMounted && Array.isArray(res) && res.length > 0) {
            setParts(res);
          }
        })
        .catch(err => console.warn('Could not load parts for print view:', err))
        .finally(() => {
          if (isMounted) setIsLoadingParts(false);
        });
    }
    return () => { isMounted = false; };
  }, [ticket?.id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadXlsx = async () => {
    setIsDownloadingXlsx(true);
    try {
      await downloadEstimateXlsx({ ...ticket, parts });
    } catch (err) {
      alert(`Could not download XLSX: ${err.message}`);
    } finally {
      setIsDownloadingXlsx(false);
    }
  };

  const totalRowsCount = Math.max(parts.length, 17);
  const estimateDateStr = formatDDMMYYYY(ticket?.estimate_date || ticket?.created_at || new Date());

  let totalSpareAmount = 0;
  let totalAccidentalLabour = 0;
  let totalPaintingLabour = 0;

  const rows = [];
  for (let i = 0; i < totalRowsCount; i++) {
    const part = i < parts.length ? parts[i] : null;
    if (part) {
      const qty = Number(part.quantity || part.qty) || 1;
      const mrp = Number(part.master_mrp) || Number(part.mrp) || Number(part.unit_cost) || 0;
      const partTotal = qty * mrp;
      if (partTotal > 0) totalSpareAmount += partTotal;

      const labWo = Number(part.labour_charges) || 0;
      const labInc = labWo > 0 ? Math.round(labWo * 1.18 * 100) / 100 : 0;
      totalAccidentalLabour += labInc;

      const pntWo = Number(part.painting_charges) || 0;
      const pntInc = pntWo > 0 ? Math.round(pntWo * 1.18 * 100) / 100 : 0;
      totalPaintingLabour += pntInc;

      rows.push({
        sl: i + 1,
        desc: part.part_name || part.name || part.description || '',
        qty,
        amount: partTotal > 0 ? partTotal.toFixed(2) : '',
        labWo: labWo > 0 ? labWo.toFixed(2) : '',
        labInc: labInc > 0 ? labInc.toFixed(2) : 0,
        pntWo: pntWo > 0 ? pntWo.toFixed(2) : '',
        pntInc: pntInc > 0 ? pntInc.toFixed(2) : 0,
      });
    } else {
      rows.push({
        sl: i + 1,
        desc: '',
        qty: 1,
        amount: '',
        labWo: '',
        labInc: 0,
        pntWo: '',
        pntInc: 0,
      });
    }
  }

  const grandTotal = totalSpareAmount + totalAccidentalLabour + totalPaintingLabour;

  return (
    <div
      className="estimate-print-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding: '24px 16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Floating Action Bar (Hidden on actual print) */}
      <div
        className="no-print"
        style={{
          width: '100%',
          maxWidth: '850px',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '12px 18px',
          marginBottom: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileSpreadsheet size={18} color="var(--honda-red)" />
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
            Estimate Preview — {ticket.ticket_number || `#${ticket.id}`} ({ticket.vehicle_plate || ticket.vehicle_no || 'UNREGISTERED'})
          </span>
          {isLoadingParts && (
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>(Loading parts...)</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleDownloadXlsx}
            disabled={isDownloadingXlsx}
            style={{ gap: '5px', fontSize: '12px' }}
          >
            <Download size={13} color="#0284c7" />
            <span>{isDownloadingXlsx ? 'Generating...' : 'Download XLSX'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handlePrint}
            style={{ gap: '5px', fontSize: '12px' }}
          >
            <Printer size={13} />
            <span>Print Estimate</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            title="Close Preview (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div
        id="estimate-print-sheet"
        style={{
          width: '100%',
          maxWidth: '850px',
          backgroundColor: '#ffffff',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          padding: '24px 28px',
          color: '#000000',
          fontFamily: 'Calibri, Arial, sans-serif',
          fontSize: '11px',
          boxSizing: 'border-box',
        }}
      >
        {/* Document Header Title */}
        <div style={{
          border: '1px solid #000000',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '16px',
          padding: '6px 0',
          letterSpacing: '1px',
          borderBottom: 'none'
        }}>
          ESTIMATE
        </div>

        {/* Dealership & Vehicle Details Box */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 1fr',
          border: '1px solid #000000',
          borderBottom: 'none'
        }}>
          {/* Left: Dealership Details */}
          <div style={{
            borderRight: '1px solid #000000',
            padding: '8px 10px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            lineHeight: 1.4
          }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '12.5px' }}>JOHNS HONDA</div>
              <div>JOHNS BIWHEELERS;KALAPPURA</div>
              <div>ALAPPUZHA,KERALA</div>
              <div>PH:9072660621, 9072660676</div>
            </div>
            <div style={{ marginTop: '10px', fontWeight: 'bold', fontSize: '12px' }}>
              DATE :{estimateDateStr}
            </div>
          </div>

          {/* Right: Vehicle & Customer Details */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '11px'
          }}>
            {[
              { label: 'OWNERS NAME', val: ticket.customer_name || '' },
              { label: 'MODEL', val: ticket.vehicle_model || ticket.model || '' },
              { label: 'COLOUR', val: ticket.vehicle_color || ticket.color || '' },
              { label: 'REG:NO', val: ticket.vehicle_plate || ticket.vehicle_no || '' },
              { label: 'CHASIS NO', val: ticket.chassis_number || ticket.chassis_no || '' },
              { label: 'ENGINE NO', val: ticket.engine_number || ticket.engine_no || '' },
            ].map((field, idx, arr) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 15px 1fr',
                  padding: '3px 8px',
                  borderBottom: idx < arr.length - 1 ? '1px solid #000000' : 'none',
                  minHeight: '21px',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontWeight: 'bold' }}>{field.label}</span>
                <span>:</span>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {field.val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Table */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000000',
          textAlign: 'left'
        }}>
          <thead>
            {/* Top Table Header Row */}
            <tr style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>
              <th rowSpan={2} style={thStyle({ width: '6%' })}>SL NO:</th>
              <th rowSpan={2} style={thStyle({ width: '38%' })}>PART DESCRIPTION</th>
              <th rowSpan={2} style={thStyle({ width: '6%' })}>QTY</th>
              <th rowSpan={2} style={thStyle({ width: '12%' })}>AMOUNT</th>
              <th colSpan={2} style={thStyle({ width: '19%' })}>LABOUR</th>
              <th colSpan={2} style={thStyle({ width: '19%' })}>PAINTING</th>
            </tr>
            {/* Sub-header row for Labour & Painting */}
            <tr style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '10px' }}>
              <th style={thStyle({ width: '9.5%' })}>W/O TAX</th>
              <th style={thStyle({ width: '9.5%' })}>INC TAX</th>
              <th style={thStyle({ width: '9.5%' })}>W/O TAX</th>
              <th style={thStyle({ width: '9.5%' })}>INC TAX</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} style={{ height: '22px' }}>
                <td style={tdStyle({ textAlign: 'center', fontWeight: 'bold' })}>{r.sl}</td>
                <td style={tdStyle({ textAlign: 'left', paddingLeft: '8px' })}>{r.desc}</td>
                <td style={tdStyle({ textAlign: 'center', fontWeight: 'bold' })}>{r.qty}</td>
                <td style={tdStyle({ textAlign: 'right', paddingRight: '6px' })}>{r.amount}</td>
                <td style={tdStyle({ textAlign: 'right', paddingRight: '6px' })}>{r.labWo}</td>
                <td style={tdStyle({ textAlign: 'right', paddingRight: '6px' })}>{r.labInc}</td>
                <td style={tdStyle({ textAlign: 'right', paddingRight: '6px' })}>{r.pntWo}</td>
                <td style={tdStyle({ textAlign: 'right', paddingRight: '6px' })}>{r.pntInc}</td>
              </tr>
            ))}

            {/* Bottom Summary Rows */}
            <tr style={{ height: '26px', fontWeight: 'bold', fontSize: '12px' }}>
              <td colSpan={4} style={summaryTdLabel}>SPARE AMOUNT</td>
              <td colSpan={4} style={summaryTdValue}>{Math.round(totalSpareAmount)}</td>
            </tr>
            <tr style={{ height: '26px', fontWeight: 'bold', fontSize: '12px' }}>
              <td colSpan={4} style={summaryTdLabel}>ACCIDENTAL LABOUR AMOUNT</td>
              <td colSpan={4} style={summaryTdValue}>{Math.round(totalAccidentalLabour)}</td>
            </tr>
            <tr style={{ height: '26px', fontWeight: 'bold', fontSize: '12px' }}>
              <td colSpan={4} style={summaryTdLabel}>PAINTING LABOUR</td>
              <td colSpan={4} style={summaryTdValue}>{Math.round(totalPaintingLabour)}</td>
            </tr>
            <tr style={{ height: '28px', fontWeight: 'bold', fontSize: '13px' }}>
              <td colSpan={4} style={summaryTdLabel}>TOTAL AMOUNT</td>
              <td colSpan={4} style={summaryTdValue}>{Math.round(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .estimate-print-backdrop {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: none !important;
          }
          #estimate-print-sheet, #estimate-print-sheet * {
            visibility: visible !important;
          }
          #estimate-print-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            padding: 10mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    border: '1px solid #000000',
    padding: '4px 2px',
    backgroundColor: '#ffffff',
    color: '#000000',
    ...extra
  };
}

function tdStyle(extra = {}) {
  return {
    border: '1px solid #000000',
    padding: '2px 4px',
    color: '#000000',
    fontSize: '11px',
    ...extra
  };
}

const summaryTdLabel = {
  border: '1px solid #000000',
  textAlign: 'center',
  padding: '4px 8px',
  letterSpacing: '0.5px'
};

const summaryTdValue = {
  border: '1px solid #000000',
  textAlign: 'center',
  padding: '4px 8px'
};
