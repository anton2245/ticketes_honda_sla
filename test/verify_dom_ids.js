const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const requiredIds = [
  'partsCardsContainer',
  'partsTableContainer',
  'partsDetailsTable',
  'partsDetailsTableBody',
  'btnPartsViewCards',
  'btnPartsViewTable',
  'modalPartDetailsCompact',
  'partDetailsCompactTitle',
  'partDetailsConsumptionBody',
  'vehicleDetailDossier',
  'vehiclesMasterList',
  'partsSearchInput',
  'partsFilterChips',
  'partsOrdersSearchInput',
  'partsOrdersFilterChips',
  'partsOrdersTable',
  'partsOrdersTableBody',
  'kpiTotalPartsOrdered',
  'kpiPendingPartsOrders',
  'kpiArrivedPartsOrders',
  'kpiTotalProcurementCost'
];

let missing = [];
requiredIds.forEach(id => {
  if (!html.includes('id="' + id + '"')) {
    missing.push(id);
  }
});

console.log('Checked ' + requiredIds.length + ' IDs.');
if (missing.length > 0) {
  console.error('Missing IDs in index.html:', missing);
  process.exit(1);
} else {
  console.log('All required IDs present in index.html!');
}
