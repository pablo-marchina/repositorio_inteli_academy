"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [institutionalEmail, setInstitutionalEmail] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [accessError, setAccessError] = useState(false);
  const [accessPending, setAccessPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setPending(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function requestInstitutionalAccess(event: FormEvent) {
    event.preventDefault();
    setAccessPending(true);
    setAccessMessage("");
    setAccessError(false);

    const response = await fetch("/api/auth/inteli-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: institutionalEmail })
    });
    const payload = (await response.json()) as { message?: string; error?: string };

    if (response.ok) {
      setAccessMessage(payload.message ?? "Verifique seu e-mail para concluir o acesso.");
      setInstitutionalEmail("");
    } else {
      setAccessError(true);
      setAccessMessage(payload.error ?? "Não foi possível liberar o acesso.");
    }
    setAccessPending(false);
  }

  return (
    <div>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)} />
        </div>
        <button className="button full" disabled={pending} type="submit">
          {pending ? "Entrando…" : "Entrar"}
        </button>
        {message ? <p className="feedback error">{message}</p> : null}
      </form>

      <div className="section">
        <p className="help"><strong>Primeiro acesso com e-mail Inteli?</strong><br />Qualquer pessoa com e-mail institucional da Inteli pode liberar o próprio acesso, sem convite manual.</p>
        <form onSubmit={requestInstitutionalAccess}>
          <div className="field">
            <label htmlFor="institutional-email">E-mail institucional</label>
            <input
              id="institutional-email"
              type="email"
              autoComplete="email"
              required
              value={institutionalEmail}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setInstitutionalEmail(event.target.value)}
              placeholder="nome@sou.inteli.edu.br"
            />
          </div>
          <button className="button full" disabled={accessPending} type="submit">
            {accessPending ? "Liberando acesso…" : "Liberar meu acesso"}
          </button>
          {accessMessage ? <p className={`feedback ${accessError ? "error" : "success"}`}>{accessMessage}</p> : null}
        </form>
      </div>
    </div>
  );
}
