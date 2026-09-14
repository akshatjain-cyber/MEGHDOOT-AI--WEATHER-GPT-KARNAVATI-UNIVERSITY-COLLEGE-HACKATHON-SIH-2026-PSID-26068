import { useEffect, useMemo, useRef, useState } from "react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import RescueMap from "@/components/RescueMap";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  Bookmark,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  CloudRain,
  CloudSun,
  Globe2,
  Languages,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Mic,
  MicOff,
  PanelLeft,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  X,
} from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type AssistantMode = "general" | "farmer" | "fisherman";

type WeatherPayload = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    surface_pressure?: number;
    visibility?: number;
    uv_index?: number;
  };
  hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; wind_speed_10m?: number[]; weather_code?: number[] };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
  };
};

type LocationState = { label: string; full: string; lat: number; lon: number };

const languages = [
  { value: "en-IN", label: "English", voice: "en-IN" },
  { value: "hi-IN", label: "हिन्दी", voice: "hi-IN" },
  { value: "kn-IN", label: "ಕನ್ನಡ", voice: "kn-IN" },
  { value: "ta-IN", label: "தமிழ்", voice: "ta-IN" },
  { value: "te-IN", label: "తెలుగు", voice: "te-IN" },
  { value: "gu-IN", label: "ગુજરાતી", voice: "gu-IN" },
  { value: "bn-IN", label: "বাংলা", voice: "bn-IN" },
  { value: "mr-IN", label: "मराठी", voice: "mr-IN" },
  { value: "ml-IN", label: "മലയാളം", voice: "ml-IN" },
  { value: "pa-IN", label: "ਪੰਜਾਬੀ", voice: "pa-IN" },
  { value: "ur-IN", label: "اردو", voice: "ur-IN" },
  { value: "es-ES", label: "Español", voice: "es-ES" },
  { value: "fr-FR", label: "Français", voice: "fr-FR" },
  { value: "ar-SA", label: "العربية", voice: "ar-SA" },
  { value: "zh-CN", label: "中文", voice: "zh-CN" },
  { value: "ja-JP", label: "日本語", voice: "ja-JP" },
];

const suggestedPrompts = [
  "Should I carry an umbrella today?",
  "Is it safe to spray my crop tomorrow?",
  "Explain this forecast in simple language.",
  "What should I know about the next 6 hours?",
];

function weatherLabel(code?: number) {
  if (code === undefined) return "Loading conditions";
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy conditions";
  if (code <= 67) return "Rain likely";
  if (code <= 77) return "Snow or ice";
  if (code <= 82) return "Rain showers";
  return "Storm risk";
}

function weatherIcon(code?: number, className = "h-7 w-7") {
  if (code === undefined) return <CloudSun className={className} />;
  if (code === 0) return <Sun className={className} />;
  if (code <= 3) return <CloudSun className={className} />;
  if (code <= 67 || code <= 82) return <CloudRain className={className} />;
  return <Waves className={className} />;
}

function dayName(date?: string, index = 0) {
  if (!date) return index === 0 ? "Today" : "Day";
  if (index === 0) return "Today";
  // Open-Meteo returns ISO dates, but the UI also has safe fallback labels
  // while a feed is loading. Never pass a fallback label to Intl.DateTimeFormat.
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return index === 1 ? "Tomorrow" : `Day ${index + 1}`;
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(parsed);
}

