"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";
import { transcribe, type Engine, type Keys } from "./lib/transcribe";

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

const DEFAULT_KEYS: Keys = {
  gemini: "",
  claude: "",
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wczytaj klucze z localStorage przy starcie
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setKeys({ ...DEFAULT_KEYS, ...JSON.parse(saved) });
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HandScript</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Transkrypcja pisma odręcznego · Claude Vision</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as Engine)}
            className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
            title={ENGINES.find((e) => e.id === engine)?.hint}
          >
            {ENGINES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} — {e.hint}
              </option>
            ))}
          </select>
          <button
            onClick={transcribeAll}
            disabled={pages.length === 0 || pages.every((p) => p.status === "done" || p.status === "loading")}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Transkrybuj wszystkie
          </button>
          <button
            onClick={exportPDF}
            disabled={pages.length === 0}
            className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Pobierz PDF
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="relative px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
            title="Ustawienia kluczy API"
          >
            ⚙︎
            {missingKey && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-zinc-950" />
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 65px)" }}>
        <aside className="w-56 border-r border-zinc-800 flex flex-col overflow-y-auto">
          <div
            className={`m-3 border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
              dragging ? "border-indigo-500 bg-indigo-950/30" : "border-zinc-700 hover:border-zinc-500"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <p className="text-xs text-zinc-400">Przeciągnij obrazy<br />lub kliknij</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />

          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {pages.map((page, i) => (
              <button
                key={page.id}
                onClick={() => setSelectedId(page.id)}
                className={`w-full text-left rounded-lg overflow-hidden border transition-colors ${
                  selectedId === page.id
                    ? "border-indigo-500 bg-zinc-800"
                    : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.imageUrl} alt="" className="w-full h-24 object-cover" />
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs text-zinc-400 truncate">Str. {i + 1}</span>
                  <StatusDot status={page.status} />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex overflow-hidden">
          {selectedPage ? (
            <>
              <div className="flex-1 bg-zinc-900 overflow-auto flex items-start justify-center p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedPage.imageUrl} alt="Strona" className="max-w-full shadow-2xl rounded" />
              </div>

              <div className="w-96 border-l border-zinc-800 flex flex-col">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
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
                      <p className="text-xs text-zinc-500">Claude czyta pismo…</p>
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
            <div className="flex-1 flex items-center justify-center text-zinc-600">
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
          onSave={saveKeys}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({
  keys,
  onSave,
  onClose,
}: {
  keys: Keys;
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
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Ustawienia · Klucze API</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Klucze są przechowywane tylko w Twojej przeglądarce (localStorage) i
            wysyłane wyłącznie do wybranego silnika. Nigdy nie trafiają do repo.
          </p>
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
