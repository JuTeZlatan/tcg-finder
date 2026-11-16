# Compile l'APK Android depuis la copie C:\tcgb (le chemin « Desktop\App TCG » est trop long pour le code natif).
# Usage : powershell -File scripts\build-apk.ps1 [-Full]
#   -Full : régénère le projet Android (à faire après l'ajout d'un module natif) ; sinon compilation rapide (~1-2 min).
#   -Icons : refait les planches d'icônes intégrées (sinon, refaites seulement si elles ont plus de 7 jours).
param([switch]$Full, [switch]$Icons)
$ErrorActionPreference = 'Stop'
$src = Split-Path $PSScriptRoot -Parent
$dst = 'C:\tcgb'
$env:ANDROID_HOME = 'C:\Android\Sdk'

# Icônes des personnages et logos des extensions intégrés à l'appli (affichage instantané) : scripts/make-icons.mjs.
$index = "$src\src\generated\icons.js"
if ($Icons -or -not (Test-Path $index) -or ((Get-Date) - (Get-Item $index).LastWriteTime).TotalDays -gt 7) {
  Push-Location $src
  node --import ./scripts/node-app/register.mjs scripts/make-icons.mjs
  $iconsCode = $LASTEXITCODE
  Pop-Location
  if ($iconsCode -ne 0) { exit $iconsCode }
}

if ($Full -or -not (Test-Path "$dst\android")) {
  robocopy $src $dst /MIR /XD "$src\android" "$src\.expo" "$src\pipeline\out" "$dst\android" /XF *.apk *.log /NFL /NDL /NJH /NJS /NP | Out-Null
  Push-Location $dst
  npx expo prebuild --platform android --clean
  Pop-Location
} else {
  # Rapide : seulement le code et les données, en gardant les caches de compilation.
  foreach ($d in 'src', 'assets', 'modules') { robocopy "$src\$d" "$dst\$d" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null }
  Copy-Item "$src\app.json", "$src\package.json", "$src\metro.config.js", "$src\.env" $dst -Force
  # Gradle ne surveille pas assets/data : on force la régénération du bundle JS + ressources.
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue `
    "$dst\android\app\build\generated\assets\react", `
    "$dst\android\app\build\generated\res\react"
}

# CMake 3.31.6 : son ninja gère les chemins longs (le 3.22.1 par défaut échoue).
# Réécrit à chaque compilation : un `expo prebuild` peut effacer ce fichier.
Set-Content -Path "$dst\android\local.properties" -Encoding ascii -Value "sdk.dir=C\:\\Android\\Sdk`ncmake.dir=C\:\\Android\\Sdk\\cmake\\3.31.6"

# Mémoire de Gradle : avec les nombreux modules, R8 dépasse les 512 Mo de « Metaspace » par défaut et Gradle se bloque.
$props = "$dst\android\gradle.properties"
(Get-Content $props) -replace '^org\.gradle\.jvmargs=.*', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m' | Set-Content $props -Encoding ascii

$t = Get-Date
Push-Location "$dst\android"
# arm64 : téléphones ; x86_64 : émulateur. (Les vieux téléphones 32 bits ne sont pas couverts.)
.\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64'
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { exit $code }
Copy-Item "$dst\android\app\build\outputs\apk\release\app-release.apk" "$src\TCG-Finder.apk" -Force
"APK prête en $([math]::Round(((Get-Date) - $t).TotalMinutes, 1)) min : $src\TCG-Finder.apk"
