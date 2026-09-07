/**
 * Search Service
 * Combined search across students and guardians, so the front-desk
 * workflow doesn't require choosing a page before searching.
 * Deliberately not owned by studentService or guardianService - neither
 * entity should know about the other's search shape.
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';

export interface PersonSearchResult {
  type: 'student' | 'guardian';
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  // Archived students still surface here (this query has never excluded
  // them - see the WHERE clauses below, neither filters on archived_at)
  // so a name search never means "lost." Always null for a guardian row -
  // archiving is a student-record concept.
  archivedAt: string | null;
}

export const searchPeople = async (
  tenantId: string,
  term: string
): Promise<PersonSearchResult[]> => {
  const result = await query(
    `SELECT 'student' AS type, id, full_name AS name, email, phone, archived_at
     FROM students
     WHERE tenant_id = $1
       AND (full_name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%' OR phone ILIKE '%' || $2 || '%')

     UNION ALL

     SELECT 'guardian' AS type, id,
       TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name,
       email, phone, NULL AS archived_at
     FROM guardians
     WHERE tenant_id = $1
       AND (
         COALESCE(first_name, '') ILIKE '%' || $2 || '%'
         OR COALESCE(last_name, '') ILIKE '%' || $2 || '%'
         OR email ILIKE '%' || $2 || '%'
         OR phone ILIKE '%' || $2 || '%'
       )

     ORDER BY name
     LIMIT 50`,
    [tenantId, term]
  );

  return result.rows.map((row) => ({
    type: row.type,
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
  }));
};
