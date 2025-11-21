import { query } from '../config/database';

async function addPickupAddressColumn() {
  try {
    console.log('Adding pickup_address column to lessons table...');

    await query(`
      ALTER TABLE lessons
      ADD COLUMN IF NOT EXISTS pickup_address TEXT;
    `);

    console.log('✅ Successfully added pickup_address column');
    console.log('✅ Migration complete!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding pickup_address column:', error);
    process.exit(1);
  }
}

addPickupAddressColumn();
