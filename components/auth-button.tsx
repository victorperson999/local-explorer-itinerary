"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthButton(){
    const { status, data } = useSession();

    if (status == "loading"){
        return <Button variant="secondary" disabled>Loading...</Button>;
    }

    if (status == "authenticated"){
        return (
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                    { data.user?.name ?? data.user?.email ?? "Signed in"}
                </span>
                <Button variant="secondary" onClick={() => signOut()}>
                    Sign Out
                </Button>
            </div>
        );
    }

    return (
        <Button onClick={() => signIn("github")}>
            Sign in
        </Button>
    );

}