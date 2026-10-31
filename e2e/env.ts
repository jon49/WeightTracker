// Ports differ from `npm start` (8008/4000) and ../soccer's suite (8010/4010)
// so the suite can run alongside either.
export const API_PORT = 4011;
export const APP_PORT = 8011;
export const DEPOT = new URL("./.depot/", import.meta.url).pathname;
