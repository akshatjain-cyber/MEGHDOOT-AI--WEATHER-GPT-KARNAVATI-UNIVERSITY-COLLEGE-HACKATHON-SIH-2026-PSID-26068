import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addChatMessage, createConversation, createSavedLocation, getConversation,
  getPreferences, listConversations, listSavedLocations, renameConversation,
  deleteConversation, upsertPreferences,
} from "./db";

const supportedLanguages = ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN", "gu-IN", "bn-IN", "mr-IN", "ml-IN", "pa-IN", "ur-IN", "es-ES", "fr-FR", "ar-SA", "zh-CN", "ja-JP"] as const;
const languageLabels: Record<string, string> = {
  "en-IN": "English", "hi-IN": "Hindi", "kn-IN": "Kannada", "ta-IN": "Tamil", "te-IN": "Telugu",
  "gu-IN": "Gujarati", "bn-IN": "Bengali", "mr-IN": "Marathi", "ml-IN": "Malayalam", "pa-IN": "Punjabi",
  "ur-IN": "Urdu", "es-ES": "Spanish", "fr-FR": "French", "ar-SA": "Arabic", "zh-CN": "Mandarin Chinese", "ja-JP": "Japanese",
};
const modeSchema = z.enum(["general", "farmer", "fisherman"]);
const weatherInput = z.object({ latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), location: z.string().default("Location not set") });

export function weatherUnavailable(reason = "Weather data is temporarily unavailable") {
  return {
    current: {},
    hourly: { time: [], precipitation_probability: [], precipitation: [], temperature_2m: [], wind_speed_10m: [], visibility: [], weather_code: [] },
    daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], weather_code: [], sunrise: [], sunset: [], precipitation_sum: [] },
    providerStatus: "unavailable" as const,
    providerMessage: reason,
  };
}

async function getWeather(latitude: number, longitude: number) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility,uv_index", hourly: "precipitation_probability,precipitation,temperature_2m,wind_speed_10m,visibility,weather_code", daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,precipitation_sum", forecast_days: "5", timezone: "auto" });
  let lastError = "Weather data is temporarily unavailable";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
      if (response.ok) return await response.json();
      lastError = `Weather provider returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.warn(`[Weather] ${lastError}; continuing with an unavailable-data payload`);
  return weatherUnavailable("Live weather is temporarily unavailable. Try again shortly.");
}

async function reverseGeocode(latitude: number, longitude: number) {
  const params = new URLSearchParams({ format: "jsonv2", lat: String(latitude), lon: String(longitude), zoom: "18", addressdetails: "1" });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: { "User-Agent": "Meghdoot-SIH26068/1.0 (weather safety app)" } });
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
  return response.json() as Promise<{ display_name?: string; address?: Record<string, string> }>;
}

async function searchLocations(query: string) {
  const params = new URLSearchParams({ format: "jsonv2", q: query, limit: "5", addressdetails: "1" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": "Meghdoot-SIH26068/1.0 (weather safety app)" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Location search returned ${response.status}`);
  return (await response.json()) as Array<{ place_id: number; display_name: string; lat: string; lon: string; type?: string }>;
}

