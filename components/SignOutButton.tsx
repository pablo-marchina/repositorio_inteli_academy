"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      className="button secondary full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      type="button"
    >
      {pending ? "Saindo…" : "Sair"}
    </button>
  );
}
