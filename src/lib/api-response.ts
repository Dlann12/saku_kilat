import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/lib/ledger";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(err: unknown) {
  if (err instanceof DomainError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      { status: err.statusCode }
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0]?.message || "Input tidak valid",
          details: err.flatten(),
        },
      },
      { status: 422 }
    );
  }

  const pgCode =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  if (pgCode === "23505") {
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_RECORD",
          message: "Data yang sama sudah terdaftar di sistem.",
        },
      },
      { status: 409 }
    );
  }
  if (pgCode === "23514") {
    return NextResponse.json(
      {
        error: {
          code: "CONSTRAINT_VIOLATION",
          message: "Operasi melanggar batas saldo atau aturan validasi database.",
        },
      },
      { status: 422 }
    );
  }

  console.error("[SakuKilat API Error]", err);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Terjadi gangguan sistem internal. Silakan coba lagi.",
      },
    },
    { status: 500 }
  );
}

export function getIdempotencyKey(request: NextRequest): string | null {
  return request.headers.get("x-idempotency-key");
}

