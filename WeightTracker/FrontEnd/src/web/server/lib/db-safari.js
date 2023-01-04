/**
 * Bundled by jsDelivr using Rollup v2.56.3 and Terser v5.7.1.
 * Original file: /npm/safari-14-idb-fix@3.0.0/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function e(){var e;return!navigator.userAgentData&&/Safari\//.test(navigator.userAgent)&&!/Chrom(e|ium)\//.test(navigator.userAgent)&&indexedDB.databases?new Promise((function(a){var t=function(){return indexedDB.databases().finally(a)};e=setInterval(t,100),t()})).finally((function(){return clearInterval(e)})):Promise.resolve()}export{e as default};
//# sourceMappingURL=/sm/fbccc25a0f9d2c769bef16cfe39c6cf64d60d6c7e0dc4cb28fe0064e326fbd6c.map