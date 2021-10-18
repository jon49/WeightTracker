param([string] $basePath = '../wwwroot/web')
$files = @{}
Get-ChildItem -Path $basePath -Recurse -Include *.js,*.css -Exclude sw.js |
% {
    $hash = Get-FileHash $_ | % { $_.Hash.Substring($_.Hash.Length - 8).ToLower() }
    $newFileName = "$($_.BaseName).$hash$($_.Extension)"
    $files.Add($_.Name, $newFileName)
    Rename-Item -Path $_ -NewName $newFileName
}

Get-ChildItem -Path $basePath -Recurse -Include *.js,*.html |
% {
    $content = Get-Content $_
    $files.Keys | % {
        $content = $content -replace $_,$files.$_
    }
    $content | Set-Content -Path $_
}
