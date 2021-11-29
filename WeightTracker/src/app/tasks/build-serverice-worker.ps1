param(
    [string] $Path,
    [string][Alias("sw")] $ServiceWorker,
    [string][Alias("o")] $Out,
    [switch] $Clear,
    [string[]][Alias("u")] $UpdateAllLines)
# .\tasks\build-serverice-worker.ps1 -Path ./sw -sw ./sw/sw.js -o ./public -Clear -u ./sw/_layout.html.js

$Out = if ($Out -eq $null) { "./public" } else { $Out }
New-Item -Path $Out -ItemType Directory -Force > $null
$Out = Resolve-Path -Path $Out

if ($Clear -and (Test-Path $Out)) {
    Remove-Item -Recurse $Out
    New-Item -Path $Out -ItemType Directory -Force > $null
}

$cwd = Get-Location

$swFilename = (Split-Path -Path $ServiceWorker -Leaf) -replace "ts$", "js"
Set-Location $(if ($Path -eq $null) { Get-Location } else { Resolve-Path -Path $Path })

$hashed = @{}

function Set-FileHash {
    param([FileData] $File)
    if ($File.isServiceWorker -or $File.types.Contains([FileType]::HTML)) { return $File.newPath }
    $fileInfo = Get-Item -Path $File.newPath
    $hash = Get-FileHash $File.newPath | % { $_.Hash.Substring($_.Hash.Length - 8).ToLower() }
    $newFileName = "$($fileInfo.BaseName).$hash$($fileInfo.Extension)"
    $newFilePath = Split-Path -Path $File.newPath | % { Join-Path -Path $_ -ChildPath $newFileName }
    if (Test-Path -Path $newFilePath) {
        $newFileName
    } else {
        Rename-Item -Path $File.newPath -NewName $newFileName
        $newFileName
    }
    if (Test-Path -Path $File.newPath) {
        Remove-Item -Path $File.newPath
    }
}

function Get-FileContent {
    param ([FileData] $File)
    if ($File.types.Contains([FileType]::TypeScript)) {
        esbuild.cmd $File.path --format=esm
    } else {
        Get-Content $File.path
    }
}

function Write-File {
    param ([FileData] $File, [FileData[]] $Files)
    $i = 0
    $count = $File.dependencies.Count
    $filledServiceWorkerFiles = $false
    Get-FileContent -File $File | % {
        if ($i -lt $count) {
            [Dependency]$dep = $File.dependencies[$i]
            [FileData]$f = $hashed[$dep.path]
            $_ -replace (Split-Path $dep.value -Leaf), $f.hash
            $i++
        } elseif ($File.isServiceWorker -and -not $filledServiceWorkerFiles -and $_.EndsWith("const links = [];")) {
            $currentDir = Get-Location
            Set-Location -Path $Out
            $filledServiceWorkerFiles = $true
            $fs = $Files | % {
                [FileData]$f = $_
                if ($f.hash -eq "") {
                    $null
                } else {
                    Join-Path -Path (Split-Path $f.newPath) -ChildPath $f.hash |
                    % { (Resolve-Path -Relative $_) -replace "\\","/" } |
                    % { $_.Substring(1) }
                }
            } | ?{ $_ -ne $null } | Join-String -Separator '","'
            Set-Location $currentDir
            "$($_.Substring(0, $_.Length - 3))[""$fs""]"
        } else {
            $_
        }
    } | Set-Content -Path $File.newPath
}

function Set-FileHashAndDependencies {
    param ([FileData] $File, [FileData[]] $Files)
    $File.newPath = Resolve-Path -Path $File.path -Relative |
        Split-Path |
        % { Join-Path -Path $Out -ChildPath (Join-Path -Path $_ -ChildPath $File.filename) }
    New-Item -Path $(Split-Path -Path $File.newPath) -ItemType Directory -Force > $null
    if ($File.dependencies.Count -gt 0 -or $File.isServiceWorker) {
        Write-File -File $File -Files $Files
        $File.hash = Set-FileHash -File $File
    } else {
        if ($File.types.Contains([FileType]::TypeScript)) {
            Get-FileContent -File $File | Set-Content -Path $File.newPath
        } else {
            Copy-Item -Path $File.path -Destination $File.newPath -Force
        }
        $File.hash = Set-FileHash -File $File
    }
}

