// Google Weather API key for the canonical weather provider. Runtime env first
// (Vercel functions); import.meta.env covers `astro dev`. The Places key works
// once the Weather API is enabled on its GCP project; a dedicated
// GOOGLE_WEATHER_API_KEY wins if one is ever added.
export function weatherApiKey(): string {
  return (
    process.env.GOOGLE_WEATHER_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    import.meta.env.GOOGLE_WEATHER_API_KEY ||
    import.meta.env.GOOGLE_PLACES_API_KEY ||
    ""
  );
}
