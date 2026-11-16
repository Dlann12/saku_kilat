import { ok } from "@/lib/api-response";
import { PPOB_CATALOG } from "@/services/payment.service";

export async function GET() {
  return ok({ products: PPOB_CATALOG });
}

