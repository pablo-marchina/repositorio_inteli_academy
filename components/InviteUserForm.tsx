"use client";

import { ChangeEvent, FormEvent, useState } from "react";

export function InviteUserForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = (await response.json()) as { error?: string };
    if (response.ok) {
      setEmail("");
      setMessage("Convite enviado.");
    } else setMessage(payload.error ?? "Não foi possível enviar o convite.");
    setPending(false);
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="invite-email">E-mail do novo administrador</label>
        <input id="invite-email" type="email" required value={email} onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)} placeholder="nome@exemplo.com" />
      </div>
      <button className="button" type="submit" disabled={pending}>{pending ? "Enviando…" : "Convidar"}</button>
      {message ? <p className={message.includes("enviado") ? "feedback success" : "feedback error"}>{message}</p> : null}
    </form>
  );
}
