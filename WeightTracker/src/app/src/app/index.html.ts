import { Module } from "globals"

export default {
    get: () => Promise.resolve({main: ""})
} as Module
