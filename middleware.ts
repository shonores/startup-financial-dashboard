import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Passthrough middleware — no auth required
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}
