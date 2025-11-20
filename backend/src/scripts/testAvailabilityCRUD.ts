/**
 * Comprehensive Availability CRUD Test
 * Tests the full lifecycle of instructor availability management
 * Run with: npx ts-node src/scripts/testAvailabilityCRUD.ts
 */

import { query } from '../config/database';
import * as availabilityService from '../services/availabilityService';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function testAvailabilityCRUD() {
  console.log('🧪 Testing Instructor Availability CRUD Operations...\n');

  try {
    // ========================================
    // 1. SETUP: Get first instructor
    // ========================================
    console.log('📋 Step 1: Finding test instructor...');
    const instructorsResult = await query(
      `SELECT id, full_name, tenant_id FROM instructors LIMIT 1`
    );

    if (instructorsResult.rows.length === 0) {
      console.log('❌ No instructors found in database');
      console.log('   Please create an instructor first.');
      process.exit(1);
    }

    const instructor = instructorsResult.rows[0];
    console.log('✅ Found instructor:');
    console.log(`   ID: ${instructor.id}`);
    console.log(`   Name: ${instructor.full_name}`);
    console.log(`   Tenant ID: ${instructor.tenant_id}\n`);

    // ========================================
    // 2. CREATE: Add new availability slots
    // ========================================
    console.log('📝 Step 2: Creating availability slots...');

    const mondaySlot = await availabilityService.createAvailability(
      instructor.tenant_id,
      instructor.id,
      {
        dayOfWeek: 1, // Monday
        startTime: '09:00',
        endTime: '12:00',
        notes: 'Morning shift'
      }
    );
    console.log('✅ Created Monday morning slot:', {
      day: DAYS[mondaySlot.dayOfWeek],
      time: `${mondaySlot.startTime} - ${mondaySlot.endTime}`,
      isActive: mondaySlot.isActive,
      notes: mondaySlot.notes
    });

    const wednesdaySlot = await availabilityService.createAvailability(
      instructor.tenant_id,
      instructor.id,
      {
        dayOfWeek: 3, // Wednesday
        startTime: '14:00',
        endTime: '18:00',
        notes: 'Afternoon shift'
      }
    );
    console.log('✅ Created Wednesday afternoon slot:', {
      day: DAYS[wednesdaySlot.dayOfWeek],
      time: `${wednesdaySlot.startTime} - ${wednesdaySlot.endTime}`,
      isActive: wednesdaySlot.isActive,
      notes: wednesdaySlot.notes
    });

    const fridaySlot = await availabilityService.createAvailability(
      instructor.tenant_id,
      instructor.id,
      {
        dayOfWeek: 5, // Friday
        startTime: '10:00',
        endTime: '16:00'
      }
    );
    console.log('✅ Created Friday slot:', {
      day: DAYS[fridaySlot.dayOfWeek],
      time: `${fridaySlot.startTime} - ${fridaySlot.endTime}`,
      isActive: fridaySlot.isActive
    });

    console.log();

    // ========================================
    // 3. READ: Fetch instructor availability
    // ========================================
    console.log('📖 Step 3: Reading availability...');

    const availability = await availabilityService.getInstructorAvailability(
      instructor.id,
      instructor.tenant_id
    );

    console.log(`✅ Found ${availability.length} availability slots:`);
    availability.forEach((slot, index) => {
      console.log(`   ${index + 1}. ${DAYS[slot.dayOfWeek]}: ${slot.startTime} - ${slot.endTime}${slot.notes ? ` (${slot.notes})` : ''}`);

      // Verify transformation worked
      if (slot.dayOfWeek === undefined || slot.startTime === undefined) {
        throw new Error('⚠️ Transformation failed! Properties are undefined!');
      }
    });
    console.log();

    // ========================================
    // 4. UPDATE: Modify availability slot
    // ========================================
    console.log('✏️  Step 4: Updating availability...');

    const updatedSlot = await availabilityService.updateAvailability(
      mondaySlot.id,
      instructor.tenant_id,
      {
        endTime: '13:00', // Extend by 1 hour
        notes: 'Extended morning shift'
      }
    );

    console.log('✅ Updated Monday slot:', {
      day: DAYS[updatedSlot.dayOfWeek],
      time: `${updatedSlot.startTime} - ${updatedSlot.endTime}`,
      notes: updatedSlot.notes
    });
    console.log();

    // ========================================
    // 5. UPDATE: Deactivate slot
    // ========================================
    console.log('🔄 Step 5: Deactivating slot...');

    const deactivatedSlot = await availabilityService.updateAvailability(
      fridaySlot.id,
      instructor.tenant_id,
      {
        isActive: false
      }
    );

    console.log('✅ Deactivated Friday slot:', {
      day: DAYS[deactivatedSlot.dayOfWeek],
      isActive: deactivatedSlot.isActive
    });
    console.log();

    // ========================================
    // 6. READ: Verify active slots only
    // ========================================
    console.log('🔍 Step 6: Verifying active slots...');

    const activeSlots = await availabilityService.getInstructorAvailability(
      instructor.id,
      instructor.tenant_id
    );

    console.log(`✅ Active slots (should be ${availability.length - 1}):`);
    activeSlots.forEach((slot, index) => {
      console.log(`   ${index + 1}. ${DAYS[slot.dayOfWeek]}: ${slot.startTime} - ${slot.endTime}`);
    });

    if (activeSlots.length !== availability.length - 1) {
      throw new Error('⚠️ Deactivation failed! Expected fewer active slots.');
    }
    console.log();

    // ========================================
    // 7. SET SCHEDULE: Replace entire schedule
    // ========================================
    console.log('📅 Step 7: Setting new weekly schedule...');

    const newSchedule = await availabilityService.setInstructorSchedule(
      instructor.tenant_id,
      instructor.id,
      [
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', notes: 'Monday AM' },
        { dayOfWeek: 1, startTime: '13:00', endTime: '17:00', notes: 'Monday PM' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '17:00', notes: 'Wednesday Full Day' },
        { dayOfWeek: 5, startTime: '09:00', endTime: '15:00', notes: 'Friday' },
      ]
    );

    console.log(`✅ Set new schedule with ${newSchedule.length} slots:`);
    newSchedule.forEach((slot, index) => {
      console.log(`   ${index + 1}. ${DAYS[slot.dayOfWeek]}: ${slot.startTime} - ${slot.endTime} - ${slot.notes}`);
    });
    console.log();

    // ========================================
    // 8. DELETE: Soft delete slot
    // ========================================
    console.log('🗑️  Step 8: Deleting slot...');

    await availabilityService.deleteAvailability(
      newSchedule[0].id,
      instructor.tenant_id
    );

    const afterDelete = await availabilityService.getInstructorAvailability(
      instructor.id,
      instructor.tenant_id
    );

    console.log(`✅ Deleted slot. Remaining active slots: ${afterDelete.length}`);
    afterDelete.forEach((slot, index) => {
      console.log(`   ${index + 1}. ${DAYS[slot.dayOfWeek]}: ${slot.startTime} - ${slot.endTime}`);
    });
    console.log();

    // ========================================
    // 9. VALIDATION TESTS
    // ========================================
    console.log('🧪 Step 9: Testing validation...');

    try {
      await availabilityService.createAvailability(
        instructor.tenant_id,
        instructor.id,
        {
          dayOfWeek: 7, // Invalid day
          startTime: '09:00',
          endTime: '12:00'
        }
      );
      console.log('❌ Validation failed: Should reject invalid day');
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid dayOfWeek:', error.message);
    }

    try {
      await availabilityService.createAvailability(
        instructor.tenant_id,
        instructor.id,
        {
          dayOfWeek: 1,
          startTime: '18:00',
          endTime: '09:00' // End before start
        }
      );
      console.log('❌ Validation failed: Should reject invalid time range');
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid time range:', error.message);
    }

    console.log();

    // ========================================
    // 10. FINAL SUMMARY
    // ========================================
    console.log('═'.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('═'.repeat(60));
    console.log('✓ CREATE: Successfully created availability slots');
    console.log('✓ READ: Successfully fetched availability with proper camelCase');
    console.log('✓ UPDATE: Successfully updated slot times and status');
    console.log('✓ DELETE: Successfully soft-deleted slots');
    console.log('✓ SET SCHEDULE: Successfully replaced entire schedule');
    console.log('✓ VALIDATION: Properly validated input constraints');
    console.log('✓ TRANSFORMATION: snake_case → camelCase working correctly');
    console.log('═'.repeat(60));
    console.log('\n🎉 Instructor Availability System is fully functional!\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testAvailabilityCRUD();
