/**
 * Vehicle Controller
 * HTTP handlers for vehicle-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as vehicleService from '../services/vehicleService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/vehicles
 * @desc    Get all vehicles for current tenant
 * @access  Private
 */
export const getAllVehicles = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const vehicles = await vehicleService.getAllVehicles(tenantId);

  res.json({
    success: true,
    data: vehicles,
    count: vehicles.length,
  });
});

/**
 * @route   GET /api/v1/vehicles/available
 * @desc    Get available vehicles (active status only)
 * @access  Private
 */
export const getAvailableVehicles = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const vehicles = await vehicleService.getAvailableVehicles(tenantId);

  res.json({
    success: true,
    data: vehicles,
    count: vehicles.length,
  });
});

/**
 * @route   GET /api/v1/vehicles/:id
 * @desc    Get vehicle by ID
 * @access  Private
 */
export const getVehicle = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const vehicle = await vehicleService.getVehicleById(id, tenantId);

  if (!vehicle) {
    res.status(404).json({
      success: false,
      error: 'Vehicle not found',
    });
    return;
  }

  res.json({
    success: true,
    data: vehicle,
  });
});

/**
 * @route   POST /api/v1/vehicles
 * @desc    Create new vehicle
 * @access  Private
 */
export const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const vehicle = await vehicleService.createVehicle(tenantId, req.body);

  res.status(201).json({
    success: true,
    data: vehicle,
    message: 'Vehicle created successfully',
  });
});

/**
 * @route   PUT /api/v1/vehicles/:id
 * @desc    Update vehicle
 * @access  Private
 */
export const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const vehicle = await vehicleService.updateVehicle(id, tenantId, req.body);

  res.json({
    success: true,
    data: vehicle,
    message: 'Vehicle updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/vehicles/:id
 * @desc    Delete vehicle (soft delete)
 * @access  Private
 */
export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await vehicleService.deleteVehicle(id, tenantId);

  res.json({
    success: true,
    message: 'Vehicle deleted successfully',
  });
});
