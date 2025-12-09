/**
 * Vehicle Service
 * Business logic for vehicle management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Vehicle } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('VehicleService');

export const getAllVehicles = async (tenantId: string): Promise<Vehicle[]> => {
  logger.debug('Fetching all vehicles', { tenantId });

  const result = await query(
    'SELECT * FROM vehicles WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );

  logger.debug('Successfully fetched vehicles', {
    tenantId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Vehicle[];
};

export const getVehicleById = async (
  id: string,
  tenantId: string
): Promise<Vehicle | null> => {
  logger.debug('Fetching vehicle by ID', { tenantId, vehicleId: id });

  const result = await query(
    'SELECT * FROM vehicles WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Vehicle not found', { tenantId, vehicleId: id });
    return null;
  }

  return keysToCamel(result.rows[0]) as Vehicle;
};

export const getAvailableVehicles = async (
  tenantId: string
): Promise<Vehicle[]> => {
  logger.debug('Fetching available vehicles', { tenantId });

  const result = await query(
    `SELECT * FROM vehicles
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY created_at DESC`,
    [tenantId]
  );

  logger.debug('Successfully fetched available vehicles', {
    tenantId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Vehicle[];
};

export const createVehicle = async (
  tenantId: string,
  data: any
): Promise<Vehicle> => {
  logger.info('Creating new vehicle', {
    tenantId,
    make: data.make,
    model: data.model,
    year: data.year,
    licensePlate: data.licensePlate,
  });

  try {
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

    const vehicle = keysToCamel(result.rows[0]) as Vehicle;
    logger.info('Successfully created vehicle', {
      tenantId,
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
    });

    return vehicle;
  } catch (error) {
    logger.error('Failed to create vehicle', error as Error, {
      tenantId,
      licensePlate: data.licensePlate,
    });
    throw error;
  }
};

export const updateVehicle = async (
  id: string,
  tenantId: string,
  data: Partial<Vehicle>
): Promise<Vehicle> => {
  logger.info('Updating vehicle', {
    tenantId,
    vehicleId: id,
    updateFields: Object.keys(data),
  });

  try {
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
      logger.warn('No fields to update in vehicle', { tenantId, vehicleId: id });
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
      logger.warn('Vehicle not found for update', { tenantId, vehicleId: id });
      throw new AppError('Vehicle not found', 404);
    }

    logger.info('Vehicle updated successfully', {
      tenantId,
      vehicleId: id,
      updatedFields: Object.keys(data),
    });

    return keysToCamel(result.rows[0]) as Vehicle;
  } catch (error) {
    logger.error('Failed to update vehicle', error as Error, {
      tenantId,
      vehicleId: id,
    });
    throw error;
  }
};

export const deleteVehicle = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Retiring vehicle', { tenantId, vehicleId: id });

  try {
    const result = await query(
      `UPDATE vehicles SET status = 'retired'
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Vehicle not found for retirement', { tenantId, vehicleId: id });
      throw new AppError('Vehicle not found', 404);
    }

    logger.info('Vehicle retired successfully', { tenantId, vehicleId: id });
  } catch (error) {
    logger.error('Failed to retire vehicle', error as Error, {
      tenantId,
      vehicleId: id,
    });
    throw error;
  }
};
