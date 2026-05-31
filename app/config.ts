// ┌─────────────────────────────────────────────────────────────┐
// │  WBUDOWANY KLUCZ GEMINI                                       │
// │  Wklej tutaj swój klucz między cudzysłowami.                  │
// │  Każdy odwiedzający stronę będzie mógł transkrybować bez      │
// │  wpisywania własnego klucza.                                  │
// │                                                               │
// │  ⚠️ UWAGA: jeśli repo jest PUBLICZNE, klucz jest widoczny dla │
// │  wszystkich, a Google może go automatycznie unieważnić.      │
// │  Użyj klucza BEZ płatnego billingu i najlepiej z restrykcją  │
// │  HTTP referrer na Twoją domenę.                              │
// └─────────────────────────────────────────────────────────────┘

// Pusty w kodzie — prawdziwy klucz wstrzykiwany z GitHub Secret przy buildzie
// (zmienna NEXT_PUBLIC_GEMINI_KEY). Dzięki temu nie trafia do publicznego repo
// i Google go nie unieważnia.
export const BUILTIN_GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_KEY ?? "";

// Opcjonalnie: wbudowany klucz Claude (zostaw pusty jeśli nie używasz)
export const BUILTIN_CLAUDE_KEY = "";
