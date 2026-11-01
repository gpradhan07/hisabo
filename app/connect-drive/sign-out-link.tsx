"use client";

import { useTransition } from "react";
import { forgetCachedData } from "@/lib/local-data";
import { logout } from "../login/actions";

export function SignOutLink() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(() => {
          forgetCachedData();
          return logout();
        })
      }
      className="font-medium text-brand underline-offset-4 hover:underline disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
