$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-Operation {
  param(
    [Parameter(Mandatory = $true)]
    $AsyncOperation,
    [Parameter(Mandatory = $true)]
    [Type]$ResultType
  )

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($AsyncOperation))
  $netTask.GetAwaiter().GetResult()
}

try {
  [Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType = WindowsRuntime] | Out-Null

  $locator = [Windows.Devices.Geolocation.Geolocator]::new()
  $locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High

  $status = $locator.LocationStatus
  if ($status -eq [Windows.Devices.Geolocation.PositionStatus]::NotAvailable) {
    Write-Output ('{"error":"unavailable","message":"Windows location service not available"}')
    exit 1
  }
  if ($status -eq [Windows.Devices.Geolocation.PositionStatus]::Disabled) {
    Write-Output ('{"error":"denied","message":"Windows location is disabled"}')
    exit 1
  }

  $position = Await-Operation -AsyncOperation ($locator.GetGeopositionAsync()) -ResultType ([Windows.Devices.Geolocation.Geoposition])
  $coord = $position.Coordinate

  if ($null -eq $coord) {
    Write-Output ('{"error":"unavailable","message":"No coordinate"}')
    exit 1
  }

  $point = $coord.Point.Position
  $payload = [ordered]@{
    lat = [double]$point.Latitude
    lon = [double]$point.Longitude
    accuracy = if ($null -ne $coord.Accuracy) { [double]$coord.Accuracy } else { $null }
    speed = if ($null -ne $coord.Speed -and -not [double]::IsNaN([double]$coord.Speed)) { [double]$coord.Speed } else { $null }
    heading = if ($null -ne $coord.Heading -and -not [double]::IsNaN([double]$coord.Heading)) { [double]$coord.Heading } else { $null }
  }

  $payload | ConvertTo-Json -Compress
  exit 0
}
catch {
  $msg = $_.Exception.Message -replace '"', "'"
  if ($msg -match 'access|denied|permission|disabled') {
    Write-Output ('{"error":"denied","message":"' + $msg + '"}')
    exit 1
  }
  Write-Output ('{"error":"unavailable","message":"' + $msg + '"}')
  exit 1
}
