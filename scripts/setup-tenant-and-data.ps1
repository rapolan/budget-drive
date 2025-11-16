# First create the tenant
$tenant = @{
    name = "Budget Driving School"
    slug = "budget-driving"
    email = "admin@budgetdriving.com"
    status = "active"
    planTier = "professional"
} | ConvertTo-Json

Write-Host "Creating tenant..."
$tenantResult = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/tenants" -Method POST -Body $tenant -ContentType "application/json"
Write-Host "Tenant created: $($tenantResult.data.id)"

# Now add test student
$student = @{
    fullName = "John Doe"
    email = "john.doe@example.com"
    phone = "555-0101"
    dateOfBirth = "2005-01-15"
    address = "123 Main St"
    emergencyContact = "Jane Doe - 555-0102"
    licenseType = "car"
    hoursRequired = 40
} | ConvertTo-Json

Write-Host "Creating student..."
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/students" -Method POST -Body $student -ContentType "application/json"

# Add test instructor
$instructor = @{
    fullName = "Sarah Smith"
    email = "sarah.smith@example.com"
    phone = "555-0201"
    employmentType = "w2_employee"
    hireDate = (Get-Date).ToString("yyyy-MM-dd")
    providesOwnVehicle = $false
} | ConvertTo-Json

Write-Host "Creating instructor..."
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/instructors" -Method POST -Body $instructor -ContentType "application/json"

# Add test vehicle
$vehicle = @{
    ownershipType = "school_owned"
    make = "Toyota"
    model = "Corolla"
    year = 2020
    licensePlate = "ABC-123"
    vin = "1HGCM82633A004352"
    registrationExpiration = "2025-12-31"
    insuranceExpiration = "2025-12-31"
    currentMileage = 50000
} | ConvertTo-Json

Write-Host "Creating vehicle..."
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/vehicles" -Method POST -Body $vehicle -ContentType "application/json"

Write-Host "`n✅ All test data added successfully!"
