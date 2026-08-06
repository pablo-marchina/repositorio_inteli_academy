"use client";

import { useState } from "react";

export function InstagramConnectionCard({ account }: { account: { username: string; account_type: string | null; token_expires_at: string | null } | null }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function disconnect() {
    if (!window.confirm("Desconectar a conta ativa? Você poderá conectar outra em seguida.")) return;
    setPending(true);
    const response = await fetch("/api/instagram/disconnect", { method: "POST" });
    const payload = (await response.json()) as { error?: string };
    if (response.ok) window.location.reload();
    else setMessage(payload.error ?? "Falha ao desconectar.");
    setPending(false);
  }

  if (!account) {
    return (
      <div className="connection">
        <div className="connection-identity">
          <div className="avatar">IG</div>
          <div><h3>Nenhuma conta conectada</h3><p>Conecte uma conta profissional Business ou Creator. Ela poderá ser trocada depois.</p></div>
        </div>
        <a className="button" href="/api/instagram/connect">Conectar Instagram</a>
      </div>
    );
  }

  return (
    <div>
      <div className="connection">
        <div className="connection-identity">
          <div className="avatar">@</div>
          <div>
            <h3>@{account.username}</h3>
            <p>{account.account_type ?? "Conta profissional"}{account.token_expires_at ? ` · token até ${new Date(account.token_expires_at).toLocaleDateString("pt-BR")}` : ""}</p>
          </div>
        </div>
        <div className="post-actions">
          <a className="button secondary" href="/api/instagram/connect">Trocar conta</a>
          <button className="button danger" disabled={pending} onClick={disconnect} type="button">{pending ? "Desconectando…" : "Desconectar"}</button>
        </div>
      </div>
      {message ? <p className="feedback error">{message}</p> : null}
    </div>
  );
}
