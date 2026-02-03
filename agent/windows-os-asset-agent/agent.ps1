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
  $logFile = Join-Path $logDir ("agent-{0}.log" -f $dateStamp)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  ("{0} [{1}] {2}" -f $timestamp, $Level, $Message) | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Get-EnvVar {
  param([string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name, 'Machine')
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'Process') }
  if (-not $value) { throw ("Variável de ambiente obrigatória ausente: {0}" -f $Name) }
  return $value
}

function Test-IsJwtKey {
  param([string]$Key)
  if ([string]::IsNullOrWhiteSpace($Key)) { return $false }
  if ($Key.StartsWith('eyJ')) { return $true } # JWT comum
  return ($Key -match '^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$')
}

function Get-JwtRole {
  param([string]$Token)
  if (-not (Test-IsJwtKey $Token)) { return $null }
  $parts = $Token.Split('.')
  if ($parts.Length -lt 2) { return $null }

  $payload = $parts[1].Replace('-', '+').Replace('_', '/')
  switch ($payload.Length % 4) {
    2 { $payload += '==' }
    3 { $payload += '=' }
  }

  try {
    $bytes = [Convert]::FromBase64String($payload)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes)
    $obj = $json | ConvertFrom-Json
    if ($obj.role) { return $obj.role }
    if ($obj.app_metadata -and $obj.app_metadata.role) { return $obj.app_metadata.role }
  } catch { }

  return $null
}

function New-SupabaseHeaders {
  param([Parameter(Mandatory = $true)][string]$ApiKey)

  $isJwt = Test-IsJwtKey $ApiKey

  $restHeaders = @{
    apikey = $ApiKey
    Prefer = 'return=representation'
  }

  $storageHeaders = @{
    apikey = $ApiKey
  }

  # Para chaves JWT legacy, Authorization: Bearer <jwt> é ok.
  # Para sb_secret_... / sb_publishable_... (não-JWT), NÃO pode mandar Authorization: Bearer ... :contentReference[oaicite:6]{index=6}
  if ($isJwt) {
    $restHeaders['Authorization'] = ("Bearer {0}" -f $ApiKey)
    $storageHeaders['Authorization'] = ("Bearer {0}" -f $ApiKey)
    return [pscustomobject]@{ Rest = $restHeaders; Storage = $storageHeaders; Mode = 'JWT' }
  }

  return [pscustomobject]@{ Rest = $restHeaders; Storage = $storageHeaders; Mode = 'SB_SECRET_OR_PUBLISHABLE' }
}

function Get-HttpErrorDetails {
  param([Parameter(Mandatory = $true)][System.Management.Automation.ErrorRecord]$ErrorRecord)

  $statusCode = $null
  $statusDescription = $null
  $body = $null

  try {
    $resp = $ErrorRecord.Exception.Response
    if ($resp -and ($resp -is [System.Net.HttpWebResponse])) {
      $statusCode = [int]$resp.StatusCode
      $statusDescription = $resp.StatusDescription

      try {
        $stream = $resp.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
          $reader.Close()
          $stream.Close()
        }
      } catch { }
    }
  } catch { }

  return [pscustomobject]@{
    StatusCode        = $statusCode
    StatusDescription = $statusDescription
    Body              = $body
  }
}

function Remove-Diacritics {
  param([string]$Value)
  if (-not $Value) { return '' }

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
  if ([string]::IsNullOrWhiteSpace($cleaned)) { return '_' }
  return $cleaned
}

function Get-FirstLetter {
  param([string]$Value)
  $normalized = Remove-Diacritics $Value
  $normalized = ($normalized -replace '\s+', ' ').Trim()
  if ([string]::IsNullOrWhiteSpace($normalized)) { return '_' }

  $first = $normalized.Substring(0, 1).ToUpperInvariant()
  if ($first -match '^[A-Z]$') { return $first }
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
    $candidate = Join-Path $Directory ("{0} ({1}){2}" -f $baseName, $counter, $extension)
    $counter++
  }
  return $candidate
}

