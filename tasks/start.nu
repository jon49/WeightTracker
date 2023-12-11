#!/usr/bin/env nu

# prod, dev, or server
def main [build: string = "dev"] {

    let targetDir = (
        if $build == "server" {
            "../weight-server/public"
        } else {
            "public"
        })

    rm -r -f $targetDir
    mkdir $targetDir

    let insertHash = { |x|
        let splitFilename = ($x.name | split column '.' | transpose | get column1) 
        let flength = ($splitFilename | length)
        let filename = ($splitFilename | insert ($flength - 1) $x.hash | str join '.')
        $filename | str replace '^src/' $"($targetDir)/"
    }

    # webpack uses sha256 with 8 characters so I guess I will too!
    let addHash = { |x|
        $x
        | insert hash { |x| open -r $x.name | hash sha256 | str substring 56..64 }
        | insert hashed $insertHash
        | insert pathname { |x| $x.hashed | str substring ($x.hashed | str index-of '/web')..999 }
        | insert target-dir { |x| $x.hashed | path dirname }
        | insert url { |x| $x.name | str substring ($x.name | str index-of '/web')..999 }
        | select name hashed url pathname target-dir
    }

    # copy html file
    ^mkdir -p $"($targetDir)/web"
    ^cp "./node_modules/@jon49/sw/lib/app-loader.html" $"($targetDir)/web/index.html"

    # copy css files
    ls src/**/css/**/*.css
    | each $addHash
    | each { |x|
        mkdir $x.target-dir
        cp $x.name $x.hashed
    }

    # copy json files
    try {
        ls src/**/*.json
        | each $addHash
        | each { |x|
            mkdir $x.target-dir
            # minify json
            if $build == "prod" {
                open $x.name | to json -r | save -f $x.hashed
            } else {
                cp $x.name $x.hashed
            }
        }
    } catch {}

    let js = (
        ls **/src/**/js/**/*
        | where type == "file" and name !~ '\.bundle\.' and name !~ '/_[^/]+$'
        | $in.name
    )

    let e = ($js | append [
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=esm',
        '--tree-shaking=false',
        '--entry-names=[dir]/[name].[hash]',
    ]
    | append (
        if $build == "prod" {
            [ '--minify' ]
        } else { [] }
    ))

    ^npx esbuild $e

    let bundles = (
        ls **/src/**/js/**/*.bundle.*
        | where type == "file" and name =~ '\.bundle\.'
        | $in.name
    )

    let eBundle = ($bundles | append [
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=iife',
        '--bundle',
        '--entry-names=[dir]/[name].[hash]' 
    ]
    | append (
        if $build == "prod" {
            [ '--minify' ]
        } else { [] }
    ))

    ^npx esbuild $eBundle

    ls $"($targetDir)/**/js/**/*.bundle.*"
    | each { |x|
        let name = $x.name
        mv $name ($name | str replace '\.bundle\.' '.')
    }

    # write static files to entry-points file
    let files = (
        ls $"($targetDir)/web/**/*"
        | where { |x| $x.name =~ '\.(css|js|json)$' }
        | insert file { |x| $x.name | str substring ($x.name | str index-of '/web')..999 }
        | insert url { |x|
            let s = $x.file
            let length = ($s | str length)
            let extension = ($s | str substring ($s | str index-of -e '.')..)
            let extensionLength = ($extension | str length)
            let first = ($s | str substring ..($length - $extensionLength - 9))
            $first + $extension
        }
        | select url file
        | to json
    )
    $"export default ($files)" | save -f src/web/entry-points.ts

    # copy html files
    let appCss = (ls $"($targetDir)/**/app.*.css" | get name | first | str replace $targetDir "")
    let indexCss = (ls $"($targetDir)/**/index.*.css" | get name | first | str replace $targetDir "")
    let appJs = (ls $"($targetDir)/js/app.*.js" | get name | first | str replace $targetDir "")
    ls src/**/*.html
    | each { |x|
        mkdir ($x.name | path dirname | str replace '^src/' $"($targetDir)/")
        open $x.name
        | str replace '{{indexCss}}' $indexCss
        | str replace '{{appCss}}' $appCss
        | str replace '{{appJs}}' $appJs
        | save -f ($x.name | str replace '^src/' $"($targetDir)/")
    }

    # copy images
    cp -r src/web/images $"($targetDir)/web/images"

    # Service worker
    let sw = ([
        '--bundle',
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=iife',
        'src/web/sw.ts',
    ]
    | append (
        if $build == "prod" { [
            '--minify',
            '--entry-names=[dir]/[name].[hash]'
            ]
        } else if $build == "dev" { [
            $"--servedir=($targetDir)",
            '--watch'
        ] }
        else { [ '--watch' ] }
    ))

    ^npx esbuild $sw

    if $build == "prod" {
        # Get hashed sw.js file and create a new file that imports that file.
        let swJs = (
            ls $"($targetDir)/web/sw.*.js"
            | get name
            | first
            | str replace $targetDir "")
        ("importScripts(" + '"' + $swJs + '"' + ")") | save -f $"($targetDir)/web/sw.js"
    }

}

