$ErrorActionPreference = 'Stop'

function Write-Log {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
  )

  $logDir = 'C:\ProgramData\OSAssetAgent\logs'
  if (-not (Test-Path -Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
  }
  $dateStamp = Get-Date -Format 'yyyy-MM-dd'
  $logFile = Join-Path $logDir "agent-$dateStamp.log"
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "$timestamp [$Level] $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Get-EnvVar {
  param([string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name, 'Machine')
  if (-not $value) {
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  }
  if (-not $value) {
    throw "Variável de ambiente obrigatória ausente: $Name"
  }
  return $value
}

function Remove-Diacritics {
  param([string]$Value)
  if (-not $Value) {
    return ''
  }
  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
    if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }
  return $builder.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Sanitize-WindowsName {
  param([string]$Value)
  $cleaned = Remove-Diacritics $Value
  $cleaned = $cleaned -replace '[\\/:*?"<>|]', ''
  $cleaned = ($cleaned -replace '\s+', ' ').Trim()
  $cleaned = $cleaned.TrimEnd('.')
  if ([string]::IsNullOrWhiteSpace($cleaned)) {
    return '_'
  }
  return $cleaned
}

function Get-FirstLetter {
  param([string]$Value)
  $normalized = Remove-Diacritics $Value
  $normalized = ($normalized -replace '\s+', ' ').Trim()
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return '_'
  }
  $first = $normalized.Substring(0, 1).ToUpperInvariant()
  if ($first -match '^[A-Z]$') {
    return $first
  }
  return '_'
}

function Get-UniqueFilePath {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$FileName
  )
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $extension = [System.IO.Path]::GetExtension($FileName)
  $candidate = Join-Path $Directory $FileName
  $counter = 1
  while (Test-Path -Path $candidate) {
    $candidate = Join-Path $Directory ("$baseName ($counter)$extension")
    $counter++
  }
  return $candidate
}

function Invoke-SupabaseRest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $false)]$Body,
    [Parameter(Mandatory = $true)][hashtable]$Headers
  )

  $params = @{
    Method  = $Method
    Uri     = $Url
    Headers = $Headers
  }

  if ($Body -ne $null) {
    $params['Body'] = ($Body | ConvertTo-Json -Depth 6)
    $params['ContentType'] = 'application/json'
  }

  return Invoke-RestMethod @params
}

function Update-JobStatus {
  param(
    [string]$SupabaseUrl,
    [hashtable]$Headers,
    [string]$JobId,
    [hashtable]$Payload
  )
  $jobUrl = "$SupabaseUrl/rest/v1/os_order_asset_jobs?id=eq.$JobId"
  Invoke-SupabaseRest -Method 'PATCH' -Url $jobUrl -Body $Payload -Headers $Headers | Out-Null
}

