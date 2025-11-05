"use client";
import { useState } from "react";
import { getApiBase } from "../lib/api";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const api = getApiBase();

  async function send() {
    if (!input.trim()) return;
    const next = [...messages, { role: "user", content: input } as Msg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      // Use streaming endpoint
      const res = await fetch(`${api}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              setMessages([...next, { role: "assistant", content: reply }]);
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                reply += parsed.token;
                setMessages([...next, { role: "assistant", content: reply }]);
              }
            } catch (_) {
              // Ignore parse errors
            }
          }
        }
      }

      if (reply) {
        setMessages([...next, { role: "assistant", content: reply }]);
      } else {
        throw new Error("No reply from bot");
      }
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `Error: ${e.message || e}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Chat</h1>

      <div className="border rounded p-3 bg-gray-50 text-gray-900 space-y-2 min-h-[300px]">
        {messages.length === 0 && (
          <div className="text-gray-500">Ask for trading advice or type any question.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-blue-700" : "text-gray-900"}>
            <span className="font-medium">{m.role === "user" ? "You" : "Bot"}:</span> {m.content}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded p-2 text-gray-900"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message"
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={send} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </main>
  );
}
