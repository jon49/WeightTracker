#!/usr/bin/env nu

rm -r -f out

let static = (
    ls src/**/*
    | where type == "file" and name =~ "(html|css|js)$"
    | where name !~ "/server/" and name !~ "chart.min.js$"
    | upsert target { |x| $x.name | str replace "src/" "out/" }
    | upsert url { |x| $x.name | str replace "src/" "/" }
)

# copy static files except for js files
$static
| where name !~ "js$"
| par-each { |x|
    # check if the target directory exists
    let dir = ($x.target | path dirname)
    mkdir $dir
    cp $x.name $x.target
}

# write static files to entry-points file
let files = ($static | where { |x| $x.name !~ '\.html$' } | get url | str join "','")
$"export default ['($files)']" | save -f src/web/entry-points.ts

let js = (
    ls **/src/**/js/**/*
    | where type == "file" and name !~ "chart.min.js$"
    | $in.name
)

let all = ($js | append "src/web/sw.ts")

$all

let e = ($all | append [
    '--bundle',
    '--outdir=out',
    '--outbase=src',
    '--format=esm',
    '--watch',
    '--tree-shaking=false',
    '--servedir=out',
])

exec npx esbuild $e

