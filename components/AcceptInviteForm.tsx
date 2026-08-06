"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Status = "loading" | "ready" | "saving" | "error";

export function AcceptInviteForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("Validando o convite…");

  useEffect(() => {
    let active = true;

    async function establishSession() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type") as EmailOtpType | null;

      let error: Error | null = null;

      if (accessToken && refreshToken) {
        const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        error = result.error;
      } else if (code) {
        const result = await supabase.auth.exchangeCodeForSession(code);
        error = result.error;
      } else if (tokenHash && type) {
        const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        error = result.error;
      } else {
        const result = await supabase.auth.getSession();
        error = result.error;
        if (!result.data.session && !error) error = new Error("O convite não criou uma sessão válida.");
      }

      if (!active) return;
      if (error) {
        setStatus("error");
        setMessage(`${error.message} Solicite um novo convite.`);
        return;
      }

      window.history.replaceState({}, document.title, "/auth/accept");
      setStatus("ready");
      setMessage("Convite confirmado. Defina uma senha para concluir o acesso.");
    }

    void establishSession();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setMessage("As senhas não coincidem.");
      return;
    }

    setStatus("saving");
    setMessage("Salvando sua senha…");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setStatus("ready");
      setMessage(error.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  if (status === "loading" || status === "error") {
    return <p className={status === "error" ? "feedback error" : "help"}>{message}</p>;
  }

  return (
    <form onSubmit={submit}>
      <p className="feedback success">{message}</p>
      <div className="field">
        <label htmlFor="new-password">Nova senha</label>
        <input
          id="new-password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="confirm-password">Confirmar senha</label>
        <input
          id="confirm-password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
      <button className="button full" disabled={status === "saving"} type="submit">
        {status === "saving" ? "Salvando…" : "Concluir acesso"}
      </button>
    </form>
  );
}
