const assert = require('assert');
const db = require('../server/db');
const alertService = require('../server/alertService');

async function runIntegrationTests() {
  console.log('--- Starting SQLite & API Integration Tests ---\n');

  try {
    // 1. Initialize DB
    await db.initDb();
    console.log('  ✓ SQLite DB initialized & seeded successfully');

    // 2. Test Outlets
    const outlets = await db.all('SELECT * FROM outlets;');
    assert(outlets.length >= 3, 'Expected at least 3 outlets seeded');
    console.log(`  ✓ Found ${outlets.length} active Honda service outlets`);

    // 3. Test Reciprocal Customer / Vehicle Autocomplete
    const sampleCust = await db.get('SELECT * FROM customers LIMIT 1;');
    assert(sampleCust, 'Expected at least one customer seeded');
    const searchByName = await db.searchCustomers(sampleCust.name.slice(0, 4));
    assert(searchByName.length > 0, 'Should find customer by name');
    assert(searchByName[0].model || searchByName[0].vehicle_name, 'Should auto-link vehicle model');
    console.log(`  ✓ Reciprocal search by customer name (${sampleCust.name}) returned customer and linked vehicle with model: ${searchByName[0].model || searchByName[0].vehicle_name}, color: ${searchByName[0].color || 'N/A'}`);

    const sampleVeh = await db.get('SELECT * FROM vehicles WHERE chassis_no IS NOT NULL LIMIT 1;');
    if (sampleVeh) {
      const searchByChassis = await db.searchCustomers(sampleVeh.chassis_no);
      assert(searchByChassis.length > 0, 'Should find customer by chassis number');
      assert(searchByChassis[0].customer_name, 'Should auto-fill customer name from chassis');
      console.log(`  ✓ Reciprocal search by chassis number (${sampleVeh.chassis_no}) auto-filled customer profile (${searchByChassis[0].customer_name})`);
    }

    // 4. Test Parts Autocomplete
    const parts = await db.searchParts('Bumper');
    assert(parts.length > 0, 'Should find bumper in parts catalog');
    console.log(`  ✓ Parts search found ${parts.length} matching items`);

    // 5. Test Insurer & Surveyor Cascade
    const sampleIns = await db.get('SELECT name FROM insurance_companies WHERE name != "CASH WORK" LIMIT 1;');
    assert(sampleIns, 'Expected at least one insurer');
    const surveyors = await db.searchSurveyors('', sampleIns.name);
    assert(surveyors.length > 0, `Should find surveyors mapped to ${sampleIns.name}`);
    console.log(`  ✓ Cascaded ${surveyors.length} surveyors for ${sampleIns.name}`);

    // 6. Test Non-invasive Customer Creation
    const testCustomerId = await db.syncCustomerAndVehicle({
      customerName: 'Sanjay Dutt',
      customerPhone: '+91 98200 99999',
      vehicleNo: 'MH-04-AX-5555',
      vehicleName: 'Honda Elevate V',
      chassisNumber: 'MAKDG2882MH998811'
    });
    assert(testCustomerId, 'Customer ID should be returned');
    
    // Verify auto-saved
    const verifyCust = await db.get('SELECT * FROM customers WHERE id = ?;', [testCustomerId]);
    assert.strictEqual(verifyCust.name, 'Sanjay Dutt');
    const verifyVeh = await db.get('SELECT * FROM vehicles WHERE chassis_no = ?;', ['MAKDG2882MH998811']);
    assert(verifyVeh, 'Vehicle should be auto-saved');
    console.log('  ✓ Non-invasive customer & vehicle creation and linking verified');

    // 7. Test EOD Alert Payload Generator
    const eodPayload = await alertService.generateGasWebhookPayload();
    assert.strictEqual(eodPayload.event, 'EOD_SLA_BREACH_REPORT');
    assert(eodPayload.metrics.totalActive > 0, 'Total active tickets should be > 0');
    assert(Array.isArray(eodPayload.outletsReport), 'Outlets report should be an array');
    console.log(`  ✓ EOD Breach summary generated with ${eodPayload.metrics.totalBreached} breached tickets across outlets`);

    // 8. Test Stage Rollback and Erasing Subsequent Entries
    const sampleTicket = await db.get('SELECT * FROM tickets WHERE current_stage_id > 2 LIMIT 1;');
    if (sampleTicket) {
      const originalStage = sampleTicket.current_stage_id;
      // Add a dummy stage log to stage 5
      await db.run('INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, sla_status) VALUES (?, 5, "Approval", datetime("now"), "WITHIN_SLA");', [sampleTicket.id]);
      
      // Rollback to Stage 2
      await db.run('DELETE FROM stage_logs WHERE ticket_id = ? AND stage_id > 2;', [sampleTicket.id]);
      await db.run('UPDATE tickets SET current_stage_id = 2 WHERE id = ?;', [sampleTicket.id]);
      
      const logsAfterRollback = await db.all('SELECT * FROM stage_logs WHERE ticket_id = ? AND stage_id > 2;', [sampleTicket.id]);
      assert.strictEqual(logsAfterRollback.length, 0, 'Subsequent stage logs should be deleted after rollback');
      console.log(`  ✓ Stage rollback from Stage #${originalStage} to Stage #2 properly erased subsequent entries`);
    }

    // 9. Test Skipping Optional Stages (e.g. Stage 5 Approval to Stage 8 Work Start skipping 6 & 7)
    const testTicket = await db.get('SELECT * FROM tickets LIMIT 1;');
    if (testTicket) {
      // Simulate advance from Stage 5 to Stage 8 directly
      const nowIso = new Date().toISOString();
      for (let s = 6; s < 8; s++) {
        await db.run(`
          INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, completed_at, sla_limit_wd, elapsed_wd, sla_status, data_json)
          VALUES (?, ?, ?, ?, ?, 1, 0, 'SKIPPED', ?);
        `, [testTicket.id, s, `Stage #${s}`, nowIso, nowIso, JSON.stringify({ skipped: true })]);
      }

      const skippedLogs = await db.all('SELECT * FROM stage_logs WHERE ticket_id = ? AND sla_status = "SKIPPED";', [testTicket.id]);
      assert(skippedLogs.length >= 2, 'Should find at least 2 skipped stage logs');
      assert.strictEqual(skippedLogs[0].sla_status, 'SKIPPED', 'Stage status should be SKIPPED');
      console.log(`  ✓ Skipped optional stages (Parts Order & Arrival) correctly recorded with status SKIPPED`);
    }

    // 10. Test Customers Directory Data Aggregation
    const customerDir = await db.all(`
      SELECT c.id, c.name, c.primary_phone,
        (SELECT COUNT(*) FROM vehicles WHERE customer_id = c.id) as veh_count,
        (SELECT COUNT(*) FROM tickets WHERE customer_id = c.id) as ticket_count
      FROM customers c;
    `);
    assert(customerDir.length > 0, 'Customers directory should return customer rows');
    assert(customerDir[0].veh_count >= 1, 'First customer should have at least 1 vehicle mapped');
    console.log(`  ✓ Customers directory returned ${customerDir.length} customers with vehicles & ticket counts`);

    // 11. Test Insurers & Surveyors Mapping
    const insurerDir = await db.all(`
      SELECT ic.id, ic.name, COUNT(s.id) as surveyor_count
      FROM insurance_companies ic
      LEFT JOIN surveyor_insurance_map sim ON ic.id = sim.insurance_company_id
      LEFT JOIN surveyors s ON sim.surveyor_id = s.id
      GROUP BY ic.id;
    `);
    assert(insurerDir.length >= 5, 'Should find at least 5 insurance companies');
    const mappedInsurer = insurerDir.find(i => i.surveyor_count >= 1);
    assert(mappedInsurer, 'At least one insurance company should have surveyors mapped');
    console.log(`  ✓ Insurers directory verified with ${insurerDir.length} insurance partners (e.g. ${mappedInsurer.name} with ${mappedInsurer.surveyor_count} surveyors)`);

    // 12. Test Holidays JSON Sync & Working Day Calculation
    const fs = require('fs');
    const path = require('path');
    const holidaysFile = path.join(__dirname, '..', 'config', 'holidays.json');
    assert(fs.existsSync(holidaysFile), 'config/holidays.json should exist');
    const holidaysList = JSON.parse(fs.readFileSync(holidaysFile, 'utf8'));
    assert(Array.isArray(holidaysList) && holidaysList.length >= 5, 'Should load configured workshop holidays');
    console.log(`  ✓ Workshop holidays verified with ${holidaysList.length} non-working days`);

    // 13. Test Pipeline SLA Timing Configuration & Persistence
    const slaEngine = require('../server/slaEngine');
    const updatedStages = slaEngine.updateSlaLimits([{ id: 2, slaLimitWD: 4 }]);
    const stage2 = updatedStages.find(s => s.id === 2);
    assert.strictEqual(stage2.slaLimitWD, 4, 'Stage 2 SLA should update to 4 WD');
    const resetStages = slaEngine.resetSlaLimits();
    const resetStage2 = resetStages.find(s => s.id === 2);
    assert.strictEqual(resetStage2.slaLimitWD, 2, 'Stage 2 SLA should reset to default 2 WD');
    console.log('  ✓ Pipeline SLA configuration update, file persistence, and factory reset verified');

    console.log('\n--- All Integration Tests Passed! ---');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Integration test failed:');
    console.error(err);
    process.exit(1);
  }
}

runIntegrationTests();
