'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { clsx } from "clsx";
import {
  Copy,
  RefreshCw,
  Sparkles,
  Volume2,
  Mic,
  MicOff,
  ArrowUpRight,
  HelpCircle,
  Timer,
  Undo,
  Paperclip,
  LogOut,
} from "lucide-react";

dayjs.extend(relativeTime);

type Attachment = {
  id: string;
  name: string;
  url: string;
  type: "image" | "pdf" | "text" | "link";
  size: number;
};

type EmailMessage = {
  id: string;
  sessionId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: number;
  attachments: Attachment[];
};

type EmailSession = {
  id: string;
  email: string;
  ttl: number;
  createdAt: number;
  expiresAt: number;
  avatar: string;
  messages: EmailMessage[];
};

type UndoPayload = {
  session: EmailSession;
  expiresAt: number;
};

const TTL_OPTIONS = [
  { label: "10 min", value: 600 },
  { label: "1 hr", value: 3600 },
  { label: "24 hr", value: 86400 },
];

const AVATAR_CHOICES = ["🦄", "🛰️", "🦉", "🌊", "🌈", "🔥", "💫", "🧊", "🪐", "🧿"];

const HELPER_STEPS = [
  {
    title: "वन-क्लिक इनबॉक्स",
    detail: "Generate पर टैप करें और तुरंत नया temp email पाएं। कोई signup नहीं।",
  },
  {
    title: "रियल-टाइम मेल",
    detail: "इनबॉक्स लाइव अपडेट होता है। कोई refresh नहीं चाहिए।",
  },
  {
    title: "AI Guide",
    detail: "मेल summary, phishing alert, voice help सब कुछ built-in AI helper में।",
  },
  {
    title: "Rotate + Undo",
    detail: "पुराना इनबॉक्स साफ़ करके नया email instantly. गलती से किया? Undo करें।",
  },
];

const AUTOFILL_TEMPLATE = (email: string) => `<script>
(async () => {
  try {
    const res = await fetch("https://agentic-562f5251.vercel.app/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 3600 })
    });
    const data = await res.json();
    const tempEmail = data.session?.email ?? "${email}";
    const input = document.querySelector('input[type="email"], input[name*="email"]');
    if (input) {
      input.value = tempEmail;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } catch (err) {
    console.error("Autofill failed", err);
  }
})();
</script>`;

const suspiciousKeywords = [
  "password",
  "reset",
  "urgent",
  "login",
  "verify",
  "credential",
  "click here",
  "limited time",
  "attachment",
  "malware",
  "bank",
];

declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): any;
    };
    SpeechRecognition?: {
      new (): any;
    };
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${sizes[i]}`;
}

function summarizeMessage(message: EmailMessage | null) {
  if (!message) {
    return [];
  }

  const subject = message.subject.trim();
  const lines = message.body
    .split(/\r?\n|•|-/)
    .map((line) => line.trim())
    .filter(Boolean);

  const highlight = lines.slice(0, 2);
  const summary = [subject, ...highlight];
  return summary.slice(0, 3);
}

function phishingRisk(message: EmailMessage | null) {
  if (!message) return { level: "Low", score: 0.1, hints: [] as string[] };
  const lowerBody = `${message.subject} ${message.body}`.toLowerCase();
  let hits = 0;
  const hints: string[] = [];

  suspiciousKeywords.forEach((keyword) => {
    if (lowerBody.includes(keyword)) {
      hits += 1;
      hints.push(keyword);
    }
  });

  const hasExternalLink = /https?:\/\/[^\s]+/.test(lowerBody);
  if (hasExternalLink) {
    hits += 1.5;
    hints.push("external link detected");
  }

  const score = Math.min(1, hits / 5);
  if (score > 0.66) return { level: "High", score, hints };
  if (score > 0.33) return { level: "Medium", score, hints };
  return { level: "Low", score, hints };
}

function usernameSuggestions(base: string) {
  const descriptor = ["stealth", "nova", "zen", "astro", "quant", "pulse"];
  const suffix = ["x", "hq", "fy", "shift", "craft", "ops"];
  const sanitized = base.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
  return Array.from({ length: 3 }).map((_, index) => {
    const prefix = descriptor[(sanitized.length + index) % descriptor.length];
    const post = suffix[(sanitized.length * (index + 2)) % suffix.length];
    return `${prefix}${sanitized.slice(0, 4)}${post}`;
  });
}

function speak(text: string) {
  if (typeof window === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "hi-IN";
  window.speechSynthesis?.speak(utterance);
}

function useSpeechInput(onTranscript: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = "hi-IN";
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
  }, []);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognition.onresult = (event: any) => {
      const sequence = Array.from(event.results as any);
      const transcript = sequence
        .map((result: any) => result?.[0]?.transcript ?? "")
        .join(" ");
      onTranscript(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onspeechend = () => recognition.stop();
  }, [onTranscript]);

  const toggle = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.start();
      setListening(true);
    }
  }, [listening]);

  return { listening, toggle };
}

export default function Home() {
  const [session, setSession] = useState<EmailSession | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [ttl, setTtl] = useState(TTL_OPTIONS[1]!.value);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [undoPayload, setUndoPayload] = useState<UndoPayload | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helperPrompt, setHelperPrompt] = useState<string>("");
  const [helperResponse, setHelperResponse] = useState<string[]>([]);
  const [phishingState, setPhishingState] = useState(() => ({
    level: "Low",
    score: 0,
    hints: [] as string[],
  }));
  const [autofillSnippet, setAutofillSnippet] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { listening, toggle } = useSpeechInput((value) => {
    setHelperPrompt(value);
    evaluateHelper(value, selectedMessage);
  });

  const evaluateHelper = useCallback(
    (prompt: string, message: EmailMessage | null) => {
      const normalized = prompt.toLowerCase();
      const hints: string[] = [];

      if (!message) {
        hints.push("कोई मेल select करें ताकि मैं guide कर सकूँ।");
      } else {
        hints.push("मेल summary update कर रही हूँ…");
      }

      if (normalized.includes("phishing")) {
        hints.push("Phishing alert तैयार है।");
      }
      if (normalized.includes("steps") || normalized.includes("स्टेप")) {
        hints.push("Usage steps नीचे दिए गए हैं।");
      }
      if (normalized.includes("username")) {
        hints.push("Username सुझाव update किए गए हैं।");
      }

      setHelperResponse(hints);
    },
    [],
  );

  const connectSocket = useCallback(
    async (sessionId: string) => {
      await fetch("/api/socket");
      socketRef.current?.emit("leave", sessionId);
      socketRef.current?.disconnect();

      const socket = io({
        path: "/api/socket",
      });

      socket.emit("join", sessionId);
      socket.on("session:message", (message: EmailMessage) => {
        setMessages((prev) => {
          const exists = prev.some((item) => item.id === message.id);
          if (exists) return prev;
          return [message, ...prev];
        });
      });
      socket.on("session:expired", () => {
        setHelperResponse(["Session expired. नया email जनरेट कीजिए।"]);
      });
      socketRef.current = socket;
    },
    [],
  );

  const hydrateSession = useCallback(
    async (nextSession: EmailSession, focus = false) => {
      setSession(nextSession);
      setTtl(nextSession.ttl);
      setRemaining(nextSession.expiresAt - Date.now());
      setAutofillSnippet(AUTOFILL_TEMPLATE(nextSession.email));
      if (focus) {
        setSelectedMessage(null);
      }
      const response = await fetch(
        `/api/messages?sessionId=${encodeURIComponent(nextSession.id)}`,
      );
      const data = await response.json();
      setMessages(data.messages ?? []);
      if (data.messages?.length) {
        setSelectedMessage(data.messages[0]);
      }
      await connectSocket(nextSession.id);
    },
    [connectSocket],
  );

  const createNewSession = useCallback(
    async (overrideTtl?: number) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: overrideTtl ?? ttl }),
        });
        const data = await res.json();
        if (data.session) {
          await hydrateSession(data.session, true);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [hydrateSession, ttl],
  );

  const rotateInbox = useCallback(async () => {
    if (!session) return;
    const res = await fetch("/api/session/rotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, ttl }),
    });
    const data = await res.json();
    if (data.newSession) {
      if (data.oldSession) {
        setUndoPayload({
          session: data.oldSession as EmailSession,
          expiresAt: Date.now() + 5000,
        });
      } else {
        setUndoPayload(null);
      }
      await hydrateSession(data.newSession, true);
      setHelperResponse(["Inbox rotated. Undo करने के लिए 5 सेकंड।"]);
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = setTimeout(() => {
        setUndoPayload(null);
      }, 5000);
    }
  }, [hydrateSession, session, ttl]);

  const undoRotation = useCallback(async () => {
    if (!undoPayload?.session) return;
    if (Date.now() > undoPayload.expiresAt) {
      setUndoPayload(null);
      return;
    }
    const res = await fetch("/api/session/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: undoPayload.session }),
    });
    const data = await res.json();
    if (data.session) {
      setUndoPayload(null);
      await hydrateSession(data.session, true);
      setHelperResponse(["Undo successful ✅"]);
    }
  }, [hydrateSession, undoPayload]);

  const updateAvatar = useCallback(
    async (avatar: string) => {
      if (!session) return;
      setSession((prev) => (prev ? { ...prev, avatar } : prev));
      await fetch("/api/session/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, avatar }),
      });
    },
    [session],
  );

  const copyEmail = useCallback(async () => {
    if (!session) return;
    await navigator.clipboard.writeText(session.email);
    setHelperResponse(["Email copied to clipboard!"]);
    speak("Email address clipboard पर copy हो गया है।");
  }, [session]);

  useEffect(() => {
    if (!session?.expiresAt) return;
    const interval = setInterval(() => {
      setRemaining(session.expiresAt - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt]);

  useEffect(() => {
    createNewSession(ttl);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          // ignored
        });
    }
  }, []);

  useEffect(() => {
    if (selectedMessage) {
      setHelperResponse(summarizeMessage(selectedMessage));
      setPhishingState(phishingRisk(selectedMessage));
    }
  }, [selectedMessage]);

  useEffect(
    () => () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      socketRef.current?.disconnect();
    },
    [],
  );

  const remainingLabel = useMemo(() => {
    if (remaining === null) return "--";
    if (remaining <= 0) return "Expired";
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [remaining]);

  const helperUsernameIdeas = useMemo(() => {
    if (!session) return [];
    return usernameSuggestions(session.email);
  }, [session]);

  return (
    <main className="relative flex min-h-screen flex-col items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="pointer-events-none absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-teal-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-amber-400/30 blur-3xl" />
      </div>

      <header className="flex w-full max-w-6xl flex-col gap-6 pb-10 text-center sm:text-left">
        <div className="flex flex-col gap-3">
          <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-surface-muted px-4 py-1 text-sm text-teal-200 shadow-md shadow-teal-500/30 sm:mx-0">
            <Sparkles className="h-4 w-4" /> InstantTempMail · तेज़, सुन्दर और सुरक्षित
          </span>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            One-click सुरक्षित Temp Mail
            <span className="block text-lg font-normal text-slate-300 sm:text-xl">
              AI guide · रियल-टाइम इनबॉक्स · वॉइस हेल्प · 100% private
            </span>
          </h1>
        </div>
      </header>

      <section className="grid w-full max-w-6xl gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-[var(--radius-2xl)] bg-surface-strong/80 p-6 shadow-[var(--shadow-glass)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-2">
                <label className="text-sm uppercase tracking-[0.2em] text-slate-400">
                  Temp email
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-balance rounded-full bg-surface px-4 py-2 text-lg font-semibold text-teal-200 shadow-inner shadow-teal-500/30">
                    {session?.email ?? "—"}
                  </span>
                  <button
                    type="button"
                    onClick={copyEmail}
                    className="inline-flex items-center gap-2 rounded-full bg-teal-500/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-teal-400"
                  >
                    <Copy className="h-4 w-4" /> Copy
                  </button>
                  <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm text-slate-300">
                    <Timer className="h-4 w-4 text-amber-300" />
                    <span>{remainingLabel}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => createNewSession(ttl)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-teal-500/50 bg-transparent px-4 py-2 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate new
                </button>
                <button
                  type="button"
                  onClick={rotateInbox}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-400/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-300"
                >
                  <RefreshCw className="h-4 w-4" />
                  Rotate
                </button>
                {undoPayload && (
                  <button
                    type="button"
                    onClick={undoRotation}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-500/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/40"
                  >
                    <Undo className="h-4 w-4" /> Undo
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
                <span className="text-xs uppercase text-slate-400">TTL</span>
                <div className="flex flex-wrap gap-2">
                  {TTL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setTtl(option.value)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-sm transition",
                        ttl === option.value
                          ? "bg-teal-500 text-slate-900"
                          : "bg-slate-800/60 text-slate-300 hover:bg-slate-700/70",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
                <span className="text-xs uppercase text-slate-400">
                  अपना avatar चुनें
                </span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_CHOICES.map((avatar) => (
                    <button
                      key={avatar}
                      onClick={() => updateAvatar(avatar)}
                      className={clsx(
                        "flex h-10 w-10 items-center justify-center rounded-full text-lg transition",
                        session?.avatar === avatar
                          ? "bg-amber-400 text-slate-900 shadow-inner shadow-amber-200"
                          : "bg-slate-800 text-slate-200 hover:bg-slate-700",
                      )}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 rounded-[var(--radius-2xl)] bg-surface-strong/80 p-6 shadow-[var(--shadow-glass)] backdrop-blur-xl lg:grid-cols-[1.3fr_1fr]">
            <div className="flex max-h-[520px] flex-col gap-4 overflow-hidden">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Inbox</h2>
                <span className="text-sm text-slate-400">
                  रियल-टाइम अपडेट · {messages.length} message(s)
                </span>
              </div>
              <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/40">
                <div className="absolute inset-0 overflow-y-auto">
                  <ul className="divide-y divide-slate-700/40">
                    {messages.map((message) => (
                      <li
                        key={message.id}
                        onClick={() => setSelectedMessage(message)}
                        className={clsx(
                          "flex cursor-pointer flex-col gap-2 px-5 py-4 transition",
                          selectedMessage?.id === message.id
                            ? "bg-teal-500/15"
                            : "hover:bg-slate-800/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-100">
                              {message.subject}
                            </span>
                            <span className="text-xs text-slate-400">
                              {message.from}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {dayjs(message.receivedAt).fromNow()}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm text-slate-300">
                          {message.body}
                        </p>
                        {message.attachments.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-amber-300">
                            <Paperclip className="h-3.5 w-3.5" />
                            {message.attachments.length} attachment
                          </div>
                        )}
                      </li>
                    ))}
                    {messages.length === 0 && (
                      <li className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center text-sm text-slate-400">
                        <Sparkles className="h-6 w-6 text-teal-300" />
                        पहला मेल आने वाला है। Be ready ✨
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <aside className="flex max-h-[520px] flex-col gap-4 overflow-hidden rounded-2xl border border-slate-700/40 bg-slate-900/40">
              {selectedMessage ? (
                <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-teal-200">
                        {selectedMessage.subject}
                      </p>
                      <span className="text-xs text-slate-400">
                        {selectedMessage.from}
                      </span>
                    </div>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                      {dayjs(selectedMessage.receivedAt).format("HH:mm")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                    {selectedMessage.body}
                  </p>
                  {selectedMessage.attachments.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        Attachments
                      </span>
                      <div className="grid gap-3">
                        {selectedMessage.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center justify-between gap-3 rounded-xl bg-slate-800/60 px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-700/70"
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold">
                                {attachment.name}
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatBytes(attachment.size)} · {attachment.type.toUpperCase()}
                              </span>
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-amber-300 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-400">
                  <HelpCircle className="h-6 w-6 text-amber-300" />
                  मेल select करें और AI helper से insights पाएं।
                </div>
              )}
            </aside>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-[var(--radius-2xl)] bg-surface-strong/80 p-6 shadow-[var(--shadow-glass)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/20 text-2xl">
                  {session?.avatar ?? "🪄"}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">AI हेल्पर</h2>
                  <p className="text-xs text-slate-400">
                    मेल summary, phishing alert, voice guide
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    selectedMessage &&
                    speak(
                      summarizeMessage(selectedMessage)
                        .map((line) => line)
                        .join(". "),
                    )
                  }
                  className="flex items-center gap-2 rounded-full bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
                >
                  <Volume2 className="h-4 w-4 text-amber-300" />
                  Speak
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  className={clsx(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-xs",
                    listening
                      ? "bg-amber-400 text-slate-900"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700",
                  )}
                >
                  {listening ? (
                    <>
                      <MicOff className="h-4 w-4" /> Stop
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 text-amber-300" /> Voice
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs uppercase text-slate-400">
                  Ask कुछ भी (Hindi + English)
                </label>
                <textarea
                  placeholder="e.g. 'इस mail का सारांश बताओ' या 'phishing risk क्या है?'"
                  value={helperPrompt}
                  onChange={(event) => {
                    setHelperPrompt(event.target.value);
                    evaluateHelper(event.target.value, selectedMessage);
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-700/50 bg-slate-900/50 p-3 text-sm text-slate-200 outline-none focus:border-teal-500/70"
                  rows={3}
                />
              </div>

              <div className="space-y-2 rounded-2xl bg-slate-900/60 p-4 text-sm text-slate-200">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Summary
                </span>
                {helperResponse.length ? (
                  <ul className="space-y-2">
                    {helperResponse.map((line, index) => (
                      <li key={`${line}-${index}`} className="flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-teal-400" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">
                    कोई message चुनें ताकि summary दिखा सकूँ।
                  </p>
                )}
              </div>

              <div className="grid gap-3 rounded-2xl bg-slate-900/60 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    Phishing alert
                  </span>
                  <span
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      phishingState.level === "High" && "bg-red-500/30 text-red-200",
                      phishingState.level === "Medium" &&
                        "bg-amber-500/30 text-amber-100",
                      phishingState.level === "Low" && "bg-teal-500/20 text-teal-200",
                    )}
                  >
                    {phishingState.level}
                  </span>
                </div>
                {phishingState.hints.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {phishingState.hints.map((hint) => (
                      <span
                        key={hint}
                        className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300"
                      >
                        #{hint}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-slate-900/60 p-4">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Username ideas
                </span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {helperUsernameIdeas.map((idea) => (
                    <button
                      key={idea}
                      onClick={async () => {
                        await navigator.clipboard.writeText(idea);
                        setHelperResponse([`'${idea}' clipboard पर copy किया गया`]);
                      }}
                      className="rounded-full bg-slate-800 px-3 py-1 text-xs text-teal-100 hover:bg-teal-500/10"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-900/60 p-4 text-sm">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Step-by-step सहायता
                </span>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-200">
                  <li>Generate दबाएं और नया temp mail लें।</li>
                  <li>Mail आने पर AI helper से summary पढ़ें।</li>
                  <li>संदेह हो तो phishing alert देखें या rotate करें।</li>
                  <li>काम पूरा होने पर mail auto-expire हो जाएगा।</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-2xl)] bg-surface-strong/70 p-6 shadow-[var(--shadow-glass)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-100">
                Autofill script & tips
              </h3>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(autofillSnippet)}
                className="flex items-center gap-2 rounded-full bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
              >
                <Copy className="h-4 w-4" />
                Copy script
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              Script को किसी भी form page में embed करें। यह auto आपके temp email को
              field में भर देगा।
            </p>
            <pre className="mt-4 max-h-48 overflow-auto rounded-2xl bg-slate-950/60 p-4 text-[11px] leading-relaxed text-emerald-200">
              {autofillSnippet}
            </pre>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setShowHelp((prev) => !prev)}
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-2xl bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-teal-500/40 transition hover:bg-teal-400"
      >
        <HelpCircle className="h-4 w-4" />
        How to use?
      </button>

      {showHelp && (
        <div className="fixed bottom-24 right-6 w-80 rounded-[var(--radius-2xl)] border border-slate-700/40 bg-surface p-5 text-sm text-slate-200 shadow-xl shadow-teal-500/20">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-teal-200">
              Quick walkthrough
            </span>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              बंद करें
            </button>
          </div>
          <ul className="space-y-3">
            {HELPER_STEPS.map((step) => (
              <li key={step.title} className="rounded-xl bg-slate-900/60 p-3">
                <p className="text-xs font-semibold uppercase text-amber-300">
                  {step.title}
                </p>
                <p className="mt-1 text-xs text-slate-300">{step.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="mt-16 flex w-full max-w-6xl items-center justify-between rounded-[var(--radius-2xl)] bg-surface-muted/80 px-6 py-4 text-xs text-slate-400 backdrop-blur-xl">
        <span>InstantTempMail · Crafted for privacy & speed</span>
        <span className="flex items-center gap-2 text-slate-500">
          <LogOut className="h-3.5 w-3.5" />
          Auto deletes after TTL expiry
        </span>
      </footer>
    </main>
  );
}
