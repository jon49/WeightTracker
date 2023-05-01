#!/usr/bin/env nu

let ignoredFiles = { |x| $x.name !~ "/_[^/]+$" }

def getPages [] {
    ls src/**/*.html.ts
    | filter $ignoredFiles
    | select name
    | to nuon
}

def getApis [] {
    ls src/**/*.api.ts
    | filter $ignoredFiles
    | select name
    | to nuon
}

def getJs [] {
    ls src/**/js/**/*
    | where type == "file" and name !~ "/lib/"
    | filter $ignoredFiles
    | select name
    | to nuon
}

