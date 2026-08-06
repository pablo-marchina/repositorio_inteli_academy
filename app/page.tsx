"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const isInvite =
      fragment.get("type") === "invite" ||
      (fragment.has("access_token") && fragment.has("refresh_token")) ||
      url.searchParams.get("type") === "invite";

    if (isInvite) {
      window.location.replace(`/auth/accept${url.search}${url.hash}`);
      return;
    }

    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Inteli Academy</span>
          <h2>Carregando o painel…</h2>
        </div>
      </section>
    </main>
  );
}