try {
  $supabaseUrl = (Get-EnvVar 'SUPABASE_URL').TrimEnd('/')
  $serviceRoleKey = Get-EnvVar 'SUPABASE_SERVICE_ROLE_KEY'
  $bucket = Get-EnvVar 'OS_ASSET_BUCKET'
  $smbBase = Get-EnvVar 'SMB_BASE'
  $pollInterval = [int](Get-EnvVar 'POLL_INTERVAL_SECONDS')

  $headers = @{
    apikey       = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    Prefer       = 'return=representation'
  }

  Write-Log "OS Asset Agent iniciado. Poll a cada $pollInterval segundos." 'INFO'

  while ($true) {
    try {
      $job = $null
      $jobUrl = "$supabaseUrl/rest/v1/os_order_asset_jobs?status=in.(PENDING,DONE_CLEANUP_FAILED)&order=created_at.asc&limit=1"
      $jobs = Invoke-SupabaseRest -Method 'GET' -Url $jobUrl -Headers $headers

      if (-not $jobs -or $jobs.Count -eq 0) {
        Start-Sleep -Seconds $pollInterval
        continue
      }

      $job = $jobs[0]
      $lockPayload = @{
        status = 'PROCESSING'
        processing_started_at = (Get-Date).ToString('o')
        attempt_count = ([int]$job.attempt_count) + 1
        updated_at = (Get-Date).ToString('o')
      }

      $lockUrl = "$supabaseUrl/rest/v1/os_order_asset_jobs?id=eq.$($job.id)&status=in.(PENDING,DONE_CLEANUP_FAILED)"
      $locked = Invoke-SupabaseRest -Method 'PATCH' -Url $lockUrl -Body $lockPayload -Headers $headers
      if (-not $locked -or $locked.Count -eq 0) {
        Start-Sleep -Seconds $pollInterval
        continue
      }

      $orderUrl = "$supabaseUrl/rest/v1/os_orders?id=eq.$($job.os_id)&select=id,client_name,sale_number"
      $orders = Invoke-SupabaseRest -Method 'GET' -Url $orderUrl -Headers $headers
      if (-not $orders -or $orders.Count -eq 0) {
        throw "OS não encontrada para job $($job.id)."
      }

      $order = $orders[0]
      $clientName = $order.client_name
      $saleNumber = $order.sale_number

      $clientFolder = Sanitize-WindowsName $clientName
      $saleFolderSource = $saleNumber
      if ([string]::IsNullOrWhiteSpace($saleFolderSource)) {
        $saleFolderSource = $order.id
      }
      $saleFolder = Sanitize-WindowsName $saleFolderSource
      $letter = Get-FirstLetter $clientName
      $targetDir = Join-Path $smbBase (Join-Path $letter (Join-Path $clientFolder $saleFolder))
      New-Item -Path $targetDir -ItemType Directory -Force | Out-Null

      $assetsUrl = "$supabaseUrl/rest/v1/os_order_assets?job_id=eq.$($job.id)&order=uploaded_at.asc"
      $assets = Invoke-SupabaseRest -Method 'GET' -Url $assetsUrl -Headers $headers

      if (-not $assets -or $assets.Count -eq 0) {
        Update-JobStatus -SupabaseUrl $supabaseUrl -Headers $headers -JobId $job.id -Payload @{
          status = 'ERROR'
          last_error = 'Job sem assets.'
          updated_at = (Get-Date).ToString('o')
        }
        Start-Sleep -Seconds $pollInterval
        continue
      }

      $tempRoot = Join-Path $env:TEMP (Join-Path 'os-asset-agent' $job.id)
      New-Item -Path $tempRoot -ItemType Directory -Force | Out-Null

      foreach ($asset in $assets) {
        $originalName = Sanitize-WindowsName $asset.original_name
        $tempFile = Join-Path $tempRoot $originalName
        $objectPath = $asset.object_path
        $downloadUrl = "$supabaseUrl/storage/v1/object/$bucket/$objectPath"

        Write-Log "Baixando $objectPath para $tempFile" 'INFO'
        Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $tempFile -UseBasicParsing

        $destinationPath = Get-UniqueFilePath -Directory $targetDir -FileName $originalName
        Copy-Item -Path $tempFile -Destination $destinationPath -Force
      }

      Update-JobStatus -SupabaseUrl $supabaseUrl -Headers $headers -JobId $job.id -Payload @{
        status = 'DONE'
        destination_path = $targetDir
        completed_at = (Get-Date).ToString('o')
        updated_at = (Get-Date).ToString('o')
      }

      $cleanupFailed = $false
      foreach ($asset in $assets) {
        $objectPath = $asset.object_path
        $deleteUrl = "$supabaseUrl/storage/v1/object/$bucket/$objectPath"
        try {
          Invoke-RestMethod -Method 'DELETE' -Uri $deleteUrl -Headers $headers | Out-Null
          $assetUpdateUrl = "$supabaseUrl/rest/v1/os_order_assets?id=eq.$($asset.id)"
          Invoke-SupabaseRest -Method 'PATCH' -Url $assetUpdateUrl -Body @{
            deleted_from_storage_at = (Get-Date).ToString('o')
            synced_at = (Get-Date).ToString('o')
            error = $null
          } -Headers $headers | Out-Null
        } catch {
          $cleanupFailed = $true
          $assetUpdateUrl = "$supabaseUrl/rest/v1/os_order_assets?id=eq.$($asset.id)"
          Invoke-SupabaseRest -Method 'PATCH' -Url $assetUpdateUrl -Body @{
            error = $_.Exception.Message
          } -Headers $headers | Out-Null
          Write-Log "Falha ao apagar $objectPath: $($_.Exception.Message)" 'WARN'
        }
      }

      if ($cleanupFailed) {
        Update-JobStatus -SupabaseUrl $supabaseUrl -Headers $headers -JobId $job.id -Payload @{
          status = 'DONE_CLEANUP_FAILED'
          last_error = 'Falha ao apagar um ou mais objetos.'
          updated_at = (Get-Date).ToString('o')
        }
      } else {
        Update-JobStatus -SupabaseUrl $supabaseUrl -Headers $headers -JobId $job.id -Payload @{
          status = 'CLEANED'
          cleaned_at = (Get-Date).ToString('o')
          last_error = $null
          updated_at = (Get-Date).ToString('o')
        }
      }
    } catch {
      $message = $_.Exception.Message
      Write-Log "Erro inesperado: $message" 'ERROR'
      if ($job -and $job.id) {
        try {
          Update-JobStatus -SupabaseUrl $supabaseUrl -Headers $headers -JobId $job.id -Payload @{
            status = 'ERROR'
            last_error = $message
            updated_at = (Get-Date).ToString('o')
          }
        } catch {
          Write-Log "Falha ao atualizar job com erro: $($_.Exception.Message)" 'ERROR'
        }
      }
    }

    Start-Sleep -Seconds $pollInterval
  }
} catch {
  Write-Log "Falha fatal ao iniciar o agente: $($_.Exception.Message)" 'ERROR'
  throw
}
