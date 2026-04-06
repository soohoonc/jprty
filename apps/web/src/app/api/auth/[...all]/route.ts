import { auth } from "@/lib/auth"; // path to your auth file
import { toNextJsHandler } from "better-auth/next-js";
import { ensureDatabaseSchema } from "@jprty/db";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureDatabaseSchema();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await ensureDatabaseSchema();
  return handler.POST(request);
}
