"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";
import { transcribe, type Engine, type Keys } from "./lib/transcribe";
import { BUILTIN_GEMINI_KEY, BUILTIN_CLAUDE_KEY } from "./config";

interface Page {
  id: string;
  imageUrl: string;
  filename: string;
  transcription: string;
  status: "idle" | "loading" | "done" | "error";
}

const ENGINES: { id: Engine; label: string; hint: string }[] = [
  { id: "gemini", label: "Gemini 2.5 Flash", hint: "darmowy · 250/dzień" },
  { id: "claude", label: "Claude Sonnet", hint: "premium · ~5 gr/str" },
  { id: "ollama", label: "Ollama (lokalnie)", hint: "offline · M4" },
];

// Wbudowane klucze z app/config.ts — pozwalają udostępnić aplikację
// innym bez wpisywania klucza.
const BUILTIN_GEMINI = BUILTIN_GEMINI_KEY;

const DEFAULT_KEYS: Keys = {
  gemini: BUILTIN_GEMINI_KEY,
  claude: BUILTIN_CLAUDE_KEY,
  ollamaHost: "http://localhost:11434",
  ollamaModel: "qwen2.5vl:7b",
};

const STORAGE_KEY = "handscript_keys";

export default function Home() {
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [engine, setEngine] = useState<Engine>("gemini");
  const [keys, setKeys] = useState<Keys>(DEFAULT_KEYS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"image" | "text">("image");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wczytaj klucze z localStorage przy starcie
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...DEFAULT_KEYS, ...parsed };
        // Pusty zapis nie może skasować wbudowanego klucza
        if (!merged.gemini) merged.gemini = BUILTIN_GEMINI;
        setKeys(merged);
      }
    } catch {}
  }, []);

  const saveKeys = useCallback((next: Keys) => {
    setKeys(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    const newPages: Page[] = arr.map((f) => ({
      id: crypto.randomUUID(),
      imageUrl: URL.createObjectURL(f),
      filename: f.name,
      transcription: "",
      status: "idle",
    }));
    setPages((prev) => [...prev, ...newPages]);
    setSelectedId(newPages[0].id);
    setMobileView("image");
  }, []);

  const transcribePage = useCallback(async (page: Page) => {
    setPages((prev) =>
      prev.map((p) => (p.id === page.id ? { ...p, status: "loading" } : p))
    );

    try {
      const base64 = await toBase64(page.imageUrl);
      const text = await transcribe(base64, engine, keys);
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, transcription: text, status: "done" } : p
        )
      );
    } catch {
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id
            ? { ...p, transcription: "[Błąd połączenia]", status: "error" }
            : p
        )
      );
    }
  }, [engine, keys]);

  const transcribeAll = useCallback(async () => {
    const todo = pages.filter((p) => p.status === "idle" || p.status === "error");
    for (const p of todo) await transcribePage(p);
  }, [pages, transcribePage]);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 15;
    const lineHeight = 7;
    const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    pages.forEach((page, i) => {
      if (i > 0) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Strona ${i + 1}: ${page.filename}`, margin, y);
      y += lineHeight;
      doc.setDrawColor(200);
      doc.line(margin, y, margin + pageWidth, y);
      y += lineHeight;
      doc.setFontSize(11);
      doc.setTextColor(20);

      const lines = doc.splitTextToSize(page.transcription || "(brak transkrypcji)", pageWidth);
      for (const line of lines) {
        if (y + lineHeight > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
    });

    doc.save("transkrypcja.pdf");
  }, [pages]);

  const selectedPage = pages.find((p) => p.id === selectedId) ?? null;
  const missingKey =
    (engine === "gemini" && !keys.gemini) || (engine === "claude" && !keys.claude);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="border-b border-zinc-800 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">HandScript</h1>
          <p className="hidden sm:block text-xs text-zinc-500 mt-0.5">Transkrypcja pisma odręcznego · Claude Vision</p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 items-center flex-1 sm:flex-none justify-end">
          <button
            onClick={transcribeAll}
            disabled={pages.length === 0 || pages.every((p) => p.status === "done" || p.status === "loading")}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
          >
            <span className="hidden sm:inline">Transkrybuj wszystkie</span>
            <span className="sm:hidden">Wszystkie</span>
          </button>
          <button
            onClick={exportPDF}
            disabled={pages.length === 0}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
          >
            PDF
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="relative px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors shrink-0"
            title="Ustawienia kluczy API"
          >
            ⚙︎
            {missingKey && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-zinc-950" />
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        {/* Pasek miniatur: poziomy na mobile, pionowy na desktopie */}
        <aside className="flex md:flex-col md:w-56 border-b md:border-b-0 md:border-r border-zinc-800 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto shrink-0">
          <div
            className={`m-2 md:m-3 shrink-0 w-28 md:w-auto flex items-center justify-center border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
              dragging ? "border-indigo-500 bg-indigo-950/30" : "border-zinc-700 hover:border-zinc-500"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <p className="text-xs text-zinc-400">+ Dodaj<span className="hidden md:inline"> obrazy</span></p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />

          <div className="flex md:flex-col md:flex-1 md:overflow-y-auto gap-1 p-2 md:px-2">
            {pages.map((page, i) => (
              <button
                key={page.id}
                onClick={() => setSelectedId(page.id)}
                className={`shrink-0 w-28 md:w-full text-left rounded-lg overflow-hidden border transition-colors ${
                  selectedId === page.id
                    ? "border-indigo-500 bg-zinc-800"
                    : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.imageUrl} alt="" className="w-full h-16 md:h-24 object-cover" />
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs text-zinc-400 truncate">Str. {i + 1}</span>
                  <StatusDot status={page.status} />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {selectedPage ? (
            <>
              {/* Przełącznik widoku (tylko mobile) */}
              <div className="md:hidden flex border-b border-zinc-800 shrink-0">
                <button
                  onClick={() => setMobileView("image")}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileView === "image" ? "text-indigo-400 border-b-2 border-indigo-500" : "text-zinc-500"
                  }`}
                >
                  Obraz
                </button>
                <button
                  onClick={() => setMobileView("text")}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileView === "text" ? "text-indigo-400 border-b-2 border-indigo-500" : "text-zinc-500"
                  }`}
                >
                  Tekst
                </button>
              </div>

              <div
                className={`${mobileView === "image" ? "flex" : "hidden"} md:flex flex-1 bg-zinc-900 overflow-auto items-start justify-center p-3 sm:p-6 min-h-0`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedPage.imageUrl} alt="Strona" className="max-w-full shadow-2xl rounded" />
              </div>

              <div
                className={`${mobileView === "text" ? "flex" : "hidden"} md:flex w-full md:w-96 border-t md:border-t-0 md:border-l border-zinc-800 flex-col min-h-0 flex-1 md:flex-none`}
              >
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
                  <span className="text-sm font-medium">Transkrypcja</span>
                  <button
                    onClick={() => transcribePage(selectedPage)}
                    disabled={selectedPage.status === "loading"}
                    className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-md transition-colors"
                  >
                    {selectedPage.status === "loading" ? "Analizuję…" : "Transkrybuj"}
                  </button>
                </div>

                {selectedPage.status === "loading" ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-zinc-500">Czytam pismo…</p>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="flex-1 bg-transparent resize-none p-4 text-sm leading-relaxed text-zinc-200 focus:outline-none placeholder:text-zinc-600 font-mono"
                    placeholder={'Kliknij "Transkrybuj" aby rozpoznac pismo...'}
                    value={selectedPage.transcription}
                    onChange={(e) =>
                      setPages((prev) =>
                        prev.map((p) =>
                          p.id === selectedPage.id ? { ...p, transcription: e.target.value } : p
                        )
                      )
                    }
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 p-6">
              <div className="text-center space-y-2">
                <p className="text-4xl">✍️</p>
                <p className="text-sm">Dodaj obrazy z pismem odręcznym</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {settingsOpen && (
        <SettingsModal
          keys={keys}
          engine={engine}
          onEngineChange={setEngine}
          onSave={saveKeys}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({
  keys,
  engine,
  onEngineChange,
  onSave,
  onClose,
}: {
  keys: Keys;
  engine: Engine;
  onEngineChange: (e: Engine) => void;
  onSave: (k: Keys) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Keys>(keys);
  const set = (k: keyof Keys, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-5 sm:p-6 space-y-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Ustawienia · Klucze API</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Klucze są przechowywane tylko w Twojej przeglądarce (localStorage) i
            wysyłane wyłącznie do wybranego silnika. Nigdy nie trafiają do repo.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Silnik transkrypcji</label>
          <div className="grid grid-cols-1 gap-1.5">
            {ENGINES.map((e) => (
              <button
                key={e.id}
                onClick={() => onEngineChange(e.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                  engine === e.id
                    ? "border-indigo-500 bg-indigo-950/40"
                    : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
                }`}
              >
                <span className="text-sm">{e.label}</span>
                <span className="text-xs text-zinc-500">{e.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Gemini API key</label>
          <input
            type="password"
            value={draft.gemini}
            onChange={(e) => set("gemini", e.target.value)}
            placeholder="AIza..."
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-indigo-500"
          />
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 hover:underline"
          >
            Pobierz darmowy klucz →
          </a>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Claude (Anthropic) API key</label>
          <input
            type="password"
            value={draft.claude}
            onChange={(e) => set("claude", e.target.value)}
            placeholder="sk-ant-..."
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-indigo-500"
          />
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 hover:underline"
          >
            Pobierz klucz →
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Ollama host</label>
            <input
              value={draft.ollamaHost}
              onChange={(e) => set("ollamaHost", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Ollama model</label>
            <input
              value={draft.ollamaModel}
              onChange={(e) => set("ollamaModel", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Page["status"] }) {
  const cls =
    status === "done" ? "bg-emerald-500" :
    status === "loading" ? "bg-yellow-400 animate-pulse" :
    status === "error" ? "bg-red-500" : "bg-zinc-600";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />;
}

async function toBase64(objectUrl: string): Promise<string> {
  const res = await fetch(objectUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
