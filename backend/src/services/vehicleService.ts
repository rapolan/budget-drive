/**
 * Vehicle Service
 * Business logic for vehicle management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Vehicle } from '../types';
import { AppError } from '../middleware/errorHandler';

export const getAllVehicles = async (tenantId: string): Promise<Vehicle[]> => {
  const result = await query(
    'SELECT * FROM vehicles WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows as Vehicle[];
};

export const getVehicleById = async (
  id: string,
  tenantId: string
): Promise<Vehicle | null> => {
  const result = await query(
    'SELECT * FROM vehicles WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows.length > 0 ? (result.rows[0] as Vehicle) : null;
};

export const getAvailableVehicles = async (
  tenantId: string
): Promise<Vehicle[]> => {
  const result = await query(
    `SELECT * FROM vehicles
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows as Vehicle[];
};

export const createVehicle = async (
  tenantId: string,
  data: any
): Promise<Vehicle> => {
  const result = await query(
    `INSERT INTO vehicles (
      tenant_id, ownership_type, make, model, year, license_plate, vin, color,
      registration_expiration, insurance_provider, insurance_policy_number,
      insurance_expiration, current_mileage, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
    RETURNING *`,
    [
      tenantId,
      data.ownershipType || 'school_owned',
      data.make,
      data.model,
      data.year,
      data.licensePlate,
      data.vin || null,
      data.color || null,
      data.registrationExpiration,
      data.insuranceProvider || null,
      data.insurancePolicyNumber || null,
      data.insuranceExpiration,
      data.currentMileage || 0,
    ]
  );
  return result.rows[0] as Vehicle;
};

export const updateVehicle = async (
  id: string,
  tenantId: string,
  data: Partial<Vehicle>
): Promise<Vehicle> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.make !== undefined) {
    fields.push(`make = $${paramCount++}`);
    values.push(data.make);
  }
  if (data.model !== undefined) {
    fields.push(`model = $${paramCount++}`);
    values.push(data.model);
  }
  if (data.year !== undefined) {
    fields.push(`year = $${paramCount++}`);
    values.push(data.year);
  }
  if (data.licensePlate !== undefined) {
    fields.push(`license_plate = $${paramCount++}`);
    values.push(data.licensePlate);
  }
  if (data.vin !== undefined) {
    fields.push(`vin = $${paramCount++}`);
    values.push(data.vin);
  }
  if (data.color !== undefined) {
    fields.push(`color = $${paramCount++}`);
    values.push(data.color);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    values.push(data.status);
  }
  if (data.currentMileage !== undefined) {
    fields.push(`current_mileage = $${paramCount++}`);
    values.push(data.currentMileage);
  }
  if (data.insuranceProvider !== undefined) {
    fields.push(`insurance_provider = $${paramCount++}`);
    values.push(data.insuranceProvider);
  }
  if (data.insurancePolicyNumber !== undefined) {
    fields.push(`insurance_policy_number = $${paramCount++}`);
    values.push(data.insurancePolicyNumber);
  }
  if (data.insuranceExpiration !== undefined) {
    fields.push(`insurance_expiration = $${paramCount++}`);
    values.push(data.insuranceExpiration);
  }
  if (data.registrationExpiration !== undefined) {
    fields.push(`registration_expiration = $${paramCount++}`);
    values.push(data.registrationExpiration);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE vehicles SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Vehicle not found', 404);
  }

  return result.rows[0] as Vehicle;
};

export const deleteVehicle = async (
  id: string,
  tenantId: string
): Promise<void> => {
  const result = await query(
    `UPDATE vehicles SET status = 'retired'
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Vehicle not found', 404);
  }
};
