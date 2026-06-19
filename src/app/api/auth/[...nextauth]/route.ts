// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET, POST } = handlers;