function Get-ShortHash {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return '00000000' }

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash($bytes)
    return ([BitConverter]::ToString($hashBytes) -replace '-', '').Substring(0, 8).ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Get-AssetFileName {
  param([Parameter(Mandatory = $true)]$Asset)
  $originalName = $Asset.original_name
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($originalName)
  $extension = [System.IO.Path]::GetExtension($originalName)
  $safeBaseName = Sanitize-WindowsName $baseName
  if ([string]::IsNullOrWhiteSpace($safeBaseName)) { $safeBaseName = '_' }

  $hash = Get-ShortHash ("{0}|{1}|{2}" -f $Asset.id, $Asset.object_path, $originalName)
  return ("{0}--{1}{2}" -f $safeBaseName, $hash, $extension)
}

function Escape-StorageObjectPath {
  param([string]$ObjectPath)
  if ([string]::IsNullOrWhiteSpace($ObjectPath)) { return $ObjectPath }
  return (($ObjectPath -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
}

function Invoke-SupabaseRest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $false)]$Body,
    [Parameter(Mandatory = $true)][hashtable]$Headers
  )

  $params = @{
    Method      = $Method
    Uri         = $Url
    Headers     = $Headers
    ErrorAction = 'Stop'
  }

  if ($Body -ne $null) {
    $params['Body'] = ($Body | ConvertTo-Json -Depth 8)
    $params['ContentType'] = 'application/json'
  }

  return Invoke-RestMethod @params
}

function Update-JobStatusSafe {
  param(
    [Parameter(Mandatory = $true)][string]$SupabaseUrl,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [Parameter(Mandatory = $true)][string]$JobId,
    [Parameter(Mandatory = $true)][hashtable]$Payload
  )

  $jobUrl = ("{0}/rest/v1/os_order_asset_jobs?id=eq.{1}" -f $SupabaseUrl, $JobId)
  try {
    Invoke-SupabaseRest -Method 'PATCH' -Url $jobUrl -Body $Payload -Headers $Headers | Out-Null
    return $true
  } catch {
    $d = Get-HttpErrorDetails $_
    $payloadJson = '{}'
    try { $payloadJson = ($Payload | ConvertTo-Json -Depth 8) } catch { }
    Write-Log ("Falha ao atualizar job ({0}) via PATCH: {1} | HTTP {2} {3} | Body: {4} | Payload: {5} | Url: {6}" -f $JobId, $_.Exception.Message, $d.StatusCode, $d.StatusDescription, $d.Body, $payloadJson, $jobUrl) 'ERROR'
    return $false
  }
}

