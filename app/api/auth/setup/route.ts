/**
 * One-time setup endpoint to create the first owner account.
 * Only works when no users exist.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // Only allow if no users exist
    const existingUsers = await db.select().from(users).all();
    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: "Setup already complete. Use the login page." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.insert(users).values({
      email: email.toLowerCase().trim(),
      passwordHash,
      role: "owner",
    });

    return NextResponse.json({ success: true, message: "Owner account created." });
  } catch (err) {
    console.error("Setup error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
