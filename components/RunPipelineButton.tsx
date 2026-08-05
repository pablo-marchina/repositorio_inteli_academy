"use client";

import { useState } from "react";

export function RunPipelineButton({ stage, label }: { stage: "collect" | "generate" | "publish" | "metrics"; label: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/pipeline/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage })
    });
    const payload = (await response.json()) as { error?: string; result?: unknown };
    setMessage(response.ok ? "Executado com sucesso." : payload.error ?? "Falha ao executar.");
    setPending(false);
    if (response.ok) window.location.reload();
  }

  return (
    <div>
      <button className="button secondary" type="button" disabled={pending} onClick={run}>
        {pending ? "Executando…" : label}
      </button>
      {message ? <p className={message.includes("sucesso") ? "feedback success" : "feedback error"}>{message}</p> : null}
    </div>
  );
}
