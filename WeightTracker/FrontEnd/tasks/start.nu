#!/usr/bin/env nu

let ignoredFiles = { |x| $x.name !~ "/_[^/]+$" }

let pages = (
    ls src/**/*.html.ts
    | filter $ignoredFiles
)

let api = (
    ls src/**/*.api.ts
    | filter $ignoredFiles
)

let js = (
    ls src/**/js/**/*
    | where type == "file" and name !~ "/lib/"
    | filter $ignoredFiles
)

let css = (ls src/**/css/**/*.css)

let html = (ls src/**/*.html)

def main [
    debug: bool = false
    prod: bool = false
] {

    let css = (
        ls **/src/**/css/**/*.css
        | where type == "file"
# webpack uses sha256 with 8 characters so I guess I will too!
        | insert hash { |x| open $x.name | hash sha256 | str substring 56..64 }
        | select name hash
        | insert hash-filename { |x| ($x.name | str replace '\.css$' $".($x.hash).css") }
        | select name hash-filename
    )

# $file | hash sha256 | str substring 56..64 

    let all = (
        $pages
        | append $js
        | append $api
        | append "src/web/sw.ts")

    let e = ($all | append [
        '--bundle',
        '--outdir=out',
        '--outbase=src',
        '--format=esm',
        '--watch',
        '--tree-shaking=false',
    ])

    exec npx esbuild $e
}


