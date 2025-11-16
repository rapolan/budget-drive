# Create Test Lesson - Session 13 Verification
Write-Host "Creating test lesson..." -ForegroundColor Green

# Calculate tomorrow's date
$tomorrow = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')

# Build request body
$body = @{
    studentId = '3c26295d-a6c2-4540-b412-8c81072d88fa'
    instructorId = '86d827a0-21b8-4654-9339-a5adab8908b0'
    vehicleId = '7a7a00e6-baf0-49e2-a56a-a29bb08fcd23'
    scheduledStart = "${tomorrow}T10:00:00"
    scheduledEnd = "${tomorrow}T11:00:00"
    lessonType = 'behind_wheel'
    cost = 50.00
    notes = 'Test lesson - Session 13 verification'
} | ConvertTo-Json

Write-Host "`nRequest Body:"
Write-Host $body

# Make API request
try {
    $response = Invoke-RestMethod `
        -Uri 'http://localhost:3000/api/v1/lessons' `
        -Method POST `
        -Headers @{
            'Content-Type' = 'application/json'
            'X-Tenant-ID' = '00000000-0000-0000-0000-000000000001'
        } `
        -Body $body

    Write-Host "`n✅ Lesson created successfully!" -ForegroundColor Green
    Write-Host "`nResponse:"
    $response | ConvertTo-Json -Depth 10

    if ($response.data.id) {
        Write-Host "`nLesson ID: $($response.data.id)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "`n❌ Error creating lesson:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}
