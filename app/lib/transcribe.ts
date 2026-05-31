// Klient-side transkrypcja — wszystko leci bezpośrednio z przeglądarki.
// Dzięki temu aplikacja jest w pełni statyczna (GitHub Pages, bez serwera).

export type Engine = "gemini" | "claude" | "ollama";

export interface Keys {
  gemini: string;
  claude: string;
  ollamaHost: string;
  ollamaModel: string;
}

export const PROMPT = `Jesteś ekspertem paleografem specjalizującym się w odczytywaniu trudnego, nieczytelnego pisma odręcznego po polsku.

Przeanalizuj obraz BARDZO uważnie, litera po literze. Pracuj metodycznie:
1. Najpierw rozpoznaj ogólny charakter pisma i kontekst (o czym jest tekst).
2. Odczytuj słowo po słowie. Przy trudnych słowach analizuj kształt każdej litery, łączenia, i używaj kontekstu zdania oraz zasad polskiej gramatyki, by ustalić najbardziej prawdopodobne słowo.
3. Wykorzystuj sens całości — jeśli słowo pasuje logicznie do zdania, to prawdopodobnie ono.

Zasady wyniku:
- Zachowaj oryginalny układ akapitów i podziały wierszy
- Tekst jest po polsku — zadbaj o poprawne polskie znaki (ą, ć, ę, ł, ń, ó, ś, ż, ź) i poprawną gramatykę
- Uwzględnij liczby, daty, przekreślenia
- Tylko jeśli słowo jest naprawdę niemożliwe do odczytania, oznacz je [?]
- Nie dodawaj żadnych komentarzy, nagłówków ani wyjaśnień — zwróć WYŁĄCZNIE samą transkrypcję tekstu`;

function parseImage(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mediaType: m[1], data: m[2] } : null;
}

async function gemini(image: string, keys: Keys): Promise<string> {
  const p = parseImage(image);
  if (!p) return "[Błąd: nieprawidłowy format obrazu]";
  if (!keys.gemini) return "[Brak klucza Gemini — dodaj go w Ustawieniach]";

  // Klucz w query param (nie w nagłówku) — unika CORS preflight w przeglądarce.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      keys.gemini
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: p.mediaType, data: p.data } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0, // maksymalna wierność, bez zgadywania na chybił trafił
          // Pełne "myślenie" modelu — wyraźnie poprawia trudne pismo
          thinkingConfig: { thinkingBudget: 8192 },
        },
      }),
    }
  );
  if (!res.ok) return `[Błąd Gemini: ${res.status} ${await res.text()}]`;
  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[Brak odpowiedzi Gemini]"
  );
}

async function claude(image: string, keys: Keys): Promise<string> {
  const p = parseImage(image);
  if (!p) return "[Błąd: nieprawidłowy format obrazu]";
  if (!keys.claude) return "[Brak klucza Claude — dodaj go w Ustawieniach]";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": keys.claude,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: p.mediaType, data: p.data },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return `[Błąd Claude: ${res.status} ${await res.text()}]`;
  const data = await res.json();
  return data?.content?.[0]?.text ?? "[Brak odpowiedzi Claude]";
}

async function ollama(image: string, keys: Keys): Promise<string> {
  const p = parseImage(image);
  if (!p) return "[Błąd: nieprawidłowy format obrazu]";
  const host = keys.ollamaHost || "http://localhost:11434";
  const model = keys.ollamaModel || "qwen2.5vl:7b";

  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: PROMPT, images: [p.data], stream: false }),
  });
  if (!res.ok) return `[Błąd Ollama: ${res.status}]`;
  const data = await res.json();
  return data?.response ?? "[Brak odpowiedzi Ollama]";
}

export async function transcribe(
  image: string,
  engine: Engine,
  keys: Keys
): Promise<string> {
  try {
    if (engine === "claude") return await claude(image, keys);
    if (engine === "ollama") return await ollama(image, keys);
    return await gemini(image, keys);
  } catch (e) {
    return `[Błąd połączenia: ${e instanceof Error ? e.message : "nieznany"}]`;
  }
}