function Invoke-StorageCreateSignedUrl {
  param(
    [Parameter(Mandatory = $true)][string]$SupabaseUrl,
    [Parameter(Mandatory = $true)][string]$Bucket,
    [Parameter(Mandatory = $true)][string]$ObjectPath,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [int]$ExpiresInSeconds = 600
  )

  # Endpoint usado pelo SDK: POST /object/sign/{bucket}/{path} com expiresIn :contentReference[oaicite:7]{index=7}
  $escaped = Escape-StorageObjectPath $ObjectPath
  $signEndpoint = ("{0}/storage/v1/object/sign/{1}/{2}" -f $SupabaseUrl, $Bucket, $escaped)

  $body = @{ expiresIn = $ExpiresInSeconds }

  $resp = Invoke-RestMethod -Method 'POST' -Uri $signEndpoint -Headers $Headers -Body ($body | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop

  $signedPart = $null
  if ($resp.signedURL) { $signedPart = $resp.signedURL }
  elseif ($resp.signedUrl) { $signedPart = $resp.signedUrl }
  elseif ($resp.url) { $signedPart = $resp.url }

  if ([string]::IsNullOrWhiteSpace($signedPart)) {
    throw ("Resposta inesperada ao criar signed URL. Campos retornados: {0}" -f (($resp.PSObject.Properties | ForEach-Object { $_.Name }) -join ','))
  }

  # Pode vir como path relativo (/object/sign/...) ou URL completa.
  if ($signedPart -match '^https?://') { return $signedPart }

  if ($signedPart.StartsWith('/storage/v1/')) { return ("{0}{1}" -f $SupabaseUrl, $signedPart) }
  if ($signedPart.StartsWith('/')) { return ("{0}/storage/v1{1}" -f $SupabaseUrl, $signedPart) }

  return ("{0}/storage/v1/{1}" -f $SupabaseUrl, $signedPart)
}

function Invoke-StorageDownload {
  param(
    [Parameter(Mandatory = $true)][string]$SupabaseUrl,
    [Parameter(Mandatory = $true)][string]$Bucket,
    [Parameter(Mandatory = $true)][string]$ObjectPath,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [Parameter(Mandatory = $true)][string]$OutFile
  )

  $escaped = Escape-StorageObjectPath $ObjectPath

  # Estrutura /object/{bucket}/{path} e variantes (/public, /authenticated) :contentReference[oaicite:8]{index=8}
  $urlsToTry = @(
    ("{0}/storage/v1/object/{1}/{2}" -f $SupabaseUrl, $Bucket, $escaped),
    ("{0}/storage/v1/object/authenticated/{1}/{2}" -f $SupabaseUrl, $Bucket, $escaped),
    ("{0}/storage/v1/object/public/{1}/{2}" -f $SupabaseUrl, $Bucket, $escaped)
  )

  foreach ($u in $urlsToTry) {
    try {
      Invoke-WebRequest -Method 'GET' -Uri $u -Headers $Headers -OutFile $OutFile -UseBasicParsing -ErrorAction Stop | Out-Null
      return $u
    } catch {
      $d = Get-HttpErrorDetails $_
      Write-Log ("Falha no download direto ({0}): {1} | HTTP {2} {3} | Body: {4}" -f $u, $_.Exception.Message, $d.StatusCode, $d.StatusDescription, $d.Body) 'WARN'
      if (Test-Path $OutFile) { Remove-Item $OutFile -Force -ErrorAction SilentlyContinue }
    }
  }

  # Bucket privado: melhor prática é signed URL :contentReference[oaicite:9]{index=9}
  try {
    $signedUrl = Invoke-StorageCreateSignedUrl -SupabaseUrl $SupabaseUrl -Bucket $Bucket -ObjectPath $ObjectPath -Headers $Headers -ExpiresInSeconds 900
    Invoke-WebRequest -Method 'GET' -Uri $signedUrl -OutFile $OutFile -UseBasicParsing -ErrorAction Stop | Out-Null
    Write-Log ("Download via signed URL OK: {0}" -f $ObjectPath) 'INFO'
    return $signedUrl
  } catch {
    $d = Get-HttpErrorDetails $_
    Write-Log ("Falha ao baixar via signed URL ({0}): {1} | HTTP {2} {3} | Body: {4}" -f $ObjectPath, $_.Exception.Message, $d.StatusCode, $d.StatusDescription, $d.Body) 'ERROR'
  }

  throw ("Falha ao baixar objeto '{0}' do bucket '{1}'." -f $ObjectPath, $Bucket)
}

function Invoke-StorageDelete {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][hashtable]$Headers
  )

  Invoke-RestMethod -Method 'DELETE' -Uri $Url -Headers $Headers -ErrorAction Stop | Out-Null
}

