import ExcelJS from 'exceljs';
import { fetchTicketParts } from '../api/tickets.js';

const thinBorder = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
};

function formatDDMMYYYY(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Generates and downloads the exact formatted XLSX Estimate matching the dealership specification
 */
export async function downloadEstimateXlsx(ticket, options = {}) {
  if (!ticket || !ticket.id) {
    throw new Error('Invalid ticket data provided.');
  }

  let parts = Array.isArray(ticket.parts) ? ticket.parts : [];
  if (parts.length === 0 && !options.skipFetchParts) {
    try {
      const fetched = await fetchTicketParts(ticket.id);
      if (Array.isArray(fetched) && fetched.length > 0) {
        parts = fetched;
      }
    } catch (err) {
      console.warn('Could not fetch ticket parts from API:', err);
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Honda Bodyshop Command';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('ESTIMATE', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });

  // Column Dimensions
  ws.columns = [
    { key: 'colA', width: 9 },   // SL NO:
    { key: 'colB', width: 38 },  // PART DESCRIPTION
    { key: 'colC', width: 8 },   // QTY
    { key: 'colD', width: 13 },  // AMOUNT
    { key: 'colE', width: 13 },  // LABOUR W/O TAX
    { key: 'colF', width: 13 },  // LABOUR INC TAX
    { key: 'colG', width: 13 },  // PAINTING W/O TAX
    { key: 'colH', width: 13 },  // PAINTING INC TAX
  ];

  // Helper to apply thin border to a cell range
  function applyRangeBorder(startRow, startCol, endRow, endCol) {
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = ws.getCell(r, c);
        cell.border = thinBorder;
      }
    }
  }

  // Row 1: Title "ESTIMATE"
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ESTIMATE';
  titleCell.font = { name: 'Calibri', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyRangeBorder(1, 1, 1, 8);

  const estimateDateStr = formatDDMMYYYY(ticket.estimate_date || ticket.created_at || new Date());

  // Row 2-7: Dealership Info (Left) & Customer/Vehicle Info (Right)
  // Left:
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = 'JOHNS HONDA';
  ws.getCell('A2').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A3:D3');
  ws.getCell('A3').value = 'JOHNS BIWHEELERS;KALAPPURA';
  ws.getCell('A3').font = { name: 'Calibri', size: 11 };
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A4:D4');
  ws.getCell('A4').value = 'ALAPPUZHA,KERALA';
  ws.getCell('A4').font = { name: 'Calibri', size: 11 };
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A5:D5');
  ws.getCell('A5').value = 'PH:9072660621, 9072660676';
  ws.getCell('A5').font = { name: 'Calibri', size: 11 };
  ws.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A6:D6');
  ws.getCell('A6').value = `DATE :${estimateDateStr}`;
  ws.getCell('A6').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A7:D7');
  ws.getCell('A7').value = '';
  ws.getCell('A7').alignment = { horizontal: 'center', vertical: 'middle' };

  // Right Header Rows:
  const rightMeta = [
    { label: 'OWNERS NAME   :', val: (ticket.customer_name || '').toUpperCase() },
    { label: 'MODEL         :', val: (ticket.vehicle_model || ticket.model || 'HONDA VEHICLE').toUpperCase() },
    { label: 'COLOUR        :', val: (ticket.vehicle_color || ticket.color || '').toUpperCase() },
    { label: 'REG:NO         :', val: (ticket.vehicle_plate || ticket.vehicle_no || 'UNREGISTERED').toUpperCase() },
    { label: 'CHASIS NO      :', val: (ticket.chassis_number || ticket.chassis_no || '').toUpperCase() },
    { label: 'ENGINE NO      :', val: (ticket.engine_number || ticket.engine_no || '').toUpperCase() }
  ];

  rightMeta.forEach((meta, idx) => {
    const rowNum = idx + 2;
    // E & F for label
    ws.mergeCells(`E${rowNum}:F${rowNum}`);
    const lCell = ws.getCell(`E${rowNum}`);
    lCell.value = meta.label;
    lCell.font = { name: 'Calibri', size: 11, bold: true };
    lCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // G & H for value
    ws.mergeCells(`G${rowNum}:H${rowNum}`);
    const vCell = ws.getCell(`G${rowNum}`);
    vCell.value = meta.val;
    vCell.font = { name: 'Calibri', size: 11, bold: true };
    vCell.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  applyRangeBorder(2, 1, 7, 8);

  // Row 8-9: Table Headers
  // SL NO: (Row 8-9)
  ws.mergeCells('A8:A9');
  ws.getCell('A8').value = 'SL NO:';
  ws.getCell('A8').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle' };

  // PART DESCRIPTION (Row 8-9)
  ws.mergeCells('B8:B9');
  ws.getCell('B8').value = 'PART DESCRIPTION';
  ws.getCell('B8').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('B8').alignment = { horizontal: 'center', vertical: 'middle' };

  // QTY (Row 8-9)
  ws.mergeCells('C8:C9');
  ws.getCell('C8').value = 'QTY';
  ws.getCell('C8').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('C8').alignment = { horizontal: 'center', vertical: 'middle' };

  // AMOUNT (Row 8-9)
  ws.mergeCells('D8:D9');
  ws.getCell('D8').value = 'AMOUNT';
  ws.getCell('D8').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('D8').alignment = { horizontal: 'center', vertical: 'middle' };

  // LABOUR (Row 8, Col E-F)
  ws.mergeCells('E8:F8');
  ws.getCell('E8').value = 'LABOUR';
  ws.getCell('E8').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('E8').alignment = { horizontal: 'center', vertical: 'middle' };

  // PAINTING (Row 8, Col G-H)
  ws.mergeCells('G8:H8');
  ws.getCell('G8').value = 'PAINTING';
  ws.getCell('G8').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('G8').alignment = { horizontal: 'center', vertical: 'middle' };

  // Sub-headers in Row 9:
  ws.getCell('E9').value = 'W/O TAX';
  ws.getCell('E9').font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell('E9').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('F9').value = 'INC TAX';
  ws.getCell('F9').font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell('F9').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('G9').value = 'W/O TAX';
  ws.getCell('G9').font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell('G9').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('H9').value = 'INC TAX';
  ws.getCell('H9').font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell('H9').alignment = { horizontal: 'center', vertical: 'middle' };

  applyRangeBorder(8, 1, 9, 8);

  // Rows 10 onwards: Item Rows (Display at least 17 rows as in dealership template)
  const totalItemRows = Math.max(parts.length, 17);
  let startItemRow = 10;

  let totalSpareAmount = 0;
  let totalAccidentalLabour = 0;
  let totalPaintingLabour = 0;

  for (let i = 0; i < totalItemRows; i++) {
    const rowNum = startItemRow + i;
    const part = i < parts.length ? parts[i] : null;

    const slCell = ws.getCell(`A${rowNum}`);
    slCell.value = i + 1;
    slCell.alignment = { horizontal: 'center', vertical: 'middle' };
    slCell.font = { name: 'Calibri', size: 11, bold: true };

    const descCell = ws.getCell(`B${rowNum}`);
    descCell.font = { name: 'Calibri', size: 11 };
    descCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const qtyCell = ws.getCell(`C${rowNum}`);
    qtyCell.value = 1;
    qtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    qtyCell.font = { name: 'Calibri', size: 11, bold: true };

    const amtCell = ws.getCell(`D${rowNum}`);
    amtCell.font = { name: 'Calibri', size: 11 };
    amtCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const labWoCell = ws.getCell(`E${rowNum}`);
    labWoCell.font = { name: 'Calibri', size: 11 };
    labWoCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const labIncCell = ws.getCell(`F${rowNum}`);
    labIncCell.font = { name: 'Calibri', size: 11 };
    labIncCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const pntWoCell = ws.getCell(`G${rowNum}`);
    pntWoCell.font = { name: 'Calibri', size: 11 };
    pntWoCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const pntIncCell = ws.getCell(`H${rowNum}`);
    pntIncCell.font = { name: 'Calibri', size: 11 };
    pntIncCell.alignment = { horizontal: 'right', vertical: 'middle' };

    if (part) {
      // In this format we DO NOT show SKU, instead item name / description
      descCell.value = part.part_name || part.name || part.description || '';

      const qty = Number(part.quantity || part.qty) || 1;
      qtyCell.value = qty;

      const mrp = Number(part.master_mrp) || Number(part.mrp) || Number(part.unit_cost) || 0;
      const partTotal = qty * mrp;
      if (partTotal > 0) {
        amtCell.value = partTotal;
        amtCell.numFmt = '#,##0.00';
        totalSpareAmount += partTotal;
      }

      // Labour: user entry is W/O TAX, INC TAX has 18% tax
      const labWo = Number(part.labour_charges) || 0;
      if (labWo > 0) {
        labWoCell.value = labWo;
        labWoCell.numFmt = '#,##0.00';
        const labInc = Math.round(labWo * 1.18 * 100) / 100;
        labIncCell.value = labInc;
        labIncCell.numFmt = '#,##0.00';
        totalAccidentalLabour += labInc;
      } else {
        labIncCell.value = 0;
      }

      // Painting: user entry is W/O TAX, INC TAX has 18% tax
      const pntWo = Number(part.painting_charges) || 0;
      if (pntWo > 0) {
        pntWoCell.value = pntWo;
        pntWoCell.numFmt = '#,##0.00';
        const pntInc = Math.round(pntWo * 1.18 * 100) / 100;
        pntIncCell.value = pntInc;
        pntIncCell.numFmt = '#,##0.00';
        totalPaintingLabour += pntInc;
      } else {
        pntIncCell.value = 0;
      }
    } else {
      descCell.value = '';
      amtCell.value = '';
      labWoCell.value = '';
      labIncCell.value = 0;
      pntWoCell.value = '';
      pntIncCell.value = 0;
    }

    applyRangeBorder(rowNum, 1, rowNum, 8);
  }

  // Summary Rows at Bottom
  const summaryStartRow = startItemRow + totalItemRows;
  const grandTotal = totalSpareAmount + totalAccidentalLabour + totalPaintingLabour;

  // 1. SPARE AMOUNT
  ws.mergeCells(`A${summaryStartRow}:D${summaryStartRow}`);
  ws.getCell(`A${summaryStartRow}`).value = 'SPARE AMOUNT';
  ws.getCell(`A${summaryStartRow}`).font = { name: 'Calibri', size: 12, bold: true };
  ws.getCell(`A${summaryStartRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`E${summaryStartRow}:H${summaryStartRow}`);
  const sCell = ws.getCell(`E${summaryStartRow}`);
  sCell.value = totalSpareAmount > 0 ? totalSpareAmount : 0;
  sCell.font = { name: 'Calibri', size: 12, bold: true };
  sCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sCell.numFmt = '#,##0';
  applyRangeBorder(summaryStartRow, 1, summaryStartRow, 8);

  // 2. ACCIDENTAL LABOUR AMOUNT
  const r2 = summaryStartRow + 1;
  ws.mergeCells(`A${r2}:D${r2}`);
  ws.getCell(`A${r2}`).value = 'ACCIDENTAL LABOUR AMOUNT';
  ws.getCell(`A${r2}`).font = { name: 'Calibri', size: 12, bold: true };
  ws.getCell(`A${r2}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`E${r2}:H${r2}`);
  const lCell = ws.getCell(`E${r2}`);
  lCell.value = totalAccidentalLabour > 0 ? totalAccidentalLabour : 0;
  lCell.font = { name: 'Calibri', size: 12, bold: true };
  lCell.alignment = { horizontal: 'center', vertical: 'middle' };
  lCell.numFmt = '#,##0';
  applyRangeBorder(r2, 1, r2, 8);

  // 3. PAINTING LABOUR
  const r3 = summaryStartRow + 2;
  ws.mergeCells(`A${r3}:D${r3}`);
  ws.getCell(`A${r3}`).value = 'PAINTING LABOUR';
  ws.getCell(`A${r3}`).font = { name: 'Calibri', size: 12, bold: true };
  ws.getCell(`A${r3}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`E${r3}:H${r3}`);
  const pCell = ws.getCell(`E${r3}`);
  pCell.value = totalPaintingLabour > 0 ? totalPaintingLabour : 0;
  pCell.font = { name: 'Calibri', size: 12, bold: true };
  pCell.alignment = { horizontal: 'center', vertical: 'middle' };
  pCell.numFmt = '#,##0';
  applyRangeBorder(r3, 1, r3, 8);

  // 4. TOTAL AMOUNT
  const r4 = summaryStartRow + 3;
  ws.mergeCells(`A${r4}:D${r4}`);
  ws.getCell(`A${r4}`).value = 'TOTAL AMOUNT';
  ws.getCell(`A${r4}`).font = { name: 'Calibri', size: 13, bold: true };
  ws.getCell(`A${r4}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`E${r4}:H${r4}`);
  const gCell = ws.getCell(`E${r4}`);
  gCell.value = grandTotal > 0 ? grandTotal : 0;
  gCell.font = { name: 'Calibri', size: 13, bold: true };
  gCell.alignment = { horizontal: 'center', vertical: 'middle' };
  gCell.numFmt = '#,##0';
  applyRangeBorder(r4, 1, r4, 8);

  // Export buffer & download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (ticket.ticket_number || `Ticket_${ticket.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  a.href = url;
  a.download = `Estimate_${safeName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    success: true,
    totalSpareAmount,
    totalAccidentalLabour,
    totalPaintingLabour,
    grandTotal
  };
}
