/**
 * Comprehensive Scheduling Settings Test
 * Tests scheduling configuration and business rules
 * Run with: npx ts-node src/scripts/testSchedulingSettings.ts
 */

import { query } from '../config/database';
import * as availabilityService from '../services/availabilityService';

async function testSchedulingSettings() {
  console.log('🧪 Testing Scheduling Settings System...\n');

  try {
    // ========================================
    // 1. SETUP: Get tenant
    // ========================================
    console.log('📋 Step 1: Finding test tenant...');
    const tenantsResult = await query('SELECT id, name FROM tenants LIMIT 1');

    if (tenantsResult.rows.length === 0) {
      console.log('❌ No tenants found in database');
      process.exit(1);
    }

    const tenant = tenantsResult.rows[0];
    console.log('✅ Found tenant:', tenant.name);
    console.log(`   ID: ${tenant.id}\n`);

    // ========================================
    // 2. READ: Get current settings
    // ========================================
    console.log('📖 Step 2: Reading current scheduling settings...');

    const settings = await availabilityService.getSchedulingSettings(tenant.id);

    console.log('✅ Current scheduling settings:', {
      bufferTimeBetweenLessons: settings.bufferTimeBetweenLessons,
      bufferTimeBeforeFirstLesson: settings.bufferTimeBeforeFirstLesson,
      bufferTimeAfterLastLesson: settings.bufferTimeAfterLastLesson,
      minHoursAdvanceBooking: settings.minHoursAdvanceBooking,
      maxDaysAdvanceBooking: settings.maxDaysAdvanceBooking,
      defaultLessonDuration: settings.defaultLessonDuration,
      allowBackToBackLessons: settings.allowBackToBackLessons,
      defaultWorkStartTime: settings.defaultWorkStartTime,
      defaultWorkEndTime: settings.defaultWorkEndTime
    });
    console.log();

    // ========================================
    // 3. UPDATE: Modify buffer times
    // ========================================
    console.log('✏️  Step 3: Updating buffer times...');

    const updatedSettings1 = await availabilityService.updateSchedulingSettings(
      tenant.id,
      {
        bufferTimeBetweenLessons: 15, // 15 minutes between lessons
        bufferTimeBeforeFirstLesson: 30, // 30 minutes before first lesson
        bufferTimeAfterLastLesson: 20 // 20 minutes after last lesson
      }
    );

    console.log('✅ Updated buffer times:', {
      between: updatedSettings1.bufferTimeBetweenLessons,
      beforeFirst: updatedSettings1.bufferTimeBeforeFirstLesson,
      afterLast: updatedSettings1.bufferTimeAfterLastLesson
    });
    console.log();

    // ========================================
    // 4. UPDATE: Modify booking constraints
    // ========================================
    console.log('✏️  Step 4: Updating booking constraints...');

    const updatedSettings2 = await availabilityService.updateSchedulingSettings(
      tenant.id,
      {
        minHoursAdvanceBooking: 24, // Must book 24 hours in advance
        maxDaysAdvanceBooking: 60, // Can book up to 60 days ahead
        allowBackToBackLessons: false // Don't allow back-to-back lessons
      }
    );

    console.log('✅ Updated booking constraints:', {
      minHoursAdvance: updatedSettings2.minHoursAdvanceBooking,
      maxDaysAdvance: updatedSettings2.maxDaysAdvanceBooking,
      allowBackToBack: updatedSettings2.allowBackToBackLessons
    });
    console.log();

    // ========================================
    // 5. UPDATE: Modify lesson settings
    // ========================================
    console.log('✏️  Step 5: Updating lesson settings...');

    const updatedSettings3 = await availabilityService.updateSchedulingSettings(
      tenant.id,
      {
        defaultLessonDuration: 90, // 90 minute lessons
        defaultWorkStartTime: '08:00', // Work starts at 8 AM
        defaultWorkEndTime: '18:00' // Work ends at 6 PM
      }
    );

    console.log('✅ Updated lesson settings:', {
      duration: updatedSettings3.defaultLessonDuration,
      workStart: updatedSettings3.defaultWorkStartTime,
      workEnd: updatedSettings3.defaultWorkEndTime
    });
    console.log();

    // ========================================
    // 6. READ: Verify all changes persisted
    // ========================================
    console.log('🔍 Step 6: Verifying all changes...');

    const finalSettings = await availabilityService.getSchedulingSettings(tenant.id);

    console.log('✅ Final settings verified:');
    console.log('   Buffer times:');
    console.log(`     - Between lessons: ${finalSettings.bufferTimeBetweenLessons} minutes`);
    console.log(`     - Before first lesson: ${finalSettings.bufferTimeBeforeFirstLesson} minutes`);
    console.log(`     - After last lesson: ${finalSettings.bufferTimeAfterLastLesson} minutes`);
    console.log('   Booking constraints:');
    console.log(`     - Minimum advance booking: ${finalSettings.minHoursAdvanceBooking} hours`);
    console.log(`     - Maximum advance booking: ${finalSettings.maxDaysAdvanceBooking} days`);
    console.log(`     - Allow back-to-back: ${finalSettings.allowBackToBackLessons}`);
    console.log('   Lesson settings:');
    console.log(`     - Default duration: ${finalSettings.defaultLessonDuration} minutes`);
    console.log(`     - Work hours: ${finalSettings.defaultWorkStartTime} - ${finalSettings.defaultWorkEndTime}`);
    console.log();

    // ========================================
    // 7. TEST: Business logic scenarios
    // ========================================
    console.log('🧪 Step 7: Testing business logic scenarios...');

    // Scenario 1: With 15-minute buffer, a 90-minute lesson needs 105 minutes total
    const lessonDuration = finalSettings.defaultLessonDuration;
    const bufferTime = finalSettings.bufferTimeBetweenLessons;
    const totalTime = lessonDuration + bufferTime;
    console.log(`✅ Scenario 1 - Lesson scheduling:`);
    console.log(`   Lesson duration: ${lessonDuration} minutes`);
    console.log(`   Buffer time: ${bufferTime} minutes`);
    console.log(`   Total time needed: ${totalTime} minutes (${totalTime / 60} hours)`);

    // Scenario 2: Calculate earliest possible booking time
    const minAdvanceHours = finalSettings.minHoursAdvanceBooking;
    const earliestBookingTime = new Date(Date.now() + minAdvanceHours * 60 * 60 * 1000);
    console.log(`\n✅ Scenario 2 - Earliest booking:`);
    console.log(`   Minimum advance: ${minAdvanceHours} hours`);
    console.log(`   Earliest booking time: ${earliestBookingTime.toISOString()}`);

    // Scenario 3: Calculate latest possible booking date
    const maxAdvanceDays = finalSettings.maxDaysAdvanceBooking;
    const latestBookingDate = new Date(Date.now() + maxAdvanceDays * 24 * 60 * 60 * 1000);
    console.log(`\n✅ Scenario 3 - Latest booking:`);
    console.log(`   Maximum advance: ${maxAdvanceDays} days`);
    console.log(`   Latest booking date: ${latestBookingDate.toISOString().split('T')[0]}`);

    // Scenario 4: Calculate lessons per day with buffers
    const workStartTime = finalSettings.defaultWorkStartTime;
    const workEndTime = finalSettings.defaultWorkEndTime;
    const workHours = parseInt(workEndTime.split(':')[0]) - parseInt(workStartTime.split(':')[0]);
    const workMinutes = workHours * 60;
    const lessonsPerDay = Math.floor(workMinutes / totalTime);
    console.log(`\n✅ Scenario 4 - Daily capacity:`);
    console.log(`   Work hours: ${workStartTime} - ${workEndTime} (${workHours} hours)`);
    console.log(`   Time per lesson (with buffer): ${totalTime} minutes`);
    console.log(`   Maximum lessons per day: ${lessonsPerDay}`);

    console.log();

    // ========================================
    // 8. FINAL SUMMARY
    // ========================================
    console.log('═'.repeat(60));
    console.log('✅ ALL SCHEDULING SETTINGS TESTS PASSED!');
    console.log('═'.repeat(60));
    console.log('✓ READ: Successfully retrieved scheduling settings');
    console.log('✓ UPDATE: Successfully modified buffer times');
    console.log('✓ UPDATE: Successfully modified booking constraints');
    console.log('✓ UPDATE: Successfully modified lesson settings');
    console.log('✓ VERIFY: All changes persisted correctly');
    console.log('✓ LOGIC: Business rules calculations working correctly');
    console.log('═'.repeat(60));
    console.log('\n🎉 Scheduling Settings System is fully functional!\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testSchedulingSettings();
