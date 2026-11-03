<#
.SYNOPSIS
    Run a user-mode PostgreSQL server for local development on Windows.

.DESCRIPTION
    The project expects PostgreSQL at the URL in `.env`
    (by default `postgresql://darbar:darbar@127.0.0.1:5433/darbar`; `npm run
    db:start` passes `-Port 5433` because a system PostgreSQL service commonly
    owns 5432). On a machine without Docker this script creates and controls a
    private cluster under `%LOCALAPPDATA%\DarbarTech\postgres`, so no
    administrator rights and no system-wide install are required.

    `init` downloads the official EnterpriseDB binaries (one time, ~320 MB),
    extracts them and runs `initdb` with the `darbar` superuser and `trust`
    authentication on loopback only. After that, `start`, `stop` and `status`
    are all that is needed.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 init
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 start

.NOTES
    Set `DARBAR_PG_HOME` to keep the binaries/data somewhere else. Use Docker
    (`docker compose up -d`) instead when it is available.
#>
[CmdletBinding()]
param(
    [ValidateSet("init", "start", "stop", "status")]
    [string]$Action = "start",

    [int]$Port = 5432
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = if ($env:DARBAR_PG_HOME) { $env:DARBAR_PG_HOME } else { Join-Path $env:LOCALAPPDATA "DarbarTech\postgres" }
$bin = Join-Path $root "pgsql\bin"
$data = Join-Path $root "data"
$log = Join-Path $root "postgres.log"
$pgCtl = Join-Path $bin "pg_ctl.exe"
$dbName = "darbar"
$dbUser = "darbar"

$pgVersion = "16.4"
$downloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-$pgVersion-1-windows-x64-binaries.zip"
$zipPath = Join-Path $root "pg-$pgVersion.zip"

function Write-Step([string]$message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Assert-Binaries {
    if (-not (Test-Path $pgCtl)) {
        throw "PostgreSQL binaries not found at $bin. Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 init"
    }
}

function Test-Cluster {
    return Test-Path (Join-Path $data "PG_VERSION")
}

function Test-Server {
    if (-not (Test-Cluster)) { return $false }
    & $pgCtl -D $data status *> $null
    return ($LASTEXITCODE -eq 0)
}

function Invoke-Init {
    if ((Test-Cluster) -and (Test-Path $pgCtl)) {
        Write-Step "Cluster already initialised at $data"
        return
    }

    New-Item -ItemType Directory -Force -Path $root | Out-Null

    if (-not (Test-Path $pgCtl)) {
        if (-not (Test-Path $zipPath)) {
            Write-Step "Downloading PostgreSQL $pgVersion binaries (one time)"
            if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
                & curl.exe -L --fail --retry 3 -o $zipPath $downloadUrl
                if ($LASTEXITCODE -ne 0) { throw "Download failed (curl exit $LASTEXITCODE)." }
            } else {
                Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
            }
        }

        Write-Step "Extracting binaries to $root"
        if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
            & tar.exe -xf $zipPath -C $root
            if ($LASTEXITCODE -ne 0) { throw "Extraction failed (tar exit $LASTEXITCODE)." }
        } else {
            Expand-Archive -Path $zipPath -DestinationPath $root -Force
        }
    }

    Assert-Binaries

    if (-not (Test-Cluster)) {
        Write-Step "Initialising cluster at $data"
        & (Join-Path $bin "initdb.exe") -D $data -U $dbUser -A trust -E UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw "initdb failed (exit $LASTEXITCODE)." }
    }
}

function Invoke-Start {
    Invoke-Init

    if (Test-Server) {
        Write-Step "PostgreSQL is already running on port $Port"
    } else {
        Write-Step "Starting PostgreSQL on 127.0.0.1:$Port"
        # Loopback only: a dev database has no business being reachable from the network.
        & $pgCtl -D $data -l $log -o "-p $Port -c listen_addresses=127.0.0.1" -w start
        if ($LASTEXITCODE -ne 0) {
            throw "pg_ctl failed to start the server. See $log"
        }
    }

    $env:PGPASSWORD = $dbUser
    $exists = & (Join-Path $bin "psql.exe") -h 127.0.0.1 -p $Port -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
    if ($LASTEXITCODE -ne 0) { throw "Could not query PostgreSQL. See $log" }

    if ("$exists".Trim() -ne "1") {
        Write-Step "Creating database '$dbName'"
        & (Join-Path $bin "createdb.exe") -h 127.0.0.1 -p $Port -U $dbUser $dbName
        if ($LASTEXITCODE -ne 0) { throw "createdb failed (exit $LASTEXITCODE)." }
    }

    Write-Step "Ready: postgresql://${dbUser}:${dbUser}@localhost:$Port/$dbName"
}

function Invoke-Stop {
    if (-not (Test-Server)) {
        Write-Step "PostgreSQL is not running"
        return
    }
    Write-Step "Stopping PostgreSQL"
    & $pgCtl -D $data -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl failed to stop the server." }
}

function Invoke-Status {
    if (-not (Test-Cluster)) {
        Write-Step "No cluster at $data (run: init)"
        return
    }
    if (Test-Server) {
        Write-Step "PostgreSQL is running (data: $data, port: $Port)"
    } else {
        Write-Step "PostgreSQL is stopped (data: $data)"
    }
}

switch ($Action) {
    "init"   { Invoke-Init }
    "start"  { Invoke-Start }
    "stop"   { Invoke-Stop }
    "status" { Invoke-Status }
}
