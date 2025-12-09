import { query } from '../config/database';

async function makeVehicleIdNullable() {
  try {
    console.log('Making vehicle_id column nullable in lessons table...');

    await query(`
      ALTER TABLE lessons
      ALTER COLUMN vehicle_id DROP NOT NULL;
    `);

    console.log('✅ Successfully made vehicle_id nullable');
    console.log('✅ Migration complete!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error making vehicle_id nullable:', error);
    process.exit(1);
  }
}

makeVehicleIdNullable();