function Get-FileTypes {
    param ([System.IO.FileInfo] $Info)
    $filename = $Info.Name
    if ($filename.Length -gt 5 -and $filename.Substring($filename.Length - 5) -eq ".d.ts") {
        [FileType]::TypeScriptDefinition
    } elseif ($Info.Length -gt 8 -and $filename -match "\.html\.[jt]s$") {
        if ($Info.Extension -eq ".ts") {
            @([FileType]::HTMLScript, [FileType]::TypeScript)
        } else {
            @([FileType]::HTMLScript, [FileType]::JavaScript)
        }
    } elseif ($Info.Extension -eq ".ts") {
        [FileType]::TypeScript
    } elseif ($Info.Extension -eq ".js") {
        [FileType]::JavaScript
    } elseif ($Info.Extension -eq ".html") {
        [FileType]::HTML
    } elseif ($Info.Extension -eq ".css") {
        [FileType]::CSS
    } else {
        [FileType]::Unknown
    }
}

function Get-Filenames {
    param ([System.IO.FileInfo]$Info, [FileType[]] $Types)
    $path = $_.FullName
    $normalized = $path
    $filename = $Info.Name
    if ($Types.Contains([FileType]::TypeScript)) {
        $filename = $filename -replace "ts$", "js"
        $normalized = $normalized -replace "ts$", "js"
    }
    @{
        path = $path
        normalized = $normalized
        filename = $filename
    }
}

$files = Get-ChildItem -Path . -Recurse -Include *.js,*.ts,*.css,*.html |
% {
    $types = Get-FileTypes -Info $_
    if ($types.GetType().Name -eq "FileType") {
        $types = ,$types
    }
    $info = Get-Filenames -Info $_ -Types $types
    if ($types.Contains([FileType]::Unknown) -or $types.Contains([FileType]::TypeScriptDefinition)) {
        $null
    } else {
        [FileData]@{
            path = $info.path
            filename = $info.filename
            normalized = $info.normalized
            url = ((Resolve-Path -Relative $info.path) -replace "\\","/").Substring(1)
            dependencies = [System.Collections.ArrayList]::new()
            hash = ""
            isServiceWorker = $swFilename -eq $info.filename
            types = $types
        }
    }
} | ? { $_ -ne $null }

$files | % {
    $directory = Split-Path -Parent -Path $_.path
    ForEach ($f in Get-Content $_.path) {
        if (-not $f.StartsWith("import")) { return }
        $dependency = if ($f -match "['""]([^""^']+)['""]") { $matches[1] }
        if ($dependency.EndsWith(".js")) {
            $dependencyItem = [Dependency]@{
                value = $dependency
                path = [System.IO.Path]::GetFullPath((Join-Path -Path $directory -ChildPath $dependency))
            }
            $_.dependencies.add($dependencyItem) > $null
        }
    }
}

$loop = 0
while ($files.Length -ne $hashed.Count) {
    foreach ($f in $files) {
        [FileData]$f = $f
        if ((-not $f.isServiceWorker -or $files.Length - 1 -eq $hashed.Count) -and
            (($f.dependencies.Count -eq 0 -and -not $hashed.ContainsKey($f.normalized)) -or
            (-not $hashed.ContainsKey($f.normalized) -and
            $f.dependencies.Count -gt 0 -and
            # And every dependency is accounted for
            ($false -ne ($f.dependencies | %{$hashed.ContainsKey($_.path)} | ?{-not $_} | Select-Object -First 1))))
        ) {
            $hashed.Add($f.normalized, $f)
            Set-FileHashAndDependencies -File $f -Files $files
        }
    }
    $loop++
    if ($loop -eq 100) {
        Write-Host "Looped 100 times."
        return
    }
}

Set-Location $cwd

class FileData {
    [string]$path
    [string]$normalized
    [string]$newPath
    [string]$filename
    [string]$url
    [System.Collections.ArrayList]$dependencies
    [string]$hash
    [bool]$isServiceWorker
    [FileType[]]$types
}

enum FileType {
    TypeScript
    HTML
    HTMLScript
    JavaScript
    CSS
    TypeScriptDefinition
    Unknown
}

class Dependency {
    [string]$value
    [string]$path
}