export function speechSafeText(text: string) {
  return text
    .replace(/\b(\d+(?:\.\d+)?)\s*°\s*C?\b/gi, "$1 degrees")
    .replace(/\b(\d+(?:\.\d+)?)\s*%/g, "$1 percent")
    .replace(/\bkm\s*\/\s*h\b/gi, "kilometers per hour")
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, "$1 point $2")
    .replace(/\/{2,}/g, " point ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speechChunks(text: string) {
  const normalized = speechSafeText(text);
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > 240) {
    const cut = Math.max(120, remaining.lastIndexOf(".", 240), remaining.lastIndexOf("।", 240), remaining.lastIndexOf("!", 240), remaining.lastIndexOf("?", 240), remaining.lastIndexOf(" ", 240));
    chunks.push(remaining.slice(0, cut + (remaining[cut] === " " ? 0 : 1)).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : [normalized];
}

export function findSpeechVoice(voices: SpeechSynthesisVoice[], requested: string) {
  const locale = requested.toLowerCase();
  const base = locale.split("-")[0];
  const aliases: Record<string, string[]> = { en: ["natural", "neural", "google", "microsoft", "samantha", "ava", "aria"], gu: ["gujarati"], hi: ["hindi", "neerja", "google"], mr: ["marathi"], bn: ["bengali", "bangla"], ta: ["tamil"], te: ["telugu"], kn: ["kannada"], ml: ["malayalam"], pa: ["punjabi"], or: ["odia", "oriya"], ur: ["urdu"] };
  const sameLocale = voices.filter(voice => voice.lang.toLowerCase() === locale);
  const sameLanguage = voices.filter(voice => voice.lang.toLowerCase().startsWith(`${base}-`));
  const preferred = [...sameLocale, ...sameLanguage, ...voices].find(voice => (aliases[base] ?? []).some(alias => voice.name.toLowerCase().includes(alias)));
  return preferred ?? sameLocale[0] ?? sameLanguage[0] ?? voices.find(voice => (aliases[base] ?? []).some(alias => voice.name.toLowerCase().includes(alias)));
}

export function detectLanguageLocally(text: string) {
  if (/[\u0900-\u097f]/.test(text)) return "hi-IN";
  if (/[\u0980-\u09ff]/.test(text)) return "bn-IN";
  if (/[\u0b80-\u0bff]/.test(text)) return "ta-IN";
  if (/[\u0c00-\u0c7f]/.test(text)) return "te-IN";
  if (/[\u0c80-\u0cff]/.test(text)) return "kn-IN";
  if (/[\u0d00-\u0d7f]/.test(text)) return "ml-IN";
  if (/[\u0a80-\u0aff]/.test(text)) return "gu-IN";
  if (/[\u0a00-\u0a7f]/.test(text)) return "pa-IN";
  if (/[\u0900-\u097f]/.test(text)) return "mr-IN";
  if (/[\u0600-\u06ff]/.test(text)) return "ur-IN";
  return "en-IN";
}

function speakText(text: string, language: string, voices: SpeechSynthesisVoice[], onEnd?: () => void, onUnavailable?: () => void, runRef?: { current: number }, runId?: number) {
  if (!("speechSynthesis" in window)) {
    onUnavailable?.();
    return false;
  }
  const requestedVoice = languages.find(item => item.value === language)?.voice ?? language;
  let attempts = 0;
  const speakWhenReady = () => {
    if (runRef && runId !== undefined && runRef.current !== runId) return;
    const availableVoices = voices.length ? voices : window.speechSynthesis.getVoices();
    const matchingVoice = findSpeechVoice(availableVoices, requestedVoice);
    if (!matchingVoice && attempts < 10 && availableVoices.length === 0) {
      attempts += 1;
      window.setTimeout(speakWhenReady, 200);
      return;
    }
    if (!matchingVoice && requestedVoice.split("-")[0].toLowerCase() !== "en") {
      onUnavailable?.();
      return;
    }
    const chunks = speechChunks(text);
    let chunkIndex = 0;
    const speakNext = () => {
      if (runRef && runId !== undefined && runRef.current !== runId) return;
      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.lang = requestedVoice;
      if (matchingVoice) utterance.voice = matchingVoice;
      utterance.rate = requestedVoice.toLowerCase().startsWith("en") ? 0.96 : 0.92;
      utterance.pitch = 0.98;
      utterance.onend = () => {
        if (chunkIndex < chunks.length - 1) { chunkIndex += 1; speakNext(); }
        else onEnd?.();
      };
      utterance.onerror = () => onEnd?.();
      window.speechSynthesis.speak(utterance);
    };
    speakNext();
  };
  if (voices.length || window.speechSynthesis.getVoices().length) speakWhenReady();
  else window.setTimeout(speakWhenReady, 200);
  return true;
}

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [activeView, setActiveView] = useState<"overview" | "assistant" | "locations" | "rescue" | "storms" | "settings">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [isSpeechMuted, setIsSpeechMuted] = useState(false);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const lastSpeechRef = useRef<{ text: string; language: string } | null>(null);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [conversationSearch, setConversationSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [location, setLocation] = useState<LocationState>({ label: "Location not set", full: "Location not set", lat: 0, lon: 0 });
  const [locationStatus, setLocationStatus] = useState<"pending" | "locating" | "ready" | "denied" | "manual">("pending");
  const [manualLocationQuery, setManualLocationQuery] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [speechOutput, setSpeechOutput] = useState(true);
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const [mode, setMode] = useState<AssistantMode>(() => (localStorage.getItem("weathergpt-mode") as AssistantMode) || "general");
  const [saved, setSaved] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lon: number } | null>(null);
  const speechRunRef = useRef(0);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; lang: string; onresult: ((event: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null } | null>(null);

  const profileQuery = trpc.profile.get.useQuery(undefined, { enabled: Boolean(user) });
  const weatherQuery = trpc.weather.current.useQuery({ latitude: location.lat, longitude: location.lon, location: location.full }, { enabled: Boolean(user) && location.lat !== 0 && location.lon !== 0, refetchInterval: 15 * 60 * 1000 });
  const savedLocationsQuery = trpc.savedLocations.list.useQuery(undefined, { enabled: Boolean(user) });
  const conversationsQuery = trpc.conversations.list.useQuery(undefined, { enabled: Boolean(user) });
  const conversationQuery = trpc.conversations.get.useQuery({ id: selectedConversationId ?? 0 }, { enabled: Boolean(selectedConversationId) });
  const renameConversationMutation = trpc.conversations.rename.useMutation({ onSuccess: () => conversationsQuery.refetch() });
  const deleteConversationMutation = trpc.conversations.delete.useMutation({ onSuccess: () => { conversationsQuery.refetch(); setConversationId(undefined); setMessages([]); setActiveView("assistant"); } });
  const chatMutation = trpc.ai.chat.useMutation();
  const detectLanguageMutation = trpc.ai.detectLanguage.useMutation();
  const reverseLocationQuery = trpc.location.reverse.useQuery(liveCoords ? { latitude: liveCoords.lat, longitude: liveCoords.lon } : { latitude: 0, longitude: 0 }, { enabled: Boolean(liveCoords) });
  const locationSearchMutation = trpc.location.search.useMutation();
  const profileMutation = trpc.profile.update.useMutation({ onSuccess: () => toast.success("Preferences saved") });
  const saveLocationMutation = trpc.savedLocations.create.useMutation({ onSuccess: () => { setSaved(true); savedLocationsQuery.refetch(); toast.success("Location saved"); } });

  useEffect(() => {
    if (!profileQuery.data) return;
    setLanguage(profileQuery.data.language ?? "en-IN");
    setSpeechOutput(Boolean(profileQuery.data.speechOutput));
    setLowBandwidthMode(Boolean(profileQuery.data.lowBandwidthMode));
    if (profileQuery.data?.homeLocation && profileQuery.data.homeLocation !== "Location not set" && Number(profileQuery.data.homeLatitude) !== 0 && Number(profileQuery.data.homeLongitude) !== 0) {
      setLocation({ label: profileQuery.data.homeLocation.split(",")[0] ?? profileQuery.data.homeLocation, full: profileQuery.data.homeLocation, lat: Number(profileQuery.data.homeLatitude), lon: Number(profileQuery.data.homeLongitude) });
      setLocationStatus("ready");
    }
  }, [profileQuery.data]);

  useEffect(() => { localStorage.setItem("weathergpt-mode", mode); }, [mode]);

  useEffect(() => {
    if (!user || liveCoords || locationStatus === "ready" || locationStatus === "manual") return;
    if (!navigator.geolocation) { setLocationStatus("denied"); return; }
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      setLocation(current => ({ ...current, lat: latitude, lon: longitude, full: "Resolving your place…" }));
      setLiveCoords({ lat: latitude, lon: longitude });
      setLocationStatus("locating");
    }, () => { setLocationStatus("denied"); setLocation(current => ({ ...current, full: "Location permission needed" })); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 });
  }, [user, liveCoords, locationStatus]);

  useEffect(() => {
    const name = reverseLocationQuery.data?.display_name;
    if (reverseLocationQuery.isError && liveCoords) {
      setLocationStatus("ready");
      setLocation(current => ({ ...current, lat: liveCoords.lat, lon: liveCoords.lon, full: "Current area", label: "Current area" }));
      return;
    }
    if (!name || !liveCoords) return;
    const full = name.split(",").slice(0, 3).join(", ");
    setLocationStatus("ready");
    setLocation(current => ({ ...current, lat: liveCoords.lat, lon: liveCoords.lon, full, label: full.split(",")[0] ?? full }));
  }, [reverseLocationQuery.data, reverseLocationQuery.isError, liveCoords]);

  useEffect(() => {
    if (!conversationQuery.data) return;
    setConversationId(conversationQuery.data.conversation.id);
    setMessages(conversationQuery.data.messages.map(message => ({ role: message.role, content: message.content })));
    setActiveView("assistant");
  }, [conversationQuery.data]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refreshVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".scroll-scene > *"));
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(node => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [activeView]);

  useEffect(() => () => { speechRunRef.current += 1; window.speechSynthesis?.cancel(); recognitionRef.current?.stop(); }, []);

  const weather = (weatherQuery.data?.data ?? {}) as WeatherPayload;
  const current = weather.current;
  const daily = weather.daily;
  const languageLabel = languages.find(item => item.value === language)?.label ?? "English";

  function startSpeech(text: string, requestedLanguage: string) {
    if (!("speechSynthesis" in window)) {
      toast.info("Speech is unavailable on this device");
      return;
    }
    speechRunRef.current += 1;
    const runId = speechRunRef.current;
    window.speechSynthesis.cancel();
    lastSpeechRef.current = { text, language: requestedLanguage };
    setIsSpeechMuted(false);
    setIsSpeechPaused(false);
    setIsSpeaking(true);
    const started = speakText(text, requestedLanguage, speechVoices, () => {
      if (speechRunRef.current === runId) { setIsSpeaking(false); setIsSpeechPaused(false); }
    }, () => {
      if (speechRunRef.current === runId) { setIsSpeaking(false); setIsSpeechPaused(false); toast.info(`${languages.find(item => item.value === requestedLanguage)?.label ?? requestedLanguage} voice unavailable on this device`); }
    }, speechRunRef, runId);
    if (!started) setIsSpeaking(false);
  }

  const isChatLoading = chatMutation.isPending;
  const greeting = useMemo(() => user?.name ? `Good to see you, ${user.name.split(" ")[0]}.` : "Welcome to Meghdoot.", [user?.name]);

  function setActive(next: typeof activeView) {
    setActiveView(next);
    setSidebarOpen(false);
  }

  function startNewConversation() {
    speechRunRef.current += 1;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    setIsSpeechMuted(false);
    lastSpeechRef.current = null;
    setConversationId(undefined);
    setSelectedConversationId(null);
    setMessages([]);
    setActive("assistant");
  }

  function useLiveLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Live location is not supported in this browser.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      setLocation(current => ({ ...current, lat: latitude, lon: longitude, full: "Resolving your place…" }));
      setLiveCoords({ lat: latitude, lon: longitude });
      setLocationStatus("locating");
      setIsLocating(false);
      toast.success("Live location enabled for this session");
    }, () => {
      setIsLocating(false);
      setLocationStatus("denied");
      toast.error("Location permission was unavailable. Search and select a location to continue.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 });
  }

  async function detectLanguage() {
    if (!composer.trim() || detectLanguageMutation.isPending) return;
    try {
      const result = await detectLanguageMutation.mutateAsync({ text: composer });
      setLanguage(result.language);
      
    } catch {
      toast.error("I could not detect the language. Choose it from settings.");
    }
  }

  function startVoiceInput() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("Voice input is not supported here. Try Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = languages.find(item => item.value === language)?.voice ?? "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
	    recognition.onresult = async (event: any) => {
	      const transcript = Array.from(event.results).map((result: any) => result[0]?.transcript ?? "").join("");
	      setComposer(transcript);
	      if (transcript.trim()) {
	        try {
	          const detected = await detectLanguageMutation.mutateAsync({ text: transcript });
	          setLanguage(detected.language);
	        } catch {
          // Keep the current language if detection is unavailable.
        }
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); toast.error("I could not hear that. Please try again."); };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  async function sendMessage(message = composer) {
    const trimmed = message.trim();
    if (!trimmed || isChatLoading) return;
    speechRunRef.current += 1;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    setIsSpeechMuted(false);
    setActiveView("assistant");
    setComposer("");
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    try {
      // The explicit preference is authoritative. The Detect button can still
      // update this preference, but submitting a prompt must never override it.
      const requestedLanguage = language;
      const result = await chatMutation.mutateAsync({
        conversationId,
        message: trimmed,
        language: requestedLanguage,
        mode,
        location: location.full,
        latitude: location.lat,
        longitude: location.lon,
        history: messages.slice(-12),
      });
      setConversationId(result.conversationId);
      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
      if (speechOutput) startSpeech(result.reply, requestedLanguage);
    } catch (error) {
      setMessages(nextMessages);
      toast.error(error instanceof Error ? error.message : "The assistant could not respond.");
    }
  }

  async function searchManualLocation() {
    if (manualLocationQuery.trim().length < 2 || locationSearchMutation.isPending) return;
    try {
      const results = await locationSearchMutation.mutateAsync({ query: manualLocationQuery.trim() });
      if (!results.length) { toast.error("No verified location was found. Try a district, city, or landmark."); return; }
      const result = results[0];
      const full = result.display_name;
      setLiveCoords(null);
      setLocation({ label: full.split(",")[0] ?? full, full, lat: Number(result.lat), lon: Number(result.lon) });
      setLocationStatus("ready");
      toast.success("Location selected");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Location search failed. Try again."); }
  }

  function savePreferences() {
    profileMutation.mutate({
      language,
      homeLocation: location.full,
      homeLatitude: String(location.lat),
      homeLongitude: String(location.lon),
      speechOutput,
      lowBandwidthMode,
    });
  }

  if (loading) {
    return <div className="app-loading"><div className="loading-orb"><Sparkles className="h-7 w-7" /></div><p>Preparing your rescue workspace…</p></div>;
  }

  if (!user) {
    return <LoginScreen onLogin={() => startLogin()} />;
  }

  if (locationStatus !== "ready" || location.lat === 0 || location.lon === 0) {
    return <LocationSetup status={locationStatus} query={manualLocationQuery} setQuery={setManualLocationQuery} onUseGps={useLiveLocation} onSearch={searchManualLocation} searching={locationSearchMutation.isPending} />;
  }

  return (
    <div className={`app-shell mode-${mode}`}>
      <aside className={`app-sidebar ${sidebarOpen ? "app-sidebar-open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-symbol"><CloudRain className="h-5 w-5" /><span /></div><div><b>Meghdoot</b><small>Weather intelligence</small></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X className="h-4 w-4" /></button></div>
        <div className="sidebar-section"><span className="sidebar-label">Workspace</span><NavButton active={activeView === "overview"} icon={LayoutDashboard} label="Overview" onClick={() => setActive("overview")} /><NavButton active={activeView === "assistant"} icon={Sparkles} label="Ask Meghdoot" onClick={() => setActive("assistant")} /><NavButton active={activeView === "locations"} icon={Bookmark} label="Saved locations" badge={savedLocationsQuery.data?.length} onClick={() => setActive("locations")} /><NavButton active={activeView === "rescue"} icon={ShieldCheck} label="Rescue & geofence" onClick={() => setActive("rescue")} /><NavButton active={activeView === "storms"} icon={Waves} label="Storm watch" onClick={() => setActive("storms")} /></div>
        <ConversationHistory items={conversationsQuery.data ?? []} search={conversationSearch} setSearch={setConversationSearch} onNew={startNewConversation} onOpen={id => setSelectedConversationId(id)} onRename={(id, title) => renameConversationMutation.mutate({ id, title })} onDelete={id => deleteConversationMutation.mutate({ id })} />
        <div className="sidebar-section"><span className="sidebar-label">Your setup</span><NavButton active={activeView === "settings"} icon={Settings} label="Language & speech" onClick={() => setActive("settings")} /><button className="sidebar-help"><CircleHelp className="h-4 w-4" />How this works</button></div>
        <div className="sidebar-footer"><div className="sidebar-status"><span className="status-pulse" />Live weather feeds<br /><small>Open-Meteo · refreshed every 15 min</small></div><div className="user-card"><div className="avatar">{(user.name ?? "U").slice(0, 1).toUpperCase()}</div><div className="min-w-0"><b>{user.name ?? "Weather user"}</b><small>{user.email ?? "Signed in"}</small></div><button title="Sign out" onClick={() => logout()}><LogOut className="h-4 w-4" /></button></div></div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <main className="app-main">
        <header className="workspace-header"><div className="flex items-center gap-3"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></button><div><span className="header-kicker">Personal weather cockpit · {mode} mode</span><h1>{activeView === "overview" ? greeting : activeView === "assistant" ? "Ask Meghdoot" : activeView === "locations" ? "Saved locations" : activeView === "rescue" ? "Rescue & geofence" : activeView === "storms" ? "Cyclone & storm watch" : "Your language & speech"}</h1></div></div><div className="header-actions"><div className="mode-switcher" aria-label="Assistant mode"><span>Mode</span>{(["general", "farmer", "fisherman"] as AssistantMode[]).map(item => <button key={item} className={mode === item ? "mode-active" : ""} onClick={() => setMode(item)}>{item}</button>)}</div><button className="live-location-button" onClick={useLiveLocation} disabled={isLocating}><Navigation className="h-3.5 w-3.5" />{isLocating ? "Locating…" : "Use live GPS"}</button><div className="location-select"><MapPin className="h-4 w-4" /><span title={location.full}>{location.full}</span></div><button className="header-bell" title="No new warnings"><Bell className="h-4 w-4" /><span /></button></div></header>
        <div className="workspace-content">
          {activeView === "overview" && (weatherQuery.isLoading ? <OverviewLoading location={location.full} /> : weatherQuery.isError ? <WeatherUnavailable onRetry={() => weatherQuery.refetch()} /> : <Overview weather={weather} current={current} daily={daily} location={location} languageLabel={languageLabel} speechOutput={speechOutput} onAsk={(prompt) => { setComposer(prompt); setActive("assistant"); }} onSave={() => saveLocationMutation.mutate({ label: location.label, location: location.full, latitude: String(location.lat), longitude: String(location.lon) })} saved={saved || Boolean(savedLocationsQuery.data?.some(item => item.location === location.full))} />)}
          {activeView === "assistant" && <><LanguagePreferenceBar language={language} setLanguage={setLanguage} /><AssistantPanel messages={messages} composer={composer} setComposer={setComposer} onSend={sendMessage} onVoice={startVoiceInput} onDetectLanguage={detectLanguage} detectingLanguage={detectLanguageMutation.isPending} onSpeak={(text) => startSpeech(text, language)} onPauseResume={() => { if (!isSpeaking && !isSpeechPaused) return; if (isSpeechPaused) { window.speechSynthesis?.resume(); setIsSpeechPaused(false); setIsSpeaking(true); } else { window.speechSynthesis?.pause(); setIsSpeechPaused(true); } }} onReplay={() => { const last = lastSpeechRef.current; if (last) startSpeech(last.text, last.language); }} onMuteToggle={() => { if (isSpeechMuted) { const last = lastSpeechRef.current; setIsSpeechMuted(false); if (last) startSpeech(last.text, last.language); } else { setIsSpeechMuted(true); speechRunRef.current += 1; window.speechSynthesis?.cancel(); setIsSpeechPaused(false); setIsSpeaking(false); } }} onStopSpeaking={() => { speechRunRef.current += 1; window.speechSynthesis?.cancel(); setIsSpeechPaused(false); setIsSpeaking(false); }} isListening={isListening} isLoading={isChatLoading} isSpeaking={isSpeaking} isSpeechPaused={isSpeechPaused} isSpeechMuted={isSpeechMuted} hasSpeech={Boolean(lastSpeechRef.current)} location={location.full} languageLabel={languageLabel} mode={mode} /></>}
          {activeView === "locations" && <LocationsPanel items={savedLocationsQuery.data ?? []} onSelect={(item) => { setLiveCoords(null); setLocation({ label: item.label, full: item.location, lat: Number(item.latitude), lon: Number(item.longitude) }); setLocationStatus("ready"); setActive("overview"); }} />}
          {activeView === "rescue" && <RescueMap latitude={location.lat} longitude={location.lon} locationLabel={location.full} />}
          {activeView === "storms" && <CyclonePanel location={location.full} weather={weather} />}
          {activeView === "settings" && <SettingsPanel language={language} setLanguage={setLanguage} speechOutput={speechOutput} setSpeechOutput={setSpeechOutput} lowBandwidthMode={lowBandwidthMode} setLowBandwidthMode={setLowBandwidthMode} onSave={savePreferences} saving={profileMutation.isPending} />}
        </div>
      </main>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return <div className="login-shell"><div className="login-glow login-glow-one" /><div className="login-glow login-glow-two" /><div className="login-card"><div className="login-logo"><CloudRain className="h-7 w-7" /><span /></div><span className="login-eyebrow">SIH 2026 · SIH26068</span><h1>Weather that<br /><em>speaks human.</em></h1><p>Sign in to get a personal weather cockpit with AI answers, local-language voice, live forecasts, and saved places.</p><button className="login-button" onClick={onLogin}>Create your account <span>→</span></button><div className="login-proof"><span><ShieldCheck className="h-4 w-4" /> Source-grounded</span><span><Languages className="h-4 w-4" /> 5 languages</span><span><Volume2 className="h-4 w-4" /> Speech mode</span></div><small className="login-note">Secure sign-in powered by Manus OAuth</small></div></div>;
}

function LocationSetup({ status, query, setQuery, onUseGps, onSearch, searching }: { status: "pending" | "locating" | "ready" | "denied" | "manual"; query: string; setQuery: (value: string) => void; onUseGps: () => void; onSearch: () => void; searching: boolean }) {
  const denied = status === "denied" || status === "manual";
  return <div className="location-setup-shell"><div className="location-setup-card"><div className="login-logo"><MapPin className="h-7 w-7" /><span /></div><span className="login-eyebrow">Meghdoot · trusted location setup</span><h1>{denied ? "Choose a location to continue." : "Let Meghdoot locate you."}</h1><p>Meghdoot uses your current location for local weather, risk analysis, maps, and verified emergency assistance. Your coordinates are the single source of truth for this session.</p><button className="login-button" onClick={onUseGps} disabled={status === "locating"}>{status === "locating" ? "Locating you…" : "Allow live location"}<span>→</span></button><div className="manual-location-form"><label htmlFor="manual-location">Or search manually</label><div><input id="manual-location" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSearch(); }} placeholder="City, district, village, or landmark" /><button onClick={onSearch} disabled={searching || query.trim().length < 2}>{searching ? "Searching…" : "Search"}</button></div></div>{status === "locating" && <p className="location-setup-status">Waiting for browser permission and reverse geocoding…</p>}{denied && <p className="location-setup-status">Location permission was denied or unavailable. Select a verified search result instead of using a default city.</p>}</div></div>;
}

function NavButton({ active, icon: Icon, label, badge, onClick }: { active: boolean; icon: typeof LayoutDashboard; label: string; badge?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? "nav-button-active" : ""}`} onClick={onClick}><Icon className="h-[17px] w-[17px]" /><span>{label}</span>{badge ? <span className="nav-badge">{badge}</span> : null}</button>;
}

function CyclonePanel({ location, weather }: { location: string; weather: WeatherPayload }) {
  const daily = weather.daily;
  const riskValues = (daily?.precipitation_probability_max ?? []).slice(0, 5);
  return <div className="storm-watch-panel"><div className="storm-watch-hero"><div><span className="panel-kicker">Regional verified signals</span><h2>Cyclone & storm watch</h2><p>There is no verified cyclone-track feed configured in this project. This panel shows forecast rain risk only and never presents it as a cyclone track.</p></div><div className="storm-orb"><Waves className="h-8 w-8" /></div></div><div className="storm-empty" role="status"><ShieldCheck className="h-6 w-6" /><div><b>No active cyclone track is available for {location}.</b><small>Follow official IMD and local disaster-management warnings for authoritative cyclone alerts.</small></div></div><section className="risk-chart-card"><div className="panel-heading"><div><span className="panel-kicker">Forecast signal</span><h2>Five-day rain-risk profile</h2></div><span className="source-tag">Open-Meteo · not a cyclone track</span></div><div className="risk-chart" aria-label="Five-day rain-risk bar chart">{riskValues.length ? riskValues.map((value, index) => <div className="risk-bar-wrap" key={`${daily?.time?.[index] ?? index}`} title={`${value}% rain probability`}><div className={`risk-bar risk-${value >= 70 ? "high" : value >= 40 ? "medium" : "low"}`} style={{ height: `${Math.max(8, value)}%` }}><span>{value}%</span></div><small>{daily?.time?.[index] ? dayName(daily.time[index], index) : `Day ${index + 1}`}</small></div>) : <p className="timeline-unavailable">Verified daily risk data unavailable.</p>}</div></section><div className="storm-source-row"><span>Safety source policy</span><a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">Open official IMD weather portal ↗</a></div></div>;
}

function OverviewLoading({ location }: { location: string }) {
  return <div className="overview-state-card" role="status"><div className="loading-orb"><CloudSun className="h-7 w-7" /></div><span className="panel-kicker">Weather intelligence</span><h2>Fetching conditions for {location}</h2><p>Meghdoot is loading current conditions, forecast windows, and local risk signals.</p><div className="overview-skeleton-grid"><span /><span /><span /></div></div>;
}

function WeatherUnavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="overview-state-card" role="alert"><div className="insight-icon"><CloudRain className="h-5 w-5" /></div><span className="panel-kicker">Weather feed unavailable</span><h2>We could not load verified conditions.</h2><p>Your location is still preserved. Retry the live feed or ask Meghdoot after the provider is available.</p><button className="primary-button" onClick={onRetry}>Retry weather feed</button></div>;
}

function HourlyTimeline({ hourly }: { hourly?: WeatherPayload["hourly"] }) {
  const points = (hourly?.time ?? []).slice(0, 8);
  if (!points.length) return <div className="timeline-unavailable">Hourly verified forecast unavailable.</div>;
  return <div className="hourly-timeline" aria-label="Hourly temperature timeline">{points.map((time, index) => <div className={`hour-point ${index === 0 ? "hour-point-now" : ""}`} key={`${time}-${index}`}><span>{index === 0 ? "Now" : new Intl.DateTimeFormat("en", { hour: "numeric" }).format(new Date(time))}</span><div className="hour-dot">{weatherIcon(hourly?.weather_code?.[index], "h-4 w-4")}</div><strong>{hourly?.temperature_2m?.[index] == null ? "—" : `${Math.round(hourly.temperature_2m[index])}°`}</strong><small>{hourly?.precipitation_probability?.[index] == null ? "—" : `${hourly.precipitation_probability[index]}% rain`}</small><em>{hourly?.wind_speed_10m?.[index] == null ? "—" : `${Math.round(hourly.wind_speed_10m[index])} km/h`}</em></div>)}</div>;
}

function Overview({ weather, current, daily, location, languageLabel, speechOutput, onAsk, onSave, saved }: { weather: WeatherPayload; current?: WeatherPayload["current"]; daily?: WeatherPayload["daily"]; location: LocationState; languageLabel: string; speechOutput: boolean; onAsk: (prompt: string) => void; onSave: () => void; saved: boolean }) {
  return <div className="overview-grid scroll-scene"><section className="welcome-row"><div><span className="live-chip"><span /> Live conditions</span><p className="welcome-copy">Your weather, translated into a decision.</p></div><div className="welcome-actions"><button className="secondary-button" onClick={onSave}>{saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{saved ? "Saved" : "Save location"}</button><button className="primary-button" onClick={() => onAsk("What should I know about the next 6 hours?")}><Sparkles className="h-4 w-4" /> Ask Meghdoot</button></div></section><section className="weather-hero-card"><div className="weather-hero-left"><div className="eyebrow-dark"><MapPin className="h-3.5 w-3.5" /> {location.full}</div><div className="temperature-row"><span>{current?.temperature_2m == null ? "—" : Math.round(current.temperature_2m)}°</span><div><strong>C</strong><small>Feels like {current?.apparent_temperature == null ? "—" : Math.round(current.apparent_temperature)}°</small></div></div><div className="weather-description">{weatherLabel(current?.weather_code)} <span>·</span> Updated from verified feed</div></div><div className="weather-hero-icon">{weatherIcon(current?.weather_code, "h-16 w-16")}</div><div className="weather-metrics"><Metric label="Rain chance" value={daily?.precipitation_probability_max?.[0] == null ? "Verified data unavailable" : `${daily.precipitation_probability_max[0]}%`} icon={CloudRain} tone="cyan" /><Metric label="Wind" value={current?.wind_speed_10m == null ? "Verified data unavailable" : `${Math.round(current.wind_speed_10m)} km/h`} icon={Wind} tone="amber" /><Metric label="Humidity" value={current?.relative_humidity_2m == null ? "Verified data unavailable" : `${Math.round(current.relative_humidity_2m)}%`} icon={Waves} tone="violet" /></div></section><section className="insight-card"><div className="insight-icon"><Sparkles className="h-5 w-5" /></div><div className="flex-1"><div className="insight-title">Decision insight <span>AI-assisted</span></div><p>{daily?.precipitation_probability_max?.[0] == null ? "Verified rain probability is unavailable right now." : `Rain probability is ${daily.precipitation_probability_max[0]}% today. Plan activities around the verified forecast window.`}</p><div className="insight-foot"><span><ShieldCheck className="h-3.5 w-3.5" /> Based on current + forecast data</span><button onClick={() => onAsk("Explain today's rain risk and what I should do.")}>Ask why <span>→</span></button></div></div></section><section className="hourly-panel"><div className="panel-heading"><div><span className="panel-kicker">Next six hours</span><h2>Temperature timeline</h2></div><span className="source-tag">Hourly feed</span></div><HourlyTimeline hourly={weather.hourly} /></section><section className="forecast-panel"><div className="panel-heading"><div><span className="panel-kicker">Next five days</span><h2>Forecast at a glance</h2></div><span className="source-tag">Open-Meteo feed</span></div><div className="forecast-row">{(daily?.time ?? []).slice(0, 5).map((date, index) => <div className={`forecast-day ${index === 0 ? "forecast-day-active" : ""}`} key={date}><span>{dayName(date, index)}</span><div className="forecast-icon">{weatherIcon(daily?.weather_code?.[index])}</div><strong>{daily?.temperature_2m_max?.[index] == null ? "—" : Math.round(daily.temperature_2m_max[index])}°</strong><small>{daily?.temperature_2m_min?.[index] == null ? "—" : Math.round(daily.temperature_2m_min[index])}°</small><em>{daily?.precipitation_probability_max?.[index] == null ? "—" : `${daily.precipitation_probability_max[index]}% rain`}</em></div>)}</div></section><section className="quick-panel"><div className="panel-heading"><div><span className="panel-kicker">Ask in {languageLabel}</span><h2>Start with a real question</h2></div><button className="icon-button" onClick={() => onAsk("Explain this forecast in simple language.")}><ArrowIcon /></button></div><div className="prompt-grid">{suggestedPrompts.slice(0, 4).map(prompt => <button key={prompt} onClick={() => onAsk(prompt)}>{prompt}<span>↗</span></button>)}</div><div className="speech-status"><div className="speech-status-icon">{speechOutput ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</div><span>Speech output is <b>{speechOutput ? "on" : "off"}</b> for your account</span><span className="speech-status-dot" /></div></section></div>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof CloudRain; tone: string }) { return <div className="metric"><span className={`metric-icon metric-${tone}`}><Icon className="h-4 w-4" /></span><div><small>{label}</small><b>{value}</b></div></div>; }
function ArrowIcon() { return <span className="text-lg">↗</span>; }

function AssistantPanel({ messages, composer, setComposer, onSend, onVoice, onDetectLanguage, detectingLanguage, onSpeak, onPauseResume, onReplay, onStopSpeaking, onMuteToggle, isListening, isLoading, isSpeaking, isSpeechPaused, isSpeechMuted, hasSpeech, location, languageLabel, mode }: { messages: ChatMessage[]; composer: string; setComposer: (value: string) => void; onSend: (message?: string) => void; onVoice: () => void; onDetectLanguage: () => void; detectingLanguage: boolean; onSpeak: (text: string) => void; onPauseResume: () => void; onReplay: () => void; onStopSpeaking: () => void; onMuteToggle: () => void; isListening: boolean; isLoading: boolean; isSpeaking: boolean; isSpeechPaused: boolean; isSpeechMuted: boolean; hasSpeech: boolean; location: string; languageLabel: string; mode: AssistantMode }) {
  return <div className="assistant-layout"><div className="assistant-main"><div className="assistant-toolbar"><div><span className="live-chip"><span /> Meghdoot AI</span><h2>Ask anything about <em>{location}</em></h2></div><div className="assistant-context" aria-label="Assistant context"><span className="context-badge context-language"><Globe2 className="h-4 w-4" />{languageLabel}</span><span className="context-badge context-mode"><Sparkles className="h-4 w-4" />{mode} mode</span><span className="context-badge context-location"><MapPin className="h-4 w-4" />Live location</span></div></div><div className="conversation-window">{messages.length === 0 ? <div className="empty-conversation"><div className="empty-bot"><Bot className="h-8 w-8" /></div><h3>What do you want to know?</h3><p>Ask naturally. Meghdoot AI retrieves live conditions, explains uncertainty, and gives you a bounded next action.</p><div className="empty-prompts">{suggestedPrompts.map(prompt => <button key={prompt} onClick={() => onSend(prompt)}>{prompt}<span>↗</span></button>)}</div></div> : <div className="message-list">{messages.map((message, index) => <div className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`} key={`${message.role}-${index}`}>{message.role === "assistant" && <div className="message-avatar"><Sparkles className="h-4 w-4" /></div>}<div className="message-bubble"><p>{message.content}</p>{message.role === "assistant" && <div className="message-actions"><span><ShieldCheck className="h-3 w-3" /> Source-grounded</span>{index === messages.length - 1 && <div className="speech-actions" aria-label="Text to speech controls">{!isSpeaking && !isSpeechPaused && <button onClick={() => onSpeak(message.content)}><Play className="h-3 w-3" /> Speak</button>}{isSpeaking && !isSpeechPaused && <button onClick={onPauseResume}><Pause className="h-3 w-3" /> Pause</button>}{isSpeechPaused && <button onClick={onPauseResume}><Play className="h-3 w-3" /> Resume</button>}{(isSpeaking || isSpeechPaused || hasSpeech) && <button onClick={onReplay}><RotateCcw className="h-3 w-3" /> Replay</button>}{(isSpeaking || isSpeechPaused || hasSpeech) && <button onClick={onMuteToggle}><VolumeX className="h-3 w-3" /> {isSpeechMuted ? "Unmute" : "Mute"}</button>}</div>}</div>}</div>{message.role === "user" && <div className="message-user-mark">You</div>}</div>)}{isLoading && <div className="message-row message-assistant"><div className="message-avatar"><Sparkles className="h-4 w-4" /></div><div className="message-bubble typing"><span /><span /><span /></div></div>}</div>}</div><div className="composer-wrap"><div className="composer"><button className="composer-detect" title="Detect language" onClick={onDetectLanguage} disabled={!composer.trim() || detectingLanguage}><Languages className="h-4 w-4" />{detectingLanguage ? "…" : "Detect"}</button><textarea value={composer} onChange={event => setComposer(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Ask about rain, wind, heat, crops, routes…" rows={1} /><button className={`composer-icon ${isListening ? "composer-listening" : ""}`} title={isListening ? "Stop listening" : "Voice input"} onClick={onVoice}>{isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button><button className="composer-send" onClick={() => onSend()} disabled={!composer.trim() || isLoading}><Send className="h-4 w-4" /></button></div><div className="composer-foot"><span><ShieldCheck className="h-3.5 w-3.5" /> Meghdoot can make mistakes. Follow official warnings.</span><span>Enter to send · Shift + Enter for a new line</span>{isSpeaking && <><button className="speech-control-button" onClick={onPauseResume}>{isSpeechPaused ? "Resume" : "Pause"}</button><button className="speech-control-button" onClick={onReplay}>Replay</button><button className="stop-speaking-button" onClick={onStopSpeaking}><VolumeX className="h-3.5 w-3.5" /> Stop</button></>}</div></div></div><aside className="assistant-side"><div className="side-card"><div className="side-card-heading"><Activity className="h-4 w-4 text-cyan-300" /><span>Live context</span></div><div className="context-item"><span>Location</span><b>{location}</b></div><div className="context-item"><span>Language</span><b>{languageLabel}</b></div><div className="context-item"><span>Data freshness</span><b className="fresh"><i /> Just now</b></div></div><div className="side-card"><div className="side-card-heading"><Bot className="h-4 w-4 text-violet-300" /><span>What I can do</span></div><ul className="capability-list"><li><Check /> Explain current weather</li><li><Check /> Compare forecast windows</li><li><Check /> Create practical advisories</li><li><Check /> Speak answers aloud</li><li><Check /> Respond in your language</li></ul></div></aside></div>;
}

function LanguagePreferenceBar({ language, setLanguage }: { language: string; setLanguage: (value: string) => void }) {
  const selected = languages.find(item => item.value === language);
  return <section className="language-preference-bar" aria-label="AI response language preference"><div className="language-preference-copy"><Languages className="h-4 w-4" /><div><b>Response language</b><small>Choose the language Meghdoot must use for text and speech.</small></div></div><select value={language} onChange={event => setLanguage(event.target.value)} aria-label="Choose response language">{languages.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="language-preference-current">{selected?.label ?? "English"}</span></section>;
}

function LocationsPanel({ items, onSelect }: { items: Array<{ id: number; label: string; location: string; latitude: string; longitude: string }>; onSelect: (item: any) => void }) { return <div className="settings-layout"><div className="settings-main"><span className="panel-kicker">Your places</span><h2 className="page-title">Locations that matter to you.</h2><p className="page-subtitle">Keep farms, routes, villages, or districts close at hand.</p>{items.length === 0 ? <div className="empty-location"><Bookmark className="h-6 w-6" /><p>No saved locations yet.</p><small>Save a location from the Overview page to see it here.</small></div> : <div className="location-list">{items.map(item => <button className="location-row" key={item.id} onClick={() => onSelect(item)}><span className="location-pin"><MapPin className="h-4 w-4" /></span><span><b>{item.label}</b><small>{item.location}</small></span><span className="location-arrow">→</span></button>)}</div>}</div><div className="settings-aside"><div className="side-card"><div className="side-card-heading"><ShieldCheck className="h-4 w-4 text-cyan-300" /><span>Why save locations?</span></div><p className="side-copy">Meghdoot can personalize answers around the places where your decisions happen—without making you repeat context every time.</p></div></div></div>; }

function SettingsPanel({ language, setLanguage, speechOutput, setSpeechOutput, lowBandwidthMode, setLowBandwidthMode, onSave, saving }: { language: string; setLanguage: (value: string) => void; speechOutput: boolean; setSpeechOutput: (value: boolean) => void; lowBandwidthMode: boolean; setLowBandwidthMode: (value: boolean) => void; onSave: () => void; saving: boolean }) { return <div className="settings-layout"><div className="settings-main"><span className="panel-kicker">Personalization</span><h2 className="page-title">Make Meghdoot yours.</h2><p className="page-subtitle">Choose how you want weather intelligence to sound and arrive.</p><div className="preference-card"><div className="preference-heading"><Languages className="h-5 w-5 text-cyan-300" /><div><b>Response language</b><span>AI answers and speech output will use this language.</span></div></div><div className="language-grid">{languages.map(item => <button key={item.value} className={`language-option ${language === item.value ? "language-selected" : ""}`} onClick={() => setLanguage(item.value)}><span>{item.label}</span>{language === item.value && <Check className="h-4 w-4" />}</button>)}</div></div><div className="preference-card"><div className="preference-heading"><Volume2 className="h-5 w-5 text-amber-200" /><div><b>Speech output</b><span>Automatically speak every AI answer after it arrives.</span></div><button className={`toggle ${speechOutput ? "toggle-on" : ""}`} onClick={() => setSpeechOutput(!speechOutput)}><span /></button></div><div className="preference-heading preference-heading-second"><Waves className="h-5 w-5 text-violet-300" /><div><b>Low-connectivity mode</b><span>Prefer compact responses and cached-friendly content.</span></div><button className={`toggle ${lowBandwidthMode ? "toggle-on" : ""}`} onClick={() => setLowBandwidthMode(!lowBandwidthMode)}><span /></button></div></div><button className="primary-button save-preferences" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save preferences"} <Check className="h-4 w-4" /></button></div><div className="settings-aside"><div className="side-card"><div className="side-card-heading"><ShieldCheck className="h-4 w-4 text-lime-300" /><span>Responsible by default</span></div><p className="side-copy">Official warnings stay above AI-generated summaries. We show uncertainty instead of hiding it.</p></div></div></div>; }

function ConversationHistory({ items, search, setSearch, onNew, onOpen, onRename, onDelete }: { items: Array<{ id: number; title: string; updatedAt: Date | string }>; search: string; setSearch: (value: string) => void; onNew: () => void; onOpen: (id: number) => void; onRename: (id: number, title: string) => void; onDelete: (id: number) => void }) {
  const filtered = items.filter(item => item.title.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
  return <div className="conversation-history sidebar-section"><div className="sidebar-history-heading"><span className="sidebar-label">Chat history</span><button title="New conversation" onClick={onNew}><Plus className="h-3.5 w-3.5" /></button></div><input className="history-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search chats…" aria-label="Search chat history" />{filtered.length === 0 ? <small className="history-empty">No saved conversations yet.</small> : <div className="history-list">{filtered.map(item => <div className="history-item" key={item.id}><button className="history-open" onClick={() => onOpen(item.id)}><b>{item.title}</b><small>{new Date(item.updatedAt).toLocaleDateString()}</small></button><div className="history-actions"><button title="Rename" onClick={() => { const title = window.prompt("Rename conversation", item.title); if (title?.trim()) onRename(item.id, title); }}>✎</button><button title="Delete" onClick={() => { if (window.confirm("Delete this conversation?")) onDelete(item.id); }}>×</button></div></div>)}</div>}</div>;
}
