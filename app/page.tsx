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

// Zawsze używamy aktualnego, wbudowanego klucza — bez ustawień, bez localStorage.
const engine: Engine = "gemini";
const keys: Keys = {
  gemini: BUILTIN_GEMINI_KEY,
  claude: BUILTIN_CLAUDE_KEY,
  ollamaHost: "http://localhost:11434",
  ollamaModel: "qwen2.5vl:7b",
};

export default function Home() {
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mobileView, setMobileView] = useState<"image" | "text">("image");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wyczyść ewentualny stary klucz zapisany kiedyś w przeglądarce,
  // żeby na pewno korzystać z aktualnego wbudowanego klucza.
  useEffect(() => {
    try {
      localStorage.removeItem("handscript_keys");
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
  }, []);

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
