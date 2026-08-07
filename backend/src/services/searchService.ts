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
}

export const searchPeople = async (
  tenantId: string,
  term: string
): Promise<PersonSearchResult[]> => {
  const result = await query(
    `SELECT 'student' AS type, id, full_name AS name, email, phone
     FROM students
     WHERE tenant_id = $1
       AND (full_name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%' OR phone ILIKE '%' || $2 || '%')

     UNION ALL

     SELECT 'guardian' AS type, id,
       TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name,
       email, phone
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
  }));
};
