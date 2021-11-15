param([string] $Path, [string][Alias("sw")] $ServiceWorker, [string][Alias("o")] $Out)

# TODO: Add files to the service worker.

$Out = if ($Out -eq $null) { "./public" } else { $Out }
New-Item -Path $Out -ItemType Directory -Force > $null
$Out = Resolve-Path -Path $Out

$cwd = Get-Location

$swFilename = Split-Path -Path $ServiceWorker -Leaf
Set-Location $(if ($Path -eq $null) { Get-Location } else { Resolve-Path -Path $Path })

$hashed = @{}

function Set-FileHash {
    param([string] $Path)
    $fileInfo = Get-Item -Path $Path
    $hash = Get-FileHash $Path | % { $_.Hash.Substring($_.Hash.Length - 8).ToLower() }
    $newFileName = "$($fileInfo.BaseName).$hash$($fileInfo.Extension)"
    $newFilePath = Split-Path -Path $Path | % { Join-Path -Path $_ -ChildPath $newFileName }
    if (Test-Path -Path $newFilePath) {
        $newFileName
    } else {
        Rename-Item -Path $Path -NewName $newFileName
        $newFileName
    }
    if (Test-Path -Path $Path) {
        Remove-Item -Path $Path
    }
}

function Set-FileHashAndDependencies {
    param ([FileInfo] $File)
    $fileName = Split-Path -Path $File.filename -Leaf
    $newPath = Resolve-Path -Path $File.filename -Relative |
        Split-Path |
        % { Join-Path -Path $Out -ChildPath (Join-Path -Path $_ -ChildPath $fileName) }
    New-Item -Path $(Split-Path -Path $newPath) -ItemType Directory -Force > $null
    if ($File.dependencies.Count -gt 0) {
        $i = 0
        $count = $File.dependencies.Count
        Get-Content $File.filename | % {
            if ($i -lt $count) {
                [Dependency]$dep = $File.dependencies[$i]
                [FileInfo]$f = $hashed[$dep.path]
                $_ -replace (Split-Path $dep.value -Leaf), $f.hash
                $i++
            } else {
                $_
            }
        } | Set-Content -Path $newPath
        $File.hash = Set-FileHash -Path $newPath
    } else {
        Copy-Item -Path $File.filename -Destination $newPath -Force
        $File.hash = Set-FileHash -Path $newPath
    }
}


$files = Get-ChildItem -Path . -Recurse -Exclude $swFilename -Include *.html,*.js,*.css |
% {
    $fileName = $_.FullName
    [FileInfo]@{
        filename = $fileName
        url = ((Resolve-Path -Relative $fileName) -replace "\\","/").Substring(1)
        dependencies = [System.Collections.ArrayList]::new()
        hash = "" }
}

$files | % {
    $directory = Split-Path -Parent -Path $_.filename
    foreach ($f in Get-Content $_.filename) {
        if (-not $f.StartsWith("import")) { return }
        $dependency = if ($f -match '"([^"]+)"') { $matches[1] }
        $dependencyItem = [Dependency]@{
            value = $dependency
            path = [System.IO.Path]::GetFullPath((Join-Path -Path $directory -ChildPath $dependency))
        }
        $_.dependencies.add($dependencyItem) > $null
    }
}

while ($files.Count -ne $hashed.Count) {
    foreach ($f in $files) {
        [FileInfo]$f = $f
        if (($f.dependencies.Count -eq 0 -and -not $hashed.ContainsKey($f.filename)) -or
            (-not $hashed.ContainsKey($f.filename) -and
            $f.dependencies.Count -gt 0 -and
            # And every dependency is accounted for
            ($false -ne ($f.dependencies | %{$hashed.ContainsKey($_.path)} | ?{-not $_} | Select-Object -First 1)))
        ) {
            $hashed.Add($f.filename, $f)
            Set-FileHashAndDependencies -File $f
        }
    }
}

Set-Location $cwd

class FileInfo {
    [string]$filename
    [string]$url
    [System.Collections.ArrayList]$dependencies
    [string]$hash
}

class Dependency {
    [string]$value
    [string]$path
}
