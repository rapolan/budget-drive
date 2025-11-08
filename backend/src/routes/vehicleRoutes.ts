/**
 * Vehicle Routes
 * API routes for vehicle management
 */

import { Router } from 'express';
import * as vehicleController from '../controllers/vehicleController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

// All vehicle routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Get available vehicles (must be before /:id to avoid route conflict)
router.get(
  '/vehicles/available',
  vehicleController.getAvailableVehicles
);

// Get all vehicles
router.get(
  '/vehicles',
  vehicleController.getAllVehicles
);

// Create new vehicle
router.post(
  '/vehicles',
  validateRequired(['make', 'model', 'year', 'licensePlate', 'vin']),
  vehicleController.createVehicle
);

// Get vehicle by ID
router.get(
  '/vehicles/:id',
  validateUUID('id'),
  vehicleController.getVehicle
);

// Update vehicle
router.put(
  '/vehicles/:id',
  validateUUID('id'),
  vehicleController.updateVehicle
);

// Delete vehicle (soft delete)
router.delete(
  '/vehicles/:id',
  validateUUID('id'),
  vehicleController.deleteVehicle
);

export default router;