try {
  $supabaseUrl   = (Get-EnvVar 'SUPABASE_URL').TrimEnd('/')
  $apiKey        = Get-EnvVar 'SUPABASE_SERVICE_ROLE_KEY'
  $bucket        = Get-EnvVar 'OS_ASSET_BUCKET'
  $smbBase       = Get-EnvVar 'SMB_BASE'
  $pollInterval  = [int](Get-EnvVar 'POLL_INTERVAL_SECONDS')

  $hdr = New-SupabaseHeaders -ApiKey $apiKey
  $restHeaders = $hdr.Rest
  $storageHeaders = $hdr.Storage

  Write-Log ("OS Asset Agent iniciado. Poll a cada {0}s. Modo de chave: {1}" -f $pollInterval, $hdr.Mode) 'INFO'
  Write-Log 'Use um usuario de servico dedicado e proteja a SUPABASE_SERVICE_ROLE_KEY.' 'WARN'
  if ($hdr.Mode -eq 'JWT') {
    $jwtRole = Get-JwtRole $apiKey
    $roleLabel = $jwtRole
    if ([string]::IsNullOrWhiteSpace($roleLabel)) { $roleLabel = 'desconhecida' }
    Write-Log ("JWT role detectada: {0}" -f $roleLabel) 'INFO'
    if ($jwtRole -and $jwtRole -ne 'service_role') {
      throw ("JWT sem role service_role detectado ({0}). Use a SUPABASE_SERVICE_ROLE_KEY." -f $jwtRole)
    }
  }

  while ($true) {
    $job = $null

    try {
      $jobUrl = ("{0}/rest/v1/os_order_asset_jobs?status=in.(PENDING,DONE_CLEANUP_FAILED)&order=created_at.asc&limit=1" -f $supabaseUrl)
      $jobs = Invoke-SupabaseRest -Method 'GET' -Url $jobUrl -Headers $restHeaders

      if (-not $jobs -or $jobs.Count -eq 0) {
        Start-Sleep -Seconds $pollInterval
        continue
      }

      $job = $jobs[0]
      Write-Log ("Job encontrado: {0}" -f $job.id) 'INFO'

      # lock atômico
      $lockPayload = @{
        status                = 'PROCESSING'
        processing_started_at = (Get-Date).ToString('o')
        attempt_count         = ([int]$job.attempt_count) + 1
        updated_at            = (Get-Date).ToString('o')
      }

      $lockUrl = ("{0}/rest/v1/os_order_asset_jobs?id=eq.{1}&status=in.(PENDING,DONE_CLEANUP_FAILED)" -f $supabaseUrl, $job.id)
      $locked = Invoke-SupabaseRest -Method 'PATCH' -Url $lockUrl -Body $lockPayload -Headers $restHeaders
      if (-not $locked -or $locked.Count -eq 0) {
        Start-Sleep -Seconds $pollInterval
        continue
      }

      # OS
      $orderUrl = ("{0}/rest/v1/os_orders?id=eq.{1}&select=id,client_name,sale_number" -f $supabaseUrl, $job.os_id)
      $orders = Invoke-SupabaseRest -Method 'GET' -Url $orderUrl -Headers $restHeaders
      if (-not $orders -or $orders.Count -eq 0) {
        throw ("OS não encontrada para job {0}." -f $job.id)
      }

      $order = $orders[0]
      $clientName = $order.client_name
      $saleNumber = $order.sale_number

      $clientFolder = Sanitize-WindowsName $clientName
      $saleFolderSource = $saleNumber
      if ([string]::IsNullOrWhiteSpace($saleFolderSource)) { $saleFolderSource = $order.id }
      $saleFolder = Sanitize-WindowsName $saleFolderSource

      $letter = Get-FirstLetter $clientName
      $targetDir = Join-Path $smbBase (Join-Path $letter (Join-Path $clientFolder $saleFolder))
      New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
      Write-Log ("Destino SMB: {0}" -f $targetDir) 'INFO'

      # assets
      $assetsUrl = ("{0}/rest/v1/os_order_assets?job_id=eq.{1}&order=uploaded_at.asc" -f $supabaseUrl, $job.id)
      $assets = Invoke-SupabaseRest -Method 'GET' -Url $assetsUrl -Headers $restHeaders

      if (-not $assets -or $assets.Count -eq 0) {
        $ok = Update-JobStatusSafe -SupabaseUrl $supabaseUrl -Headers $restHeaders -JobId $job.id -Payload @{
          status     = 'DONE_CLEANUP_FAILED'
          last_error = 'Job sem assets.'
          updated_at = (Get-Date).ToString('o')
        }
        Start-Sleep -Seconds $pollInterval
        continue
      }

      $tempRoot = Join-Path $env:TEMP (Join-Path 'os-asset-agent' $job.id)
      New-Item -Path $tempRoot -ItemType Directory -Force | Out-Null

      foreach ($asset in $assets) {
        $assetFileName = Get-AssetFileName $asset
        $tempFile = Join-Path $tempRoot $assetFileName
        $objectPath = ($asset.object_path).Trim()
        $destinationPath = Join-Path $targetDir $assetFileName

        if (Test-Path -Path $destinationPath) {
          Write-Log ("Arquivo já existe para {0} (destino: {1}). Pulando cópia." -f $objectPath, $destinationPath) 'INFO'
          continue
        }

        Write-Log ("Baixando {0} para {1}" -f $objectPath, $tempFile) 'INFO'
        Invoke-StorageDownload -SupabaseUrl $supabaseUrl -Bucket $bucket -ObjectPath $objectPath -Headers $storageHeaders -OutFile $tempFile | Out-Null

        Copy-Item -Path $tempFile -Destination $destinationPath -Force
      }

      # Job DONE
      $okDone = Update-JobStatusSafe -SupabaseUrl $supabaseUrl -Headers $restHeaders -JobId $job.id -Payload @{
        status           = 'DONE'
        destination_path = $targetDir
        completed_at     = (Get-Date).ToString('o')
        updated_at       = (Get-Date).ToString('o')
      }

      # Cleanup storage
      $cleanupFailed = $false
      foreach ($asset in $assets) {
        $objectPath = ($asset.object_path).Trim()
        $deleteUrl = ("{0}/storage/v1/object/{1}/{2}" -f $supabaseUrl, $bucket, (Escape-StorageObjectPath $objectPath))

        try {
          Invoke-StorageDelete -Url $deleteUrl -Headers $storageHeaders

          $assetUpdateUrl = ("{0}/rest/v1/os_order_assets?id=eq.{1}" -f $supabaseUrl, $asset.id)
          Invoke-SupabaseRest -Method 'PATCH' -Url $assetUpdateUrl -Body @{
            deleted_from_storage_at = (Get-Date).ToString('o')
            synced_at               = (Get-Date).ToString('o')
            error                   = $null
          } -Headers $restHeaders | Out-Null
        } catch {
          $cleanupFailed = $true

          $assetUpdateUrl = ("{0}/rest/v1/os_order_assets?id=eq.{1}" -f $supabaseUrl, $asset.id)
          Invoke-SupabaseRest -Method 'PATCH' -Url $assetUpdateUrl -Body @{
            error = $_.Exception.Message
          } -Headers $restHeaders | Out-Null

          # FIX parser ($var:)
          Write-Log ("Falha ao apagar {0}: {1}" -f $objectPath, $_.Exception.Message) 'WARN'
        }
      }

      if ($cleanupFailed) {
        Update-JobStatusSafe -SupabaseUrl $supabaseUrl -Headers $restHeaders -JobId $job.id -Payload @{
          status     = 'DONE_CLEANUP_FAILED'
          last_error = 'Falha ao apagar um ou mais objetos.'
          updated_at = (Get-Date).ToString('o')
        } | Out-Null
      } else {
        Update-JobStatusSafe -SupabaseUrl $supabaseUrl -Headers $restHeaders -JobId $job.id -Payload @{
          status     = 'CLEANED'
          cleaned_at = (Get-Date).ToString('o')
          last_error = $null
          updated_at = (Get-Date).ToString('o')
        } | Out-Null
      }

      try { Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue } catch { }

    } catch {
      $message = $_.Exception.Message
      Write-Log ("Erro inesperado: {0}" -f $message) 'ERROR'

      if ($job -and $job.id) {
        # NÃO usar status=ERROR (pode nem existir no enum/tabela e causar 400).
        # Usa DONE_CLEANUP_FAILED que o próprio agente já trata como retry.
        $ok = Update-JobStatusSafe -SupabaseUrl $supabaseUrl -Headers $restHeaders -JobId $job.id -Payload @{
          status     = 'DONE_CLEANUP_FAILED'
          last_error = $message
          updated_at = (Get-Date).ToString('o')
        }

        if (-not $ok) {
          # fallback pra não deixar preso
          Update-JobStatusSafe -SupabaseUrl $supabaseUrl -Headers $restHeaders -JobId $job.id -Payload @{
            status     = 'PENDING'
            updated_at = (Get-Date).ToString('o')
          } | Out-Null
        }
      }
    }

    Start-Sleep -Seconds $pollInterval
  }

} catch {
  Write-Log ("Falha fatal ao iniciar o agente: {0}" -f $_.Exception.Message) 'ERROR'
  throw
}
