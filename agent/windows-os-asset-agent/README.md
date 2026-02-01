# OS Asset Agent (Windows)

Agente Windows para buscar jobs pendentes de arquivos de arte/referência, baixar do Supabase Storage e copiar para o compartilhamento SMB. Após copiar, tenta apagar os objetos do Storage usando a `SUPABASE_SERVICE_ROLE_KEY`.

## Requisitos

- Windows com acesso ao SMB.
- PowerShell 5.1+.
- Conta de serviço com permissão no compartilhamento SMB.

## Variáveis de ambiente (obrigatórias)

Configure como variáveis de máquina:

- `SUPABASE_URL` = `https://xxxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_...`
- `OS_ASSET_BUCKET` = `os-artes`
- `SMB_BASE` = `\\servidor-pc\Geral\Artes\Vigente\Aprovação\Rodar\A_Z`
- `POLL_INTERVAL_SECONDS` = `10`

Exemplo (PowerShell, **como Administrador**):

```powershell
[Environment]::SetEnvironmentVariable('SUPABASE_URL', 'https://xxxx.supabase.co', 'Machine')
[Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_...', 'Machine')
[Environment]::SetEnvironmentVariable('OS_ASSET_BUCKET', 'os-artes', 'Machine')
[Environment]::SetEnvironmentVariable('SMB_BASE', '\\servidor-pc\Geral\Artes\Vigente\Aprovação\Rodar\A_Z', 'Machine')
[Environment]::SetEnvironmentVariable('POLL_INTERVAL_SECONDS', '10', 'Machine')
```

## Instalação como Windows Service

1) Copie esta pasta para um local fixo, por exemplo `C:\OSAssetAgent`.
2) Abra o PowerShell **como Administrador** e crie o serviço apontando para o script.

```powershell
New-Service -Name 'OSAssetAgent' `
  -DisplayName 'OS Asset Agent' `
  -BinaryPathName 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\OSAssetAgent\agent.ps1' `
  -Description 'Agente de sincronização de artes da OS para SMB.'
```

3) Configure o serviço para rodar com um usuário que tenha acesso ao SMB:

```powershell
$service = Get-WmiObject -Class Win32_Service -Filter "Name='OSAssetAgent'"
$service.Change($null,$null,$null,$null,$null,$null,'DOMINIO\\usuario','SenhaSegura123')
```

4) Inicie o serviço:

```powershell
Start-Service -Name 'OSAssetAgent'
```

## Logs

Os logs são gravados em:

```
C:\ProgramData\OSAssetAgent\logs\agent-YYYY-MM-DD.log
```

## Observações

- O agente não expõe a `SUPABASE_SERVICE_ROLE_KEY` para o front-end.
- Jobs com falha no cleanup são marcados como `DONE_CLEANUP_FAILED` e reprocessados nos loops seguintes.
