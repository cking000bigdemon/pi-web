import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { listSlashCommands } from "@/lib/rpc-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/commands?cwd=<path>
// Lists extension/skill/prompt slash commands available for a cwd, for input autocomplete.
// Built-in commands are merged in client-side. Degrades to an empty list on any error so
// autocomplete still shows the built-ins.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) {
    return NextResponse.json({ error: "cwd is required", commands: [] }, { status: 400 });
  }
  if (!existsSync(cwd)) {
    return NextResponse.json({ commands: [] });
  }
  try {
    const commands = await listSlashCommands(cwd);
    return NextResponse.json({ commands });
  } catch (error) {
    return NextResponse.json({ error: String(error), commands: [] });
  }
}
