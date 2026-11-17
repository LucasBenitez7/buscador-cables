"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Signs out and goes to the login page; `pending` while it happens. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return { signOut, pending };
}

export function SignOutButton() {
  const { signOut, pending } = useSignOut();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={signOut}
      disabled={pending}
      // Rojo, como «Cerrar sesión» en el menú de la cuenta del ordenador.
      className="text-destructive hover:bg-destructive/15 hover:text-destructive"
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </Button>
  );
}
