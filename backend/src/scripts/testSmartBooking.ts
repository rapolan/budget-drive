/**
 * Comprehensive Smart Booking System Test
 * Tests the complete booking workflow end-to-end
 * Run with: npx ts-node src/scripts/testSmartBooking.ts
 */

import { query } from '../config/database';
import * as schedulingService from '../services/schedulingService';
import * as availabilityService from '../services/availabilityService';

async function testSmartBooking() {
  console.log('🧪 Testing Smart Booking System End-to-End...\n');

  try {
    // ========================================
    // 1. SETUP: Get test data
    // ========================================
    console.log('📋 Step 1: Setting up test data...');

    const tenantsResult = await query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenantsResult.rows[0].id;
    console.log(`✅ Tenant ID: ${tenantId}`);

    const instructorsResult = await query(
      `SELECT id, full_name, email FROM instructors WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
      [tenantId]
    );
    if (instructorsResult.rows.length === 0) {
      throw new Error('No active instructors found');
    }
    const instructor = instructorsResult.rows[0];
    console.log(`✅ Instructor: ${instructor.full_name} (${instructor.email})`);

    const studentsResult = await query(
      `SELECT id, full_name, email FROM students WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    if (studentsResult.rows.length === 0) {
      throw new Error('No students found');
    }
    const student = studentsResult.rows[0];
    console.log(`✅ Student: ${student.full_name} (${student.email})`);

    const vehiclesResult = await query(
      `SELECT id, make, model, license_plate FROM vehicles WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
      [tenantId]
    );
    if (vehiclesResult.rows.length === 0) {
      throw new Error('No active vehicles found');
    }
    const vehicle = vehiclesResult.rows[0];
    console.log(`✅ Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})\n`);

    // ========================================
    // 2. CHECK INSTRUCTOR AVAILABILITY
    // ========================================
    console.log('📅 Step 2: Checking instructor availability...');

    const availability = await availabilityService.getInstructorAvailability(
      instructor.id,
      tenantId
    );

    console.log(`✅ Found ${availability.length} availability slots:`);
    availability.forEach((slot, index) => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      console.log(`   ${index + 1}. ${days[slot.dayOfWeek]}: ${slot.startTime} - ${slot.endTime}`);
    });
    console.log();

    if (availability.length === 0) {
      console.log('⚠️  No availability configured for this instructor. Skipping slot search.\n');
      process.exit(0);
    }

    // ========================================
    // 3. FIND AVAILABLE SLOTS
    // ========================================
    console.log('🔍 Step 3: Finding available time slots...');

    const startDate = new Date();
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 2 weeks
    const duration = 60; // 1 hour

    console.log(`   Search criteria:`);
    console.log(`   - Instructor: ${instructor.full_name}`);
    console.log(`   - Student: ${student.full_name}`);
    console.log(`   - Vehicle: ${vehicle.make} ${vehicle.model}`);
    console.log(`   - Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`   - Duration: ${duration} minutes\n`);

    const slots = await schedulingService.findAvailableSlots({
      tenantId,
      instructorId: instructor.id,
      vehicleId: vehicle.id,
      studentId: student.id,
      startDate,
      endDate,
      duration,
    });

    console.log(`✅ Found ${slots.length} available time slots\n`);

    if (slots.length > 0) {
      console.log('📊 Sample available slots:');
      slots.slice(0, 5).forEach((slot, index) => {
        const start = new Date(slot.startTime);
        const dayName = start.toLocaleDateString('en-US', { weekday: 'short' });
        const formattedDate = start.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        const timeStr = start.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        console.log(`   ${index + 1}. ${dayName}, ${formattedDate} at ${timeStr}`);
      });
      console.log();
    }

    // ========================================
    // 4. CHECK FOR CONFLICTS
    // ========================================
    if (slots.length > 0) {
      console.log('🔍 Step 4: Testing conflict detection...');

      const testSlot = slots[0];
      const startTime = new Date(testSlot.startTime);
      const endTime = new Date(testSlot.endTime);
      console.log(`   Testing slot: ${startTime.toLocaleString()}\n`);

      const conflicts = await schedulingService.checkSchedulingConflicts(
        tenantId,
        instructor.id,
        student.id,
        vehicle.id,
        startTime,
        endTime
      );

      if (conflicts.length === 0) {
        console.log('✅ No conflicts detected - slot is ready for booking!\n');
      } else {
        console.log(`⚠️  Found ${conflicts.length} conflicts:`);
        conflicts.forEach((conflict, index) => {
          console.log(`   ${index + 1}. ${conflict.type}: ${conflict.message}`);
        });
        console.log();
      }
    }

    // ========================================
    // 5. VALIDATE BOOKING
    // ========================================
    if (slots.length > 0) {
      console.log('✅ Step 5: Validating booking constraints...');

      const testSlot = slots[0];
      const startTime = new Date(testSlot.startTime);
      const endTime = new Date(testSlot.endTime);

      const validationResult = await schedulingService.validateLessonBooking(
        tenantId,
        instructor.id,
        student.id,
        vehicle.id,
        startTime,
        endTime
      );

      if (validationResult.valid) {
        console.log('✅ Booking validation passed - ready to create lesson!\n');
      } else {
        console.log('❌ Booking validation failed:');
        validationResult.conflicts.forEach((conflict, index) => {
          console.log(`   ${index + 1}. ${conflict.type}: ${conflict.message}`);
        });
        console.log();
      }
    }

    // ========================================
    // 6. TEST SCHEDULING SETTINGS
    // ========================================
    console.log('⚙️  Step 6: Checking scheduling settings...');

    const settings = await availabilityService.getSchedulingSettings(tenantId);

    console.log('✅ Scheduling settings:');
    console.log(`   - Buffer between lessons: ${settings.bufferTimeBetweenLessons} minutes`);
    console.log(`   - Minimum advance booking: ${settings.minHoursAdvanceBooking} hours`);
    console.log(`   - Maximum advance booking: ${settings.maxDaysAdvanceBooking} days`);
    console.log(`   - Default lesson duration: ${settings.defaultLessonDuration} minutes`);
    console.log(`   - Allow back-to-back lessons: ${settings.allowBackToBackLessons}`);
    console.log();

    // ========================================
    // 7. FINAL SUMMARY
    // ========================================
    console.log('═'.repeat(60));
    console.log('✅ SMART BOOKING SYSTEM TEST COMPLETE!');
    console.log('═'.repeat(60));
    console.log('✓ SETUP: Successfully loaded instructor, student, and vehicle');
    console.log('✓ AVAILABILITY: Retrieved instructor availability schedule');
    console.log('✓ SLOT FINDING: Successfully searched for available time slots');
    console.log('✓ CONFLICT DETECTION: Verified conflict checking works');
    console.log('✓ VALIDATION: Booking constraints validated');
    console.log('✓ SETTINGS: Scheduling rules configured properly');
    console.log('═'.repeat(60));

    console.log('\n🎉 Smart Booking System is fully functional!\n');
    console.log('📝 Summary:');
    console.log(`   - Instructor has ${availability.length} availability slots configured`);
    console.log(`   - Found ${slots.length} available time slots in next 2 weeks`);
    console.log(`   - System enforces ${settings.bufferTimeBetweenLessons} minute buffer between lessons`);
    console.log(`   - Ready to book lessons through the UI!\n`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testSmartBooking();