type OSMElement = { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
function distanceKm(fromLat: number, fromLon: number, lat: number, lon: number) {
  const rad = Math.PI / 180, dLat = (lat - fromLat) * rad, dLon = (lon - fromLon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(fromLat * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function clampRescueRadius(radiusKm: number) {
  return Math.min(Math.max(radiusKm, 5), 700);
}

export function classifyRescueKind(tags: Record<string, string>) {
  if (tags.amenity === "hospital") return "hospital" as const;
  if (["refugee_site", "refugee_camp"].includes(tags.social_facility ?? "")) return "refugee" as const;
  if (tags.amenity === "shelter" || tags.social_facility === "shelter") return "shelter" as const;
  return "relief" as const;
}

async function overpass(query: string) {
  const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Meghdoot-SIH26068/1.0" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`OpenStreetMap rescue data returned ${response.status}`);
  return (await response.json()) as { elements?: OSMElement[] };
}

async function getNearbyRescuePlaces(latitude: number, longitude: number, radiusKm = 25) {
  const requestedRadius = clampRescueRadius(radiusKm);
  const radii = [5, 10, 25, 50, 100, 200, 300, 700].filter(radius => radius <= requestedRadius || radius === requestedRadius);
  const searchRadii = radii.length ? radii : [requestedRadius];
  let elements: OSMElement[] = [];
  let radiusUsed = searchRadii[searchRadii.length - 1] * 1000;
  for (const radiusKmStep of searchRadii) {
    const radius = radiusKmStep * 1000;
    const query = `[out:json][timeout:22];(nwr[amenity=hospital](around:${radius},${latitude},${longitude});nwr[amenity=shelter](around:${radius},${latitude},${longitude});nwr[social_facility=shelter](around:${radius},${latitude},${longitude});nwr[emergency=designated](around:${radius},${latitude},${longitude});nwr[emergency=ambulance_station](around:${radius},${latitude},${longitude});nwr[social_facility~"shelter|refugee_site|refugee_camp"](around:${radius},${latitude},${longitude}););out center tags;`;
    try { elements = (await overpass(query)).elements ?? []; } catch (error) { if (radiusKmStep === searchRadii[searchRadii.length - 1]) throw error; continue; }
    if (elements.length) { radiusUsed = radius; break; }
  }
  const results = elements.map(element => {
    const tags = element.tags ?? {}, lat = element.lat ?? element.center?.lat ?? latitude, lon = element.lon ?? element.center?.lon ?? longitude;
    const kind = classifyRescueKind(tags);
    return { id: element.id, name: tags.name || tags["name:en"] || "Verified emergency facility", address: tags["addr:full"] || [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ") || "Address not listed", latitude: lat, longitude: lon, kind, distanceKm: Number(distanceKm(latitude, longitude, lat, lon).toFixed(1)), phone: tags.phone || null, website: tags.website || null, source: "OpenStreetMap / Overpass", searchRadiusKm: radiusUsed / 1000, directionsUrl: `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${lat},${lon}` };
  });
  return results.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 30);
}

const nearbyKinds = ["restaurant", "hospital", "pharmacy", "cafe", "atm", "bank", "hotel", "fuel", "supermarket", "school", "college", "park", "tourism", "emergency"] as const;
type NearbyKind = typeof nearbyKinds[number];
async function searchNearbyPlaces(latitude: number, longitude: number, kind: NearbyKind, radius: number) {
  const tag = kind === "emergency" ? "emergency" : kind === "tourism" ? "tourism" : "amenity", value = kind === "tourism" ? "attraction" : kind;
  const payload = await overpass(`[out:json][timeout:20];nwr[${tag}=${value}](around:${radius},${latitude},${longitude});out center tags;`);
  return (payload.elements ?? []).map(element => { const tags = element.tags ?? {}, lat = element.lat ?? element.center?.lat ?? latitude, lon = element.lon ?? element.center?.lon ?? longitude; return { id: element.id, name: tags.name || tags["name:en"] || `Nearby ${kind}`, category: kind, address: tags["addr:full"] || [tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ") || "Address not listed", distanceKm: Number(distanceKm(latitude, longitude, lat, lon).toFixed(2)), latitude: lat, longitude: lon, phone: tags.phone || null, website: tags.website || null, directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` }; }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 30);
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(item => typeof item === "string" ? item : (item as { text?: string }).text ?? "").join("");
  return "I could not generate a weather answer right now.";
}

export function buildWeatherSystemPrompt(language: string, mode: "general" | "farmer" | "fisherman" = "general") {
  const languageName = languageLabels[language] ?? "English";
  const modeInstructions = {
    general: "Prioritize the user's exact question, rain timing, travel/outdoor safety, severe weather, and practical advice.",
    farmer: "Prioritize rainfall timing, irrigation, soil moisture, heat/frost, wind, spray suitability, sowing/harvesting, pest risk, flooding, and agricultural safety. Do not give unverified or dangerous chemical/agricultural instructions.",
    fisherman: "Prioritize wind speed/direction, rain, thunderstorms, visibility, official warnings, and safe/unsafe guidance. Never invent wave or marine conditions; explicitly say marine data is unavailable when it is not supplied.",
  }[mode];
  return `You are Meghdoot, a careful ${mode} weather decision-support assistant for India. Answer in ${languageName}. ${modeInstructions} Answer the exact question first in one or two natural sentences; do not dump JSON, raw fields, timestamps, or unrelated metadata. Use the supplied weather JSON as the only weather source. Include a time window when relevant and finish with one practical recommendation. Never invent a live alert, warning, historical data, marine condition, facility, or location. Follow official IMD/local authority warnings; official IMD/local authority warnings take priority.`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({ me: publicProcedure.query(opts => opts.ctx.user), logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }) }),
  weather: router({ current: protectedProcedure.input(weatherInput).query(async ({ input }) => ({ location: input.location, fetchedAt: new Date().toISOString(), data: await getWeather(input.latitude, input.longitude) })) }),
  location: router({
    reverse: protectedProcedure.input(z.object({ latitude: z.number(), longitude: z.number() })).query(({ input }) => reverseGeocode(input.latitude, input.longitude)),
    search: protectedProcedure.input(z.object({ query: z.string().trim().min(2).max(120) })).mutation(({ input }) => searchLocations(input.query)),
  }),
  rescue: router({ nearby: protectedProcedure.input(z.object({ latitude: z.number(), longitude: z.number(), radiusKm: z.number().min(5).max(700).default(25) })).query(({ input }) => getNearbyRescuePlaces(input.latitude, input.longitude, input.radiusKm)) }),
  places: router({ search: protectedProcedure.input(z.object({ latitude: z.number(), longitude: z.number(), category: z.enum(nearbyKinds).default("restaurant"), radius: z.number().min(500).max(30000).default(5000) })).query(({ input }) => searchNearbyPlaces(input.latitude, input.longitude, input.category, input.radius)) }),
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => await getPreferences(ctx.user.id) ?? { language: "en-IN", homeLocation: "Location not set", homeLatitude: "0", homeLongitude: "0", speechOutput: 1, lowBandwidthMode: 0 }),
    update: protectedProcedure.input(z.object({ language: z.string().min(2).max(12), homeLocation: z.string().min(2).max(160), homeLatitude: z.string().max(24), homeLongitude: z.string().max(24), speechOutput: z.boolean(), lowBandwidthMode: z.boolean() })).mutation(async ({ ctx, input }) => upsertPreferences(ctx.user.id, { ...input, speechOutput: input.speechOutput ? 1 : 0, lowBandwidthMode: input.lowBandwidthMode ? 1 : 0 })),
  }),
  savedLocations: router({ list: protectedProcedure.query(({ ctx }) => listSavedLocations(ctx.user.id)), create: protectedProcedure.input(z.object({ label: z.string().min(1).max(80), location: z.string().min(2).max(160), latitude: z.string(), longitude: z.string() })).mutation(({ ctx, input }) => createSavedLocation(ctx.user.id, input)) }),
  conversations: router({ list: protectedProcedure.query(({ ctx }) => listConversations(ctx.user.id)), get: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) => getConversation(ctx.user.id, input.id)), rename: protectedProcedure.input(z.object({ id: z.number(), title: z.string().min(1).max(160) })).mutation(({ ctx, input }) => renameConversation(ctx.user.id, input.id, input.title)), delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) => deleteConversation(ctx.user.id, input.id)) }),
  ai: router({
    detectLanguage: protectedProcedure.input(z.object({ text: z.string().min(1).max(1000) })).mutation(async ({ input }) => {
      const response = await invokeLLM({ model: "gpt-5-mini", messages: [{ role: "system", content: `Detect the language of the text. Return only JSON with language and label. Supported codes: ${supportedLanguages.join(", ")}. Prefer the script and words in the text over conversation preference.` }, { role: "user", content: input.text }], response_format: { type: "json_schema", json_schema: { name: "language_detection", strict: true, schema: { type: "object", properties: { language: { type: "string" }, label: { type: "string" } }, required: ["language", "label"], additionalProperties: false } } } });
      try { const parsed = JSON.parse(contentToText(response.choices?.[0]?.message?.content)); const language = supportedLanguages.includes(parsed.language) ? parsed.language : "en-IN"; return { language, label: languageLabels[language] }; } catch { return { language: "en-IN", label: "English" }; }
    }),
    chat: protectedProcedure.input(z.object({ conversationId: z.number().optional(), message: z.string().min(1).max(4000), language: z.string().default("en-IN"), mode: modeSchema.default("general"), location: z.string().default("Current device location"), latitude: z.number().min(-90).max(90).default(0), longitude: z.number().min(-180).max(180).default(0), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).default([]) })).mutation(async ({ ctx, input }) => {
      const weather = await getWeather(input.latitude, input.longitude); let conversationId = input.conversationId;
      if (!conversationId) conversationId = await createConversation(ctx.user.id, input.message.slice(0, 150), input.language, input.location);
      if (!conversationId) throw new Error("Conversation could not be created");
      await addChatMessage(conversationId, "user", input.message);
      const response = await invokeLLM({ model: "gpt-5-mini", messages: [{ role: "system", content: buildWeatherSystemPrompt(input.language, input.mode) }, ...input.history.map(item => ({ role: item.role as "user" | "assistant", content: item.content })), { role: "user", content: `Location: ${input.location}\nWeather data: ${JSON.stringify(weather)}\nQuestion: ${input.message}` }], reasoning: { effort: "low" } });
      const reply = contentToText(response.choices?.[0]?.message?.content); await addChatMessage(conversationId, "assistant", reply);
      return { conversationId, reply, weather, language: input.language, location: input.location, mode: input.mode };
    }),
  }),
});
export type AppRouter = typeof appRouter;
