/**
 * Fix Migration Script - Add DROP TRIGGER IF EXISTS statements
 * Makes the migration idempotent by dropping triggers before creating them
 */

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, 'migrations', '001_complete_schema.sql');

console.log('📝 Reading migration file...');
let sql = fs.readFileSync(migrationPath, 'utf8');

console.log('🔧 Adding DROP TRIGGER IF EXISTS statements...');

// Pattern to match: CREATE TRIGGER trigger_name BEFORE UPDATE ON table_name
const triggerPattern = /CREATE TRIGGER (\w+) BEFORE UPDATE ON (\w+)/g;

let matches = [];
let match;
while ((match = triggerPattern.exec(sql)) !== null) {
  matches.push({
    full: match[0],
    triggerName: match[1],
    tableName: match[2],
    index: match.index
  });
}

console.log(`Found ${matches.length} triggers to fix`);

// Replace in reverse order to preserve indices
for (let i = matches.length - 1; i >= 0; i--) {
  const m = matches[i];
  const dropStatement = `DROP TRIGGER IF EXISTS ${m.triggerName} ON ${m.tableName};\n`;
  const replacement = dropStatement + m.full;

  sql = sql.substring(0, m.index) + replacement + sql.substring(m.index + m.full.length);

  console.log(`  ✅ ${m.triggerName} on ${m.tableName}`);
}

console.log('\n💾 Writing updated migration file...');
fs.writeFileSync(migrationPath, sql, 'utf8');

console.log('✅ Migration file updated successfully!');
console.log('\nYou can now run: node database/run-migration.js');
