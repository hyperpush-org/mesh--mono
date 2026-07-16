"use client"

import { useState, useRef, useEffect } from "react"
import { X, Sparkles, Send, User } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isLoading?: boolean
}

const CANNED_RESPONSES: Record<string, string> = {
  default: "I'm analyzing your recent error data across all environments. Based on the current issue distribution, you have **3 critical** issues, **2 high**, and **1 medium** open right now.\n\nThe most impactful is `HPX-1042` — a TypeError affecting 312 users in production. This looks like an SSR boundary issue introduced in commit `c8f2a91`. I'd recommend assigning this to @alex.kim immediately.\n\nWant me to draft a GitHub issue and propose a fix?",
  "what broke": "Looking at the last 24h: the biggest regression is **HPX-1042** (TypeError in Feed.tsx, 1,847 events, 312 users affected). It started 2 hours ago, correlating with a deploy. Suspect commit `c8f2a91` by @alex.kim.\n\nAlso notable: **HPX-1039** (database pool exhaustion) regressed after `v2.3.1` — 234 events, 178 users. Worker and request traffic are competing for the same connections.",
  "fix": "For **HPX-1042**, here's the proposed fix:\n\n```tsx\n// src/components/Feed.tsx:47\n// Before:\nconst items = events.map(e => <FeedItem key={e.id} event={e} />)\n\n// After:\nconst items = (events ?? []).map(e => <FeedItem key={e.id} event={e} />)\n```\n\nThis guards against undefined `events` during SSR. I can open a PR with this change — should I proceed?",
  "summary": "**Weekly Incident Summary — Week of Apr 4**\n\nTotal events: 3,482 (+12% vs last week)\nAffected users: 891\nIssues opened: 7 | Resolved: 4 | Regressed: 1\nMTTR: 1h 24m (improved from 2h 11m)\n\nTop issue: HPX-1042 — 1,847 events\nHighest user impact: HPX-1039 — 178 users\n\nOverall health: ⚠️ 2 critical issues require immediate attention.",
}

function getResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes("fix") || lower.includes("patch") || lower.includes("pr")) return CANNED_RESPONSES["fix"]
  if (lower.includes("summary") || lower.includes("week") || lower.includes("report")) return CANNED_RESPONSES["summary"]
  if (lower.includes("broke") || lower.includes("wrong") || lower.includes("issue") || lower.includes("error")) return CANNED_RESPONSES["what broke"]
  return CANNED_RESPONSES["default"]
}

function formatContent(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("**") && line.endsWith("**")) {
      return <p key={i} className="font-bold text-[var(--text-primary)] mt-2 mb-0.5">{line.replace(/\*\*/g, "")}</p>
    }
    if (line.startsWith("• ")) {
      return <p key={i} className="text-[11px] leading-relaxed pl-2 text-[var(--text-primary)]">{line}</p>
    }
    if (line.startsWith("```")) return null
    if (line.startsWith("//")) {
      return <p key={i} className="text-[10px] font-mono text-[var(--text-tertiary)] pl-2">{line}</p>
    }
    if (line.includes("**")) {
      const parts = line.split("**")
      return (
        <p key={i} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-[var(--text-primary)] font-semibold">{p}</strong> : p)}
        </p>
      )
    }
    if (line === "") return <div key={i} className="h-1.5" />
    return <p key={i} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{line}</p>
  })
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[var(--purple)] opacity-40"
          style={{
            animation: `typing-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  )
}

const QUICK_PROMPTS = [
  "What broke today?",
  "Summarize critical issues",
  "Weekly summary",
  "Propose a fix for HPX-1042",
]

interface AIPanelProps {
  onClose: () => void
}

export function AIPanel({ onClose }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "assistant",
      content: "Hey — I'm the hyperpush AI copilot. I can help you triage issues, find root causes, and propose fixes. What do you need?",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function send(text?: string) {
    const q = text ?? input
    if (!q.trim() || isLoading) return
    setInput("")

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: q }
    const loadingMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "", isLoading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setIsLoading(true)

    setTimeout(() => {
      const response = getResponse(q)
      setMessages(prev => prev.map(m => m.isLoading ? { ...m, content: response, isLoading: false } : m))
      setIsLoading(false)
    }, 900 + Math.random() * 600)
  }

  return (
    <aside className="flex flex-col h-full bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--line)] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-[var(--purple-dim)] flex items-center justify-center">
            <Sparkles size={12} className="text-[var(--purple)]" />
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">AI Copilot</span>
          <span className="text-[9px] font-bold text-[var(--purple)] bg-[var(--purple-dim)] px-1.5 py-0.5 rounded uppercase tracking-wider leading-none">beta</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all duration-150 active:scale-[0.9]">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
              msg.role === "assistant"
                ? "bg-[var(--purple-dim)] text-[var(--purple)]"
                : "bg-[var(--surface-3)] text-[var(--text-primary)]"
            }`}>
              {msg.role === "assistant" ? <Sparkles size={11} /> : <User size={11} />}
            </div>
            <div className={`max-w-[85%] rounded-lg px-3 py-2.5 ${
              msg.role === "user"
                ? "bg-[var(--surface-2)] border border-[var(--line)] text-xs text-[var(--text-primary)]"
                : "bg-[var(--surface-2)] border border-[var(--purple)]/10"
            }`}>
              {msg.isLoading ? (
                <TypingIndicator />
              ) : (
                <div>{formatContent(msg.content)}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={isLoading}
            className="text-[10px] px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-all duration-150 active:scale-[0.95] disabled:opacity-40"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-[var(--line)]">
        <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--line)] rounded-lg px-3 py-2 focus-within:border-[var(--purple)]/40 focus-within:ring-1 focus-within:ring-[var(--purple)]/20 transition-all duration-150">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask about your errors…"
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="w-6 h-6 flex items-center justify-center rounded-md bg-[var(--purple)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition-all duration-150 active:scale-[0.9] flex-shrink-0"
          >
            <Send size={11} />
          </button>
        </div>
      </div>
    </aside>
  )
}
