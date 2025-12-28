"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthButton(){
    const { status, data } = useSession();

    if (status == "loading"){
        return <Button variant="secondary" disabled>Loading...</Button>;
    }

    if (status == "authenticated"){
        
    }
}