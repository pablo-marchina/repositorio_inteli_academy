"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

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
    window.location.assign("/dashboard");
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">E-mail autorizado</label>
        <input id="email" type="email" required value={email} onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" type="password" required value={password} onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)} />
      </div>
      <button className="button full" disabled={pending} type="submit">
        {pending ? "Entrando…" : "Entrar"}
      </button>
      {message ? <p className="feedback error">{message}</p> : null}
      <p className="help">Não há cadastro público. Um administrador existente precisa enviar um convite.</p>
    </form>
  );
}
