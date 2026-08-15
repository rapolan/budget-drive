/**
 * Tenant Service
 * Business logic for tenant management
 */

import { query } from '../config/database';
import { Tenant, TenantSettings, TenantFullInfo } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';

/**
 * Get tenant by ID
 */
export const getTenantById = async (id: string): Promise<TenantFullInfo | null> => {
  const result = await query(
    'SELECT * FROM tenant_full_info WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as TenantFullInfo;
};

/**
 * Get tenant by slug
 */
export const getTenantBySlug = async (slug: string): Promise<TenantFullInfo | null> => {
  const result = await query(
    'SELECT * FROM tenant_full_info WHERE slug = $1',
    [slug]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as TenantFullInfo;
};

/**
 * Get all tenants (admin only)
 */
export const getAllTenants = async (): Promise<Tenant[]> => {
  const result = await query(
    `SELECT * FROM tenants ORDER BY created_at DESC`
  );

  return result.rows as Tenant[];
};

/**
 * Create new tenant
 */
export const createTenant = async (data: {
  name: string;
  slug: string;
  email: string;
  phone?: string;
  domain?: string;
  planTier?: 'basic' | 'professional' | 'enterprise';
}): Promise<Tenant> => {
  // Check if slug already exists
  const existing = await getTenantBySlug(data.slug);
  if (existing) {
    throw new AppError('Tenant with this slug already exists', 400);
  }

  const result = await query(
    `INSERT INTO tenants (name, slug, email, phone, domain, plan_tier)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.name,
      data.slug,
      data.email,
      data.phone || null,
      data.domain || null,
      data.planTier || 'enterprise',
    ]
  );

  const tenant = result.rows[0] as Tenant;

  // Create default tenant settings
  await createDefaultTenantSettings(tenant.id, data.name);

  return tenant;
};

/**
 * Create default tenant settings
 */
const createDefaultTenantSettings = async (
  tenantId: string,
  businessName: string
): Promise<void> => {
  await query(
    `INSERT INTO tenant_settings (tenant_id, business_name)
     VALUES ($1, $2)`,
    [tenantId, businessName]
  );
};

/**
 * Update tenant
 */
export const updateTenant = async (
  id: string,
  data: Partial<Tenant>
): Promise<Tenant> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Build dynamic update query
  if (data.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }
  if (data.domain !== undefined) {
    fields.push(`domain = $${paramCount++}`);
    values.push(data.domain);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    values.push(data.status);
  }
  if (data.planTier !== undefined) {
    fields.push(`plan_tier = $${paramCount++}`);
    values.push(data.planTier);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(id);

  const result = await query(
    `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Tenant not found', 404);
  }

  return result.rows[0] as Tenant;
};

/**
 * Delete tenant (soft delete by setting status to cancelled)
 */
export const deleteTenant = async (id: string): Promise<void> => {
  const result = await query(
    `UPDATE tenants SET status = 'cancelled' WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Tenant not found', 404);
  }
};

/**
 * Get tenant settings
 */
export const getTenantSettings = async (tenantId: string): Promise<TenantSettings | null> => {
  const result = await query(
    'SELECT * FROM tenant_settings WHERE tenant_id = $1',
    [tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return keysToCamel(result.rows[0]) as TenantSettings;
};

/**
 * Update tenant settings
 */
export const updateTenantSettings = async (
  tenantId: string,
  data: Partial<TenantSettings>
): Promise<TenantSettings> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Branding
  if (data.businessName !== undefined) {
    fields.push(`business_name = $${paramCount++}`);
    values.push(data.businessName);
  }
  if (data.businessTagline !== undefined) {
    fields.push(`business_tagline = $${paramCount++}`);
    values.push(data.businessTagline);
  }
  if (data.logoUrl !== undefined) {
    fields.push(`logo_url = $${paramCount++}`);
    values.push(data.logoUrl);
  }
  if (data.primaryColor !== undefined) {
    fields.push(`primary_color = $${paramCount++}`);
    values.push(data.primaryColor);
  }
  if (data.secondaryColor !== undefined) {
    fields.push(`secondary_color = $${paramCount++}`);
    values.push(data.secondaryColor);
  }
  if (data.accentColor !== undefined) {
    fields.push(`accent_color = $${paramCount++}`);
    values.push(data.accentColor);
  }

  // Contact
  if (data.supportEmail !== undefined) {
    fields.push(`support_email = $${paramCount++}`);
    values.push(data.supportEmail);
  }
  if (data.supportPhone !== undefined) {
    fields.push(`support_phone = $${paramCount++}`);
    values.push(data.supportPhone);
  }
  if (data.websiteUrl !== undefined) {
    fields.push(`website_url = $${paramCount++}`);
    values.push(data.websiteUrl);
  }

  // Address
  if (data.addressLine1 !== undefined) {
    fields.push(`address_line1 = $${paramCount++}`);
    values.push(data.addressLine1);
  }
  if (data.addressLine2 !== undefined) {
    fields.push(`address_line2 = $${paramCount++}`);
    values.push(data.addressLine2);
  }
  if (data.city !== undefined) {
    fields.push(`city = $${paramCount++}`);
    values.push(data.city);
  }
  if (data.state !== undefined) {
    fields.push(`state = $${paramCount++}`);
    values.push(data.state);
  }
  if (data.zipCode !== undefined) {
    fields.push(`zip_code = $${paramCount++}`);
    values.push(data.zipCode);
  }

  // Feature toggles
  if (data.enableBlockchain !== undefined) {
    fields.push(`enable_blockchain = $${paramCount++}`);
    values.push(data.enableBlockchain);
  }
  if (data.enableBlockchainPayments !== undefined) {
    fields.push(`enable_blockchain_payments = $${paramCount++}`);
    values.push(data.enableBlockchainPayments);
  }
  if (data.enableGoogleCalendar !== undefined) {
    fields.push(`enable_google_calendar = $${paramCount++}`);
    values.push(data.enableGoogleCalendar);
  }
  if (data.enableCertificates !== undefined) {
    fields.push(`enable_certificates = $${paramCount++}`);
    values.push(data.enableCertificates);
  }
  if (data.enableMultiPayment !== undefined) {
    fields.push(`enable_multi_payment = $${paramCount++}`);
    values.push(data.enableMultiPayment);
  }

  // Student Defaults
  if (data.defaultHoursRequired !== undefined) {
    fields.push(`default_hours_required = $${paramCount++}`);
    values.push(data.defaultHoursRequired);
  }
  if (data.standardLessonLengthMinutes !== undefined) {
    fields.push(`standard_lesson_length_minutes = $${paramCount++}`);
    values.push(data.standardLessonLengthMinutes);
  }
  if (data.defaultLessonCost !== undefined) {
    fields.push(`default_lesson_cost = $${paramCount++}`);
    values.push(data.defaultLessonCost);
  }
  if (data.maxLessonsPerStudentPerDay !== undefined) {
    fields.push(`max_lessons_per_student_per_day = $${paramCount++}`);
    values.push(data.maxLessonsPerStudentPerDay);
  }

  // Localization
  if (data.timezone !== undefined) {
    // Validated against Node's own ICU/IANA tzdata (the same source of
    // truth backend/src/utils/tenantTime.ts's date-fns-tz relies on) -
    // storage itself is untouched (Constraint A), this only rejects a
    // value date-fns-tz couldn't resolve at read time. null is only ever a
    // pre-explicit-choice state set at tenant creation, never a value a
    // client should be able to write back - reject it the same as any
    // other invalid zone rather than silently clearing the setting.
    if (!data.timezone || !Intl.supportedValuesOf('timeZone').includes(data.timezone)) {
      throw new AppError('Invalid timezone', 400);
    }
    fields.push(`timezone = $${paramCount++}`);
    values.push(data.timezone);
  }
  if (data.currencyCode !== undefined) {
    fields.push(`currency_code = $${paramCount++}`);
    values.push(data.currencyCode);
  }
  if (data.currencySymbol !== undefined) {
    fields.push(`currency_symbol = $${paramCount++}`);
    values.push(data.currencySymbol);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(tenantId);

  const result = await query(
    `UPDATE tenant_settings SET ${fields.join(', ')} WHERE tenant_id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Tenant settings not found', 404);
  }

  return keysToCamel(result.rows[0]) as TenantSettings;
};
