// Klient-side transkrypcja — wszystko leci bezpośrednio z przeglądarki.
// Dzięki temu aplikacja jest w pełni statyczna (GitHub Pages, bez serwera).

export type Engine = "gemini" | "claude" | "ollama";

export interface Keys {
  gemini: string;
  claude: string;
  ollamaHost: string;
  ollamaModel: string;
}

export const PROMPT = `Transkrybuj dokładnie całe pismo odręczne widoczne na tym obrazie.
Zasady:
- Zachowaj oryginalny układ akapitów i podziały wierszy
- Jeśli jakieś słowo jest nieczytelne, wstaw [?] i spróbuj podać najbardziej prawdopodobną wersję w nawiasie
- Nie dodawaj żadnych komentarzy ani wyjaśnień — tylko sam tekst
- Jeśli widoczne są liczby, daty, przekreślenia — uwzględnij je
- Tekst jest po polsku, zadbaj o poprawne polskie znaki (ą, ć, ę, ł, ń, ó, ś, ż, ź)
- Odpowiedz wyłącznie transkrypcją`;

function parseImage(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mediaType: m[1], data: m[2] } : null;
}

async function gemini(image: string, keys: Keys): Promise<string> {
  const p = parseImage(image);
  if (!p) return "[Błąd: nieprawidłowy format obrazu]";
  if (!keys.gemini) return "[Brak klucza Gemini — dodaj go w Ustawieniach]";

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": keys.gemini,
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
