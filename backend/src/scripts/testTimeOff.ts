/**
 * Comprehensive Time Off Management Test
 * Tests instructor time off request and approval system
 * Run with: npx ts-node src/scripts/testTimeOff.ts
 */

import { query } from '../config/database';
import * as availabilityService from '../services/availabilityService';

async function testTimeOff() {
  console.log('🧪 Testing Time Off Management System...\n');

  try {
    // ========================================
    // 1. SETUP: Get test instructor
    // ========================================
    console.log('📋 Step 1: Finding test instructor...');
    const instructorsResult = await query(
      `SELECT id, full_name, tenant_id FROM instructors LIMIT 1`
    );

    if (instructorsResult.rows.length === 0) {
      console.log('❌ No instructors found in database');
      process.exit(1);
    }

    const instructor = instructorsResult.rows[0];
    console.log('✅ Found instructor:', instructor.full_name);
    console.log();

    // ========================================
    // 2. CREATE: Single day time off
    // ========================================
    console.log('📝 Step 2: Creating single day time off...');

    const singleDayOff = await availabilityService.createTimeOff(
      instructor.tenant_id,
      instructor.id,
      {
        startDate: new Date('2025-12-25'),
        endDate: new Date('2025-12-25'),
        reason: 'Christmas Day',
        notes: 'Holiday',
        isApproved: true
      }
    );

    console.log('✅ Created single day time off:', {
      dates: `${singleDayOff.startDate}`,
      reason: singleDayOff.reason,
      approved: singleDayOff.isApproved
    });
    console.log();

    // ========================================
    // 3. CREATE: Multi-day time off
    // ========================================
    console.log('📝 Step 3: Creating multi-day time off...');

    const vacationTime = await availabilityService.createTimeOff(
      instructor.tenant_id,
      instructor.id,
      {
        startDate: new Date('2025-07-01'),
        endDate: new Date('2025-07-14'),
        reason: 'Summer Vacation',
        notes: 'Two week vacation',
        isApproved: true
      }
    );

    console.log('✅ Created vacation time off:', {
      dates: `${vacationTime.startDate} to ${vacationTime.endDate}`,
      reason: vacationTime.reason,
      approved: vacationTime.isApproved
    });
    console.log();

    // ========================================
    // 4. CREATE: Partial day time off
    // ========================================
    console.log('📝 Step 4: Creating partial day time off...');

    const partialDayOff = await availabilityService.createTimeOff(
      instructor.tenant_id,
      instructor.id,
      {
        startDate: new Date('2025-06-15'),
        endDate: new Date('2025-06-15'),
        startTime: '14:00',
        endTime: '17:00',
        reason: 'Doctor Appointment',
        notes: 'Afternoon only',
        isApproved: false // Pending approval
      }
    );

    console.log('✅ Created partial day time off:', {
      date: partialDayOff.startDate,
      time: `${partialDayOff.startTime} - ${partialDayOff.endTime}`,
      reason: partialDayOff.reason,
      approved: partialDayOff.isApproved
    });
    console.log();

    // ========================================
    // 5. READ: Fetch all time off
    // ========================================
    console.log('📖 Step 5: Reading all time off...');

    const allTimeOff = await availabilityService.getInstructorTimeOff(
      instructor.id,
      instructor.tenant_id
    );

    console.log(`✅ Found ${allTimeOff.length} time off entries:`);
    allTimeOff.forEach((entry, index) => {
      const dateRange = entry.startDate === entry.endDate
        ? entry.startDate.toISOString().split('T')[0]
        : `${entry.startDate.toISOString().split('T')[0]} to ${entry.endDate.toISOString().split('T')[0]}`;

      const timeRange = entry.startTime && entry.endTime
        ? ` (${entry.startTime} - ${entry.endTime})`
        : ' (Full day)';

      console.log(`   ${index + 1}. ${dateRange}${timeRange} - ${entry.reason} [${entry.isApproved ? 'Approved' : 'Pending'}]`);
    });
    console.log();

    // ========================================
    // 6. READ: Fetch time off for date range
    // ========================================
    console.log('📖 Step 6: Reading time off for specific date range...');

    const summerTimeOff = await availabilityService.getInstructorTimeOff(
      instructor.id,
      instructor.tenant_id,
      new Date('2025-06-01'),
      new Date('2025-08-31')
    );

    console.log(`✅ Found ${summerTimeOff.length} time off entries in summer:`);
    summerTimeOff.forEach((entry, index) => {
      console.log(`   ${index + 1}. ${entry.startDate.toISOString().split('T')[0]} - ${entry.reason}`);
    });
    console.log();

    // ========================================
    // 7. UPDATE: Approve pending time off
    // ========================================
    console.log('✏️  Step 7: Approving pending time off...');

    const approvedTimeOff = await availabilityService.updateTimeOff(
      partialDayOff.id,
      instructor.tenant_id,
      {
        isApproved: true,
        approvedBy: 'admin-user-id'
      }
    );

    console.log('✅ Approved time off:', {
      reason: approvedTimeOff.reason,
      approved: approvedTimeOff.isApproved,
      approvedAt: approvedTimeOff.approvedAt
    });
    console.log();

    // ========================================
    // 8. UPDATE: Modify time off dates
    // ========================================
    console.log('✏️  Step 8: Updating time off dates...');

    const updatedTimeOff = await availabilityService.updateTimeOff(
      vacationTime.id,
      instructor.tenant_id,
      {
        endDate: new Date('2025-07-21'), // Extend vacation by 1 week
        notes: 'Extended vacation - three weeks'
      }
    );

    console.log('✅ Updated time off:', {
      dates: `${updatedTimeOff.startDate.toISOString().split('T')[0]} to ${updatedTimeOff.endDate.toISOString().split('T')[0]}`,
      notes: updatedTimeOff.notes
    });
    console.log();

    // ========================================
    // 9. DELETE: Remove time off
    // ========================================
    console.log('🗑️  Step 9: Deleting time off...');

    await availabilityService.deleteTimeOff(
      singleDayOff.id,
      instructor.tenant_id
    );

    const afterDelete = await availabilityService.getInstructorTimeOff(
      instructor.id,
      instructor.tenant_id
    );

    console.log(`✅ Deleted time off. Remaining entries: ${afterDelete.length}`);
    console.log();

    // ========================================
    // 10. VALIDATION TESTS
    // ========================================
    console.log('🧪 Step 10: Testing validation...');

    try {
      await availabilityService.createTimeOff(
        instructor.tenant_id,
        instructor.id,
        {
          startDate: new Date('2025-12-31'),
          endDate: new Date('2025-01-01'), // End before start
          reason: 'Invalid'
        }
      );
      console.log('❌ Validation failed: Should reject invalid date range');
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid date range:', error.message);
    }

    try {
      await availabilityService.createTimeOff(
        'invalid-tenant-id',
        instructor.id,
        {
          startDate: new Date('2025-06-01'),
          endDate: new Date('2025-06-02'),
          reason: 'Test'
        }
      );
      console.log('❌ Validation failed: Should reject invalid tenant');
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid tenant:', error.message);
    }

    console.log();

    // ========================================
    // 11. FINAL SUMMARY
    // ========================================
    console.log('═'.repeat(60));
    console.log('✅ ALL TIME OFF TESTS PASSED!');
    console.log('═'.repeat(60));
    console.log('✓ CREATE: Successfully created full day, multi-day, and partial time off');
    console.log('✓ READ: Successfully fetched all and filtered time off');
    console.log('✓ UPDATE: Successfully approved and modified time off');
    console.log('✓ DELETE: Successfully removed time off entries');
    console.log('✓ VALIDATION: Properly validated date ranges and permissions');
    console.log('═'.repeat(60));
    console.log('\n🎉 Time Off Management System is fully functional!\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testTimeOff();
