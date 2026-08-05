"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      className="button secondary full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await createClient().auth.signOut();
        window.location.assign("/login");
      }}
      type="button"
    >
      {pending ? "Saindo…" : "Sair"}
    </button>
  );
}
