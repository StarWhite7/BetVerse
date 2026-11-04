param([string]$KeytoolPath)
$ErrorActionPreference = 'Stop'
if (-not $KeytoolPath) {
    $betaKeytoolCommand = Get-Command keytool -ErrorAction SilentlyContinue
    if ($betaKeytoolCommand) {
        $KeytoolPath = $betaKeytoolCommand.Source
    } else {
        # A running terminal may not yet have the PATH from a new Java installation.
        $betaJavaHomes = @(
            [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User'),
            [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
        ) | Where-Object { $_ }
        $betaKeytoolCandidates = @($betaJavaHomes | ForEach-Object { Join-Path $_ 'bin/keytool.exe' })
        $betaKeytoolCandidates += @(
            (Join-Path $env:LOCALAPPDATA 'Programs/Eclipse Adoptium/jdk-21*/bin/keytool.exe'),
            (Join-Path $env:ProgramFiles 'Eclipse Adoptium/jdk-21*/bin/keytool.exe')
        )
        $KeytoolPath = Get-Item -Path $betaKeytoolCandidates -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
}
if (-not $KeytoolPath) { throw 'Java/keytool introuvable. Installez le JDK 21 ou précisez -KeytoolPath.' }
$betaPrivateDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.private'
$betaKeyPath = Join-Path $betaPrivateDir 'betverse-beta.p12'
if (Test-Path -LiteralPath $betaKeyPath) {
    throw 'Une clé existe déjà. Conservez-la pour toutes les mises à jour ; ne la remplacez pas.'
}
$null = Get-Command $KeytoolPath -ErrorAction Stop
$betaPassword = Read-Host 'Mot de passe de la clé (16 caractères minimum, à conserver dans votre gestionnaire)' -AsSecureString
$betaConfirmation = Read-Host 'Confirmez le mot de passe' -AsSecureString
$betaCredential = [System.Net.NetworkCredential]::new('', $betaPassword)
$betaConfirmCredential = [System.Net.NetworkCredential]::new('', $betaConfirmation)
if ($betaCredential.Password.Length -lt 16 -or $betaCredential.Password -cne $betaConfirmCredential.Password) {
    throw 'Mot de passe trop court ou confirmation différente.'
}
$null = New-Item -ItemType Directory -Force -Path $betaPrivateDir
try {
    $env:BETVERSE_KEY_PASSWORD = $betaCredential.Password
    & $KeytoolPath -genkeypair -noprompt -storetype PKCS12 -keystore $betaKeyPath `
        -storepass:env BETVERSE_KEY_PASSWORD -keypass:env BETVERSE_KEY_PASSWORD `
        -alias betverse-beta -keyalg RSA -keysize 3072 -validity 10000 `
        -dname 'CN=BetVerse Private Beta, O=BetVerse, C=FR'
    if ($LASTEXITCODE -ne 0) { throw 'La génération de la clé a échoué.' }
} finally {
    Remove-Item Env:BETVERSE_KEY_PASSWORD -ErrorAction SilentlyContinue
    $betaCredential = $null
    $betaConfirmCredential = $null
    $betaPassword.Dispose()
    $betaConfirmation.Dispose()
}
Write-Host "Clé créée localement : $betaKeyPath"
Write-Host 'Sauvegardez ce fichier et son mot de passe hors du dépôt. Ne les envoyez pas dans le chat.'
