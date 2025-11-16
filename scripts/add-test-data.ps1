# Add test student
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

Invoke-RestMethod -Uri "http://localhost:3000/api/v1/instructors" -Method POST -Body $instructor -ContentType "application/json"

# Add test vehicle
$vehicle = @{
    ownershipType = "school_owned"
    make = "Toyota"
    model = "Corolla"
    year = 2020
    licensePlate = "ABC-123"
    registrationExpiration = "2025-12-31"
    insuranceExpiration = "2025-12-31"
    currentMileage = 50000
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/v1/vehicles" -Method POST -Body $vehicle -ContentType "application/json"

Write-Host "Test data added successfully!"
