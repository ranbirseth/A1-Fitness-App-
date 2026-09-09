// Centralized API configuration.
//
// The API base URL is the single place to change where the app talks to
// the A1 Fitness backend.
//
// Resolution order:
//   1. EXPO_PUBLIC_API_URL from the environment (.env / .env.local file).
//   2. API_BASE_URL constant below (development fallback).
//
// For a physical Android device, localhost refers to the phone itself, so use
// your development computer's LAN IP, e.g. http://192.168.x.x:5000/api
//
// Set the real value in a `.env.local` file (gitignored), for example:
//     EXPO_PUBLIC_API_URL=http://192.168.1.50:5000/api
// or edit API_BASE_URL below for quick local changes.
//
// The production URL is not confirmed yet, so none is hardcoded here.

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') || '';

if (!API_BASE_URL) {
  // Fail loudly in development if the backend URL is not configured rather
  // than silently pointing at a wrong server.
  console.warn(
    '[API] EXPO_PUBLIC_API_URL is not configured. Set it in a .env or .env.local file, ' +
      'or edit API_BASE_URL in src/config/api.ts.'
  );
}

export { API_BASE_URL };
