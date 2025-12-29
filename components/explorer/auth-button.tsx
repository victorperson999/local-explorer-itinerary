"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function AuthButton() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        Checking…
      </Button>
    );
  }

  if (status === "authenticated") {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
    );
  }

  return (
    <Button type="button" size="sm" onClick={() => void signIn("github")}>
      Sign in
    </Button>
  );
}
