
# Remove-Item -Path .\public\web\js\ -Recurse

Get-ChildItem -Path .\src\web\js\ -Recurse | ? {
    !$_.PSisContainer
} | % {
    $target = $_ | Resolve-Path -Relative | % { $_ -replace "\\src\\", "\\public\\" -replace "\.ts", ".js" }
    if ($_.Name.EndsWith(".d.ts")) {
    } elseif ($_.Extension -eq ".js") {
        $targetDir = Split-Path $target
        if (-not (Test-Path -Path $targetDir)) {
            New-Item -Path $targetDir -ItemType Directory > $null
        }
        Copy-Item -Path $_.FullName -Destination $target
    } else {
        &esbuild $_.FullName --format=esm --outfile=$target
    }
}

Get-ChildItem -Path .\src\web\css\ -Recurse | % {
    $target = $_ | Resolve-Path -Relative | % { $_ -replace "src", "public" }
    $targetDir = Split-Path $target
    if (-not (Test-Path -Path $targetDir)) {
        New-Item -Path $targetDir -ItemType Directory > $null
    }
    Copy-Item -Path $_.FullName -Destination $target
}

Get-ChildItem -Path .\src\web\ -Recurse -Filter *.html | % {
    $target = $_ | Resolve-Path -Relative | % { $_ -replace "src", "public" }
    $targetDir = Split-Path $target
    if (-not (Test-Path -Path $targetDir)) {
        New-Item -Path $targetDir -ItemType Directory > $null
    }
    Copy-Item -Path $_.FullName -Destination $target
}
