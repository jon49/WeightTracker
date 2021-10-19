param([string] $basePath = '../wwwroot/web')

$filePaths = @(
    "/lib/chart.min.js"
    "/lib/db-safari.js"
    "/lib/db.min.js"
    "actions.js"
    "h.js"
    "snack-bar.js"
    "utils.js"
    "db.js"
    "main.js"
    "user-settings-page.js"
    "charts-page.js"
    "entry-page.js"
)

$files = @{}
$filePaths | % {
    $fullPath = Join-Path -Path $basePath "js" $_ | Get-Item
    $content = Get-Content $fullPath
    $files.Keys | % {
        $content = $content -replace $_, $files.$_
    }
    $content | Set-Content -Path $fullPath
    $hash = Get-FileHash $fullPath | % { $_.Hash.Substring($_.Hash.Length - 8).ToLower() }
    $newFileName = "$($fullPath.BaseName).$hash$($fullPath.Extension)"
    Rename-Item -Path $fullPath -NewName $newFileName
    $files.Add($fullPath.Name, $newFileName)
}


Get-ChildItem -Path $basePath -Recurse -Include *.css |
% {
    $hash = Get-FileHash $_ | % { $_.Hash.Substring($_.Hash.Length - 8).ToLower() }
    $newFileName = "$($_.BaseName).$hash$($_.Extension)"
    $files.Add($_.Name, $newFileName)
    Rename-Item -Path $_ -NewName $newFileName
}

Get-ChildItem -Path $basePath -Recurse -Include *.html,sw.js |
% {
    $content = Get-Content $_
    $files.Keys | % {
        $content = $content -replace $_,$files.$_
    }
    $content | Set-Content -Path $_
}
