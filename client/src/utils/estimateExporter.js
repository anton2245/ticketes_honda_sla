import { fetchTicketParts } from '../api/tickets.js';

/**
 * Clean string for safe CSV field inclusion
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Downloads a structured Estimate CSV file for a given ticket
 */
export async function downloadTicketEstimate(ticket) {
  if (!ticket || !ticket.id) {
    throw new Error('Invalid ticket provided for estimate download.');
  }

  let parts = Array.isArray(ticket.parts) ? ticket.parts : [];
  if (parts.length === 0) {
    try {
      const fetched = await fetchTicketParts(ticket.id);
      if (Array.isArray(fetched)) {
        parts = fetched;
      }
    } catch (err) {
      console.warn('Could not fetch ticket parts from API, continuing with available data:', err);
    }
  }

  const nowStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const lines = [
    ['HONDA DEALERSHIP BODYSIGN & SERVICE CENTER - REPAIR ESTIMATE'],
    ['Generated At', nowStr],
    [],
    ['TICKET INFORMATION'],
    ['Ticket Number', ticket.ticket_number || `#${ticket.id}`],
    ['Customer Name', ticket.customer_name || 'Walk-in Customer'],
    ['Customer Phone', ticket.customer_phone || 'N/A'],
    ['Vehicle Plate / Reg No', ticket.vehicle_plate || ticket.vehicle_no || 'UNREGISTERED'],
    ['Vehicle Model', ticket.vehicle_model || ticket.model || 'Honda Vehicle'],
    ['Color', ticket.vehicle_color || ticket.color || 'N/A'],
    ['Chassis / VIN', ticket.chassis_number || ticket.chassis_no || 'N/A'],
    ['Insurance Company', ticket.insurance_company || 'CASH / NONE'],
    ['Surveyor Name', ticket.surveyor_name || 'N/A'],
    ['Surveyor Phone', ticket.surveyor_phone || 'N/A'],
    ['Current Stage', `Stage ${ticket.current_stage_id || 1}`],
    [],
    ['DEMANDED PARTS & LABOUR BREAKDOWN'],
    [
      'Item #',
      'Part Number (SKU)',
      'Part Description',
      'Qty',
      'Master MRP (INR)',
      'Parts Total (INR)',
      'Labour Charges (INR)',
      'Painting Charges (INR)',
      'Item Total (INR)',
      'Status'
    ]
  ];

  let totalPartsCost = 0;
  let totalLabourCost = 0;
  let totalPaintingCost = 0;
  let grandTotal = 0;

  if (parts.length === 0) {
    lines.push(['-', 'NO PARTS', 'No spare parts demanded or recorded for this estimate.', '0', '0.00', '0.00', '0.00', '0.00', '0.00', '-']);
  } else {
    parts.forEach((p, idx) => {
      const qty = Number(p.quantity || p.qty || 1);
      const mrp = Number(p.unit_cost || p.mrp || 0);
      const partsTotal = qty * mrp;
      const labour = Number(p.labour_charges || 0);
      const painting = Number(p.painting_charges || 0);
      const lineTotal = partsTotal + labour + painting;

      totalPartsCost += partsTotal;
      totalLabourCost += labour;
      totalPaintingCost += painting;
      grandTotal += lineTotal;

      lines.push([
        idx + 1,
        p.part_code || p.part_number || p.code || 'N/A',
        p.part_name || p.name || 'Spare Part',
        qty,
        mrp.toFixed(2),
        partsTotal.toFixed(2),
        labour.toFixed(2),
        painting.toFixed(2),
        lineTotal.toFixed(2),
        p.part_status || 'ESTIMATED'
      ]);
    });
  }

  lines.push([]);
  const labourTax = totalLabourCost * 0.18;
  const paintingTax = totalPaintingCost * 0.18;
  const totalTax = labourTax + paintingTax;
  const grandTotalWithTax = totalPartsCost + (totalLabourCost + labourTax) + (totalPaintingCost + paintingTax);

  lines.push(['FINANCIAL SUMMARY', '', '', '', '', '', '', '', '', '']);
  lines.push(['Total Spare Parts MRP (INR)', totalPartsCost.toFixed(2)]);
  lines.push(['Total Labour Charges (w/o tax) (INR)', totalLabourCost.toFixed(2)]);
  lines.push(['Labour 18% GST (INR)', labourTax.toFixed(2)]);
  lines.push(['Total Painting Charges (w/o tax) (INR)', totalPaintingCost.toFixed(2)]);
  lines.push(['Painting 18% GST (INR)', paintingTax.toFixed(2)]);
  lines.push(['Total 18% GST on Labour & Painting (INR)', totalTax.toFixed(2)]);
  lines.push(['Subtotal (Net w/o tax) (INR)', grandTotal.toFixed(2)]);
  lines.push(['ESTIMATED GRAND TOTAL (Inc. Taxes) (INR)', grandTotalWithTax.toFixed(2)]);

  const csvContent = '\uFEFF' + lines.map(row => row.map(escapeCsv).join(',')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTicketNum = (ticket.ticket_number || `Ticket_${ticket.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute('href', url);
  link.setAttribute('download', `Estimate_${safeTicketNum}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { success: true, count: parts.length, grandTotal };
}
