import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Nomor HP minimal 9 digit")
  .max(20, "Nomor HP maksimal 20 karakter");

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "PIN harus terdiri dari tepat 6 digit angka");

export const amountSchema = z
  .number({ invalid_type_error: "Nominal harus berupa angka" })
  .finite()
  .int("Nominal harus bilangan bulat Rupiah")
  .min(1000, "Minimal transaksi Rp1.000")
  .max(20_000_000, "Maksimal transaksi Rp20.000.000");

export const otpRequestSchema = z.object({
  phone_number: phoneSchema,
  channel: z.enum(["WHATSAPP", "SMS"]).default("WHATSAPP"),
});

export const otpVerifySchema = z.object({
  phone_number: phoneSchema,
  otp_code: z.string().trim().regex(/^\d{6}$/, "Kode OTP harus 6 digit"),
  purpose: z.enum(["REGISTER", "LOGIN"]).default("REGISTER"),
});

export const registerSchema = z.object({
  phone_number: phoneSchema,
  full_name: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(100),
  email: z.string().trim().email("Format email tidak valid").optional().or(z.literal("")),
  pin: pinSchema,
  registration_token: z.string().trim().min(10, "Token verifikasi OTP tidak valid"),
  device_id: z.string().trim().min(3).max(120).optional(),
});

export const loginSchema = z.object({
  phone_number: phoneSchema,
  pin: pinSchema,
  device_id: z.string().trim().min(3).max(120).optional(),
});

export const pinVerifySchema = z.object({
  pin: pinSchema,
});

export const kycSubmitSchema = z.object({
  nik: z.string().trim().regex(/^\d{16}$/, "NIK e-KTP harus 16 digit angka"),
  full_name_ktp: z.string().trim().min(3, "Nama sesuai e-KTP wajib diisi").max(120),
  ktp_image_url: z.string().trim().min(5, "Foto e-KTP wajib diunggah"),
  selfie_image_url: z.string().trim().min(5, "Foto selfie liveness wajib diambil"),
  liveness_passed: z.boolean().refine((v) => v === true, {
    message: "Verifikasi liveness wajah harus diselesaikan terlebih dahulu",
  }),
});

export const createPocketSchema = z.object({
  name: z.string().trim().min(2, "Nama kantong minimal 2 karakter").max(50),
  category_key: z.enum(["food", "transport", "savings", "bills"]).default("savings"),
  target_amount: z.number().int().min(10_000).max(20_000_000).optional(),
});

export const updatePocketSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  target_amount: z.number().int().min(10_000).max(20_000_000).nullable().optional(),
  is_locked: z.boolean().optional(),
});

export const movePocketSchema = z.object({
  source_wallet_id: z.string().uuid(),
  destination_wallet_id: z.string().uuid(),
  amount: amountSchema,
});

export const createTopupSchema = z.object({
  channel: z.enum([
    "VA_BCA",
    "VA_MANDIRI",
    "VA_BNI",
    "VA_BRI",
    "VA_BSI",
    "RETAIL_ALFAMART",
    "RETAIL_INDOMARET",
    "DEBIT_INSTANT",
  ]),
  amount: z.number().int().min(10_000, "Minimal Top Up Rp10.000").max(20_000_000),
});

export const qrisDecodeSchema = z.object({
  raw_qr_payload: z.string().trim().min(8, "Payload QR tidak valid"),
});

export const qrisExecuteSchema = z.object({
  inquiry_id: z.string().trim().optional(),
  raw_qr_payload: z.string().trim().optional(),
  source_wallet_id: z.string().uuid(),
  amount: amountSchema,
  tx_auth_token: z.string().trim().min(10, "Otorisasi PIN diperlukan"),
});

export const p2pTransferSchema = z.object({
  recipient_phone: phoneSchema,
  source_wallet_id: z.string().uuid(),
  amount: amountSchema,
  notes: z.string().trim().max(120).optional(),
  tx_auth_token: z.string().trim().min(10, "Otorisasi PIN diperlukan"),
});

export const bankTransferSchema = z.object({
  bank_code: z.enum(["BCA", "MANDIRI", "BNI", "BRI", "BSI", "CIMB", "JAGO", "SEABANK"]),
  account_number: z.string().trim().regex(/^\d{8,20}$/, "Nomor rekening 8–20 digit"),
  account_holder_name: z.string().trim().min(2).max(100),
  source_wallet_id: z.string().uuid(),
  amount: z.number().int().min(10_000, "Minimal transfer bank Rp10.000").max(20_000_000),
  notes: z.string().trim().max(120).optional(),
  tx_auth_token: z.string().trim().min(10, "Otorisasi PIN diperlukan"),
});

export const ppobInquireSchema = z.object({
  product_code: z.string().trim().min(2),
  customer_number: z.string().trim().min(6, "Nomor pelanggan/HP minimal 6 karakter").max(24),
});

export const ppobExecuteSchema = z.object({
  product_code: z.string().trim().min(2),
  customer_number: z.string().trim().min(6).max(24),
  source_wallet_id: z.string().uuid(),
  tx_auth_token: z.string().trim().min(10, "Otorisasi PIN diperlukan"),
});

export const splitBillCreateSchema = z.object({
  title: z.string().trim().min(3, "Judul patungan minimal 3 karakter").max(100),
  split_mode: z.enum(["EQUAL", "ITEMIZED"]),
  participant_phones: z.array(phoneSchema).min(1, "Pilih minimal 1 teman patungan"),
  total_amount: amountSchema.optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        price: z.number().int().min(100),
        assigned_phones: z.array(phoneSchema).min(1),
      })
    )
    .optional(),
});

export const splitBillPaySchema = z.object({
  source_wallet_id: z.string().uuid(),
  tx_auth_token: z.string().trim().min(10, "Otorisasi PIN diperlukan"),
});

export const merchantQrisSchema = z.object({
  merchant_id: z.string().uuid(),
  amount: z.number().int().min(1000).max(20_000_000).nullable().optional(),
  is_dynamic: z.boolean().default(false),
});

export const merchantSettleSchema = z.object({
  merchant_id: z.string().uuid(),
  amount: z.number().int().min(10_000, "Minimal pencairan Rp10.000").max(20_000_000),
  destination_bank: z.string().trim().min(2).max(40),
  account_number: z.string().trim().min(6).max(24),
  tx_auth_token: z.string().trim().min(10),
});

