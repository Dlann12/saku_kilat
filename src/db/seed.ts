import { withTransaction, closePool } from "./pool";
import { runMigrations } from "./migrate";
import { hashPin, encryptNik, hashNik } from "@/lib/crypto";
import { executeDoubleEntryInTx } from "@/lib/ledger";

export const SEED_IDS = {
  systemUser: "00000000-0000-4000-8000-000000000001",
  dlan: "10000000-0000-4000-8000-000000000001",
  raka: "10000000-0000-4000-8000-000000000002",
  sari: "10000000-0000-4000-8000-000000000003",
  pakBudi: "10000000-0000-4000-8000-000000000004",
  tania: "10000000-0000-4000-8000-000000000005",
  admin: "10000000-0000-4000-8000-000000000006",
};

export async function seedDatabase(): Promise<void> {
  await runMigrations(true);

  const defaultPinHash = hashPin("123456");

  await withTransaction(async (client) => {
    // 1. Insert Users
    const users = [
      {
        id: SEED_IDS.systemUser,
        phone: "+6280000000000",
        name: "SakuKilat Core Treasury",
        email: "treasury@sakukilat.id",
        kyc: "VERIFIED",
        status: "SYSTEM",
        role: "SYSTEM",
        bio: false,
      },
      {
        id: SEED_IDS.dlan,
        phone: "+6285211223344",
        name: "Dlan Kusuma",
        email: "dlan@sakukilat.id",
        kyc: "VERIFIED",
        status: "ACTIVE",
        role: "USER",
        bio: true,
      },
      {
        id: SEED_IDS.raka,
        phone: "+6281234567890",
        name: "Raka Pratama",
        email: "raka@sakukilat.id",
        kyc: "VERIFIED",
        status: "ACTIVE",
        role: "USER",
        bio: false,
      },
      {
        id: SEED_IDS.sari,
        phone: "+6281398765432",
        name: "Sari Wulandari",
        email: "sari@sakukilat.id",
        kyc: "VERIFIED",
        status: "ACTIVE",
        role: "USER",
        bio: true,
      },
      {
        id: SEED_IDS.pakBudi,
        phone: "+6281122334455",
        name: "Pak Budi Santoso",
        email: "budi.kopi@sakukilat.id",
        kyc: "VERIFIED",
        status: "ACTIVE",
        role: "MERCHANT",
        bio: false,
      },
      {
        id: SEED_IDS.tania,
        phone: "+6287812345678",
        name: "Tania Wijaya",
        email: "tania@sakukilat.id",
        kyc: "UNVERIFIED",
        status: "ACTIVE",
        role: "USER",
        bio: false,
      },
      {
        id: SEED_IDS.admin,
        phone: "+6281100009999",
        name: "Nadia Putri (Compliance)",
        email: "compliance@sakukilat.id",
        kyc: "VERIFIED",
        status: "ACTIVE",
        role: "ADMIN",
        bio: true,
      },
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, phone_number, full_name, email, pin_hash, kyc_status, account_status, role, biometric_enabled, active_device_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          u.id,
          u.phone,
          u.name,
          u.email,
          defaultPinHash,
          u.kyc,
          u.status,
          u.role,
          u.bio,
          `dev-${u.id.slice(-4)}`,
        ]
      );
    }

    // 2. Insert Verified KYC Records (AES-256-GCM encrypted NIK + SHA-256 hash)
    const verifiedKyc = [
      { userId: SEED_IDS.dlan, nik: "1771011611990001", name: "DLAN KUSUMA" },
      { userId: SEED_IDS.raka, nik: "3273012105050002", name: "RAKA PRATAMA" },
      { userId: SEED_IDS.sari, nik: "3174015508990003", name: "SARI WULANDARI" },
      { userId: SEED_IDS.pakBudi, nik: "1771021204880004", name: "BUDI SANTOSO" },
      { userId: SEED_IDS.admin, nik: "3171014402950005", name: "NADIA PUTRI" },
    ];
    for (const k of verifiedKyc) {
      await client.query(
        `INSERT INTO kyc_documents (user_id, nik_encrypted, nik_hash, full_name_ktp, ktp_image_url, selfie_image_url, status, verified_at)
         VALUES ($1,$2,$3,$4,'/sandbox/ktp-verified.svg','/sandbox/selfie-verified.svg','VERIFIED',NOW())`,
        [k.userId, encryptNik(k.nik), hashNik(k.nik), k.name]
      );
    }

    // Also seed one PENDING KYC document for Tania? No, keep Tania UNVERIFIED so user/tests can submit KYC from UNVERIFIED -> PENDING -> VERIFIED, or verify Rp2M cap directly!

    // 3. Provision Wallets (Genesis starts with 50B liquidity, then Genesis Double-Entry moves it into Escrow)
    const walletRows: Array<{
      id: string;
      userId: string;
      type: string;
      name: string;
      categoryKey: string;
      balance: number;
      targetAmount?: number;
      isLocked?: boolean;
    }> = [
      { id: "20000000-0000-4000-8000-000000000001", userId: SEED_IDS.systemUser, type: "SYSTEM_GENESIS", name: "Genesis Reserve Vault", categoryKey: "system", balance: 50_000_000_000 },
      { id: "20000000-0000-4000-8000-000000000002", userId: SEED_IDS.systemUser, type: "SYSTEM_ESCROW", name: "Escrow Float Bank Umum", categoryKey: "system", balance: 0 },
      { id: "20000000-0000-4000-8000-000000000003", userId: SEED_IDS.systemUser, type: "SYSTEM_FEE", name: "Pendapatan Fee & MDR", categoryKey: "system", balance: 0 },
      { id: "20000000-0000-4000-8000-000000000004", userId: SEED_IDS.systemUser, type: "SYSTEM_PPOB", name: "Clearing Biller PPOB", categoryKey: "system", balance: 0 },

      // Dlan wallets
      { id: "21000000-0000-4000-8000-000000000001", userId: SEED_IDS.dlan, type: "MAIN", name: "Saldo Utama", categoryKey: "main", balance: 0 },
      { id: "21000000-0000-4000-8000-000000000002", userId: SEED_IDS.dlan, type: "POCKET", name: "Uang Makan", categoryKey: "food", balance: 0, targetAmount: 1_000_000 },
      { id: "21000000-0000-4000-8000-000000000003", userId: SEED_IDS.dlan, type: "POCKET", name: "Transportasi", categoryKey: "transport", balance: 0, targetAmount: 500_000 },

      // Raka wallets
      { id: "22000000-0000-4000-8000-000000000001", userId: SEED_IDS.raka, type: "MAIN", name: "Saldo Utama", categoryKey: "main", balance: 0 },
      { id: "22000000-0000-4000-8000-000000000002", userId: SEED_IDS.raka, type: "POCKET", name: "Jajan Kampus", categoryKey: "food", balance: 0, targetAmount: 600_000 },
      { id: "22000000-0000-4000-8000-000000000003", userId: SEED_IDS.raka, type: "POCKET", name: "Kos & Listrik", categoryKey: "bills", balance: 0, targetAmount: 1_200_000 },

      // Sari wallets
      { id: "23000000-0000-4000-8000-000000000001", userId: SEED_IDS.sari, type: "MAIN", name: "Saldo Utama", categoryKey: "main", balance: 0 },
      { id: "23000000-0000-4000-8000-000000000002", userId: SEED_IDS.sari, type: "POCKET", name: "Dana Darurat", categoryKey: "savings", balance: 0, targetAmount: 15_000_000, isLocked: true },
      { id: "23000000-0000-4000-8000-000000000003", userId: SEED_IDS.sari, type: "POCKET", name: "Tagihan Bulanan", categoryKey: "bills", balance: 0, targetAmount: 1_500_000 },

      // Pak Budi wallets
      { id: "24000000-0000-4000-8000-000000000001", userId: SEED_IDS.pakBudi, type: "MAIN", name: "Saldo Utama", categoryKey: "main", balance: 0 },
      { id: "24000000-0000-4000-8000-000000000002", userId: SEED_IDS.pakBudi, type: "MERCHANT_SETTLEMENT", name: "Kas Warung Kopi Pak Budi", categoryKey: "merchant", balance: 0 },
      { id: "24000000-0000-4000-8000-000000000003", userId: SEED_IDS.pakBudi, type: "MERCHANT_SETTLEMENT", name: "Settlement Kopi Kenangan Bengkulu", categoryKey: "merchant", balance: 0 },

      // Tania (UNVERIFIED near Rp2M limit)
      { id: "25000000-0000-4000-8000-000000000001", userId: SEED_IDS.tania, type: "MAIN", name: "Saldo Utama", categoryKey: "main", balance: 0 },

      // Admin
      { id: "26000000-0000-4000-8000-000000000001", userId: SEED_IDS.admin, type: "MAIN", name: "Saldo Utama", categoryKey: "main", balance: 0 },
    ];

    for (const w of walletRows) {
      await client.query(
        `INSERT INTO wallets (id, user_id, wallet_type, name, category_key, balance, target_amount, is_locked)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          w.id,
          w.userId,
          w.type,
          w.name,
          w.categoryKey,
          w.balance.toFixed(2),
          w.targetAmount ? w.targetAmount.toFixed(2) : null,
          Boolean(w.isLocked),
        ]
      );
    }

    // 4. Merchants (for QRIS & SakuKilat Bisnis)
    await client.query(
      `INSERT INTO merchants (id, owner_user_id, nmid, merchant_name, merchant_city, category, category_scale, mdr_bps, settlement_wallet_id)
       VALUES
         ('30000000-0000-4000-8000-000000000001', $1, 'ID1026177100011', 'Warung Kopi Pak Budi', 'Kota Bengkulu', 'Makanan & Minuman', 'UMI', 30, '24000000-0000-4000-8000-000000000002'),
         ('30000000-0000-4000-8000-000000000002', $1, 'ID1026177100022', 'Kopi Kenangan Bengkulu', 'Kota Bengkulu', 'Makanan & Minuman', 'UME', 70, '24000000-0000-4000-8000-000000000003'),
         ('30000000-0000-4000-8000-000000000003', $1, 'ID1026317100033', 'TransJakarta Harmoni', 'Jakarta Pusat', 'Transportasi', 'UBE', 70, '24000000-0000-4000-8000-000000000002')`,
      [SEED_IDS.pakBudi]
    );

    const W = {
      genesis: "20000000-0000-4000-8000-000000000001",
      escrow: "20000000-0000-4000-8000-000000000002",
      fee: "20000000-0000-4000-8000-000000000003",
      ppob: "20000000-0000-4000-8000-000000000004",
      dlanMain: "21000000-0000-4000-8000-000000000001",
      dlanFood: "21000000-0000-4000-8000-000000000002",
      dlanTransport: "21000000-0000-4000-8000-000000000003",
      rakaMain: "22000000-0000-4000-8000-000000000001",
      rakaFood: "22000000-0000-4000-8000-000000000002",
      rakaBills: "22000000-0000-4000-8000-000000000003",
      sariMain: "23000000-0000-4000-8000-000000000001",
      sariSavings: "23000000-0000-4000-8000-000000000002",
      sariBills: "23000000-0000-4000-8000-000000000003",
      budiMain: "24000000-0000-4000-8000-000000000001",
      budiMerchant: "24000000-0000-4000-8000-000000000002",
      kenanganMerchant: "24000000-0000-4000-8000-000000000003",
      taniaMain: "25000000-0000-4000-8000-000000000001",
    };

    const daysAgo = (d: number, hour = 10) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      dt.setHours(hour, 15, 0, 0);
      return dt;
    };

    // 5. Genesis Double-Entry Funding
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.systemUser,
      idempotencyKey: "seed-genesis-001",
      referenceNumber: "SK-GENESIS-0001",
      transactionType: "GENESIS",
      amount: 50_000_000_000,
      title: "Inisialisasi Escrow Float Bank Umum",
      category: "Sistem",
      sourceWalletId: W.genesis,
      destinationWalletId: W.escrow,
      createdAt: daysAgo(14, 8),
      legs: [
        { walletId: W.genesis, entryType: "DEBIT", amount: 50_000_000_000, description: "Genesis Vault allocation" },
        { walletId: W.escrow, entryType: "CREDIT", amount: 50_000_000_000, description: "Initial BI Escrow float reserve" },
      ],
    });

    // 6. Dlan's Reconciled Ledger (Total = Rp 1.250.000: Main 575k, Uang Makan 475k, Transportasi 200k)
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.dlan,
      idempotencyKey: "seed-dlan-topup-mandiri",
      referenceNumber: "SK-SEED-DLAN01",
      transactionType: "TOPUP",
      amount: 800_000,
      title: "Top Up via Mandiri Virtual Account",
      category: "Top Up",
      sourceWalletId: W.escrow,
      destinationWalletId: W.dlanMain,
      metadata: { channel: "VA_MANDIRI", vaNumber: "880111223344" },
      createdAt: daysAgo(5, 9),
      legs: [
        { walletId: W.escrow, entryType: "DEBIT", amount: 800_000, description: "Escrow settlement Mandiri VA" },
        { walletId: W.dlanMain, entryType: "CREDIT", amount: 800_000, description: "Top Up Saldo Utama Mandiri VA" },
      ],
    });

    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.dlan,
      idempotencyKey: "seed-dlan-move-makan",
      referenceNumber: "SK-SEED-DLAN02",
      transactionType: "POCKET_MOVE",
      amount: 500_000,
      title: "Alokasi ke Kantong Uang Makan",
      category: "Kantong Pintar",
      sourceWalletId: W.dlanMain,
      destinationWalletId: W.dlanFood,
      createdAt: daysAgo(4, 11),
      legs: [
        { walletId: W.dlanMain, entryType: "DEBIT", amount: 500_000, description: "Pindah ke Uang Makan" },
        { walletId: W.dlanFood, entryType: "CREDIT", amount: 500_000, description: "Terima alokasi Uang Makan" },
      ],
    });

    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.dlan,
      idempotencyKey: "seed-dlan-move-transport",
      referenceNumber: "SK-SEED-DLAN03",
      transactionType: "POCKET_MOVE",
      amount: 225_000,
      title: "Alokasi ke Kantong Transportasi",
      category: "Kantong Pintar",
      sourceWalletId: W.dlanMain,
      destinationWalletId: W.dlanTransport,
      createdAt: daysAgo(4, 11),
      legs: [
        { walletId: W.dlanMain, entryType: "DEBIT", amount: 225_000, description: "Pindah ke Transportasi" },
        { walletId: W.dlanTransport, entryType: "CREDIT", amount: 225_000, description: "Terima alokasi Transportasi" },
      ],
    });

    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.dlan,
      counterpartyUserId: SEED_IDS.pakBudi,
      idempotencyKey: "seed-dlan-qris-tj",
      referenceNumber: "SK-SEED-DLAN04",
      transactionType: "QRIS",
      amount: 25_000,
      title: "TransJakarta Harmoni",
      category: "Transportasi",
      sourceWalletId: W.dlanTransport,
      destinationWalletId: W.budiMerchant,
      metadata: { merchantName: "TransJakarta Harmoni", merchantCity: "Jakarta Pusat", mdrFee: 175 },
      createdAt: daysAgo(2, 8),
      legs: [
        { walletId: W.dlanTransport, entryType: "DEBIT", amount: 25_000, description: "QRIS TransJakarta Harmoni" },
        { walletId: W.budiMerchant, entryType: "CREDIT", amount: 24_825, description: "QRIS settlement net MDR" },
        { walletId: W.fee, entryType: "CREDIT", amount: 175, description: "QRIS Issuer MDR 0.7%" },
      ],
    });

    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.dlan,
      idempotencyKey: "seed-dlan-topup-bca",
      referenceNumber: "SK-SEED-DLAN05",
      transactionType: "TOPUP",
      amount: 500_000,
      title: "Top Up via BCA Virtual Account",
      category: "Top Up",
      sourceWalletId: W.escrow,
      destinationWalletId: W.dlanMain,
      metadata: { channel: "VA_BCA", vaNumber: "3901011223344" },
      createdAt: daysAgo(1, 14),
      legs: [
        { walletId: W.escrow, entryType: "DEBIT", amount: 500_000, description: "Escrow settlement BCA VA" },
        { walletId: W.dlanMain, entryType: "CREDIT", amount: 500_000, description: "Top Up Saldo Utama BCA VA" },
      ],
    });

    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.dlan,
      counterpartyUserId: SEED_IDS.pakBudi,
      idempotencyKey: "seed-dlan-qris-kenangan",
      referenceNumber: "SK-SEED-DLAN06",
      transactionType: "QRIS",
      amount: 25_000,
      title: "Kopi Kenangan Bengkulu",
      category: "Makanan & Minuman",
      sourceWalletId: W.dlanFood,
      destinationWalletId: W.kenanganMerchant,
      metadata: { merchantName: "Kopi Kenangan Bengkulu", merchantCity: "Kota Bengkulu", mdrFee: 175 },
      createdAt: daysAgo(0, 9),
      legs: [
        { walletId: W.dlanFood, entryType: "DEBIT", amount: 25_000, description: "QRIS Kopi Kenangan Bengkulu" },
        { walletId: W.kenanganMerchant, entryType: "CREDIT", amount: 24_825, description: "QRIS settlement Kopi Kenangan" },
        { walletId: W.fee, entryType: "CREDIT", amount: 175, description: "QRIS Issuer MDR 0.7%" },
      ],
    });

    // 7. Raka's Ledger (Main 650k, Jajan Kampus 250k, Kos & Listrik 400k)
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.raka,
      idempotencyKey: "seed-raka-topup",
      referenceNumber: "SK-SEED-RAKA01",
      transactionType: "TOPUP",
      amount: 1_300_000,
      title: "Top Up via BNI Virtual Account",
      category: "Top Up",
      sourceWalletId: W.escrow,
      destinationWalletId: W.rakaMain,
      createdAt: daysAgo(3, 10),
      legs: [
        { walletId: W.escrow, entryType: "DEBIT", amount: 1_300_000, description: "Escrow settlement BNI VA" },
        { walletId: W.rakaMain, entryType: "CREDIT", amount: 1_300_000, description: "Top Up Saldo Utama Raka" },
      ],
    });
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.raka,
      idempotencyKey: "seed-raka-move-1",
      referenceNumber: "SK-SEED-RAKA02",
      transactionType: "POCKET_MOVE",
      amount: 250_000,
      title: "Alokasi ke Jajan Kampus",
      category: "Kantong Pintar",
      sourceWalletId: W.rakaMain,
      destinationWalletId: W.rakaFood,
      createdAt: daysAgo(2, 10),
      legs: [
        { walletId: W.rakaMain, entryType: "DEBIT", amount: 250_000, description: "Pindah ke Jajan Kampus" },
        { walletId: W.rakaFood, entryType: "CREDIT", amount: 250_000, description: "Alokasi Jajan Kampus" },
      ],
    });
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.raka,
      idempotencyKey: "seed-raka-move-2",
      referenceNumber: "SK-SEED-RAKA03",
      transactionType: "POCKET_MOVE",
      amount: 400_000,
      title: "Alokasi ke Kos & Listrik",
      category: "Kantong Pintar",
      sourceWalletId: W.rakaMain,
      destinationWalletId: W.rakaBills,
      createdAt: daysAgo(2, 10),
      legs: [
        { walletId: W.rakaMain, entryType: "DEBIT", amount: 400_000, description: "Pindah ke Kos & Listrik" },
        { walletId: W.rakaBills, entryType: "CREDIT", amount: 400_000, description: "Alokasi Kos & Listrik" },
      ],
    });

    // 8. Sari's Ledger (Main 4.2M, Dana Darurat 6.5M locked, Tagihan Bulanan 850k + PPOB history)
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.sari,
      idempotencyKey: "seed-sari-topup",
      referenceNumber: "SK-SEED-SARI01",
      transactionType: "TOPUP",
      amount: 11_702_500,
      title: "Gaji Bulanan via BRI Virtual Account",
      category: "Top Up",
      sourceWalletId: W.escrow,
      destinationWalletId: W.sariMain,
      createdAt: daysAgo(6, 8),
      legs: [
        { walletId: W.escrow, entryType: "DEBIT", amount: 11_702_500, description: "Escrow BRI VA Sari" },
        { walletId: W.sariMain, entryType: "CREDIT", amount: 11_702_500, description: "Top Up Gaji Sari" },
      ],
    });
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.sari,
      idempotencyKey: "seed-sari-move-emergency",
      referenceNumber: "SK-SEED-SARI02",
      transactionType: "POCKET_MOVE",
      amount: 6_500_000,
      title: "Alokasi Dana Darurat",
      category: "Kantong Pintar",
      sourceWalletId: W.sariMain,
      destinationWalletId: W.sariSavings,
      createdAt: daysAgo(5, 9),
      legs: [
        { walletId: W.sariMain, entryType: "DEBIT", amount: 6_500_000, description: "Pindah ke Dana Darurat" },
        { walletId: W.sariSavings, entryType: "CREDIT", amount: 6_500_000, description: "Dana Darurat terkunci" },
      ],
    });
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.sari,
      idempotencyKey: "seed-sari-move-bills",
      referenceNumber: "SK-SEED-SARI03",
      transactionType: "POCKET_MOVE",
      amount: 1_002_500,
      title: "Alokasi Tagihan Bulanan",
      category: "Kantong Pintar",
      sourceWalletId: W.sariMain,
      destinationWalletId: W.sariBills,
      createdAt: daysAgo(5, 9),
      legs: [
        { walletId: W.sariMain, entryType: "DEBIT", amount: 1_002_500, description: "Pindah ke Tagihan Bulanan" },
        { walletId: W.sariBills, entryType: "CREDIT", amount: 1_002_500, description: "Alokasi Tagihan" },
      ],
    });
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.sari,
      idempotencyKey: "seed-sari-ppob-pln",
      referenceNumber: "SK-SEED-SARI04",
      transactionType: "PPOB",
      amount: 150_000,
      adminFee: 2500,
      title: "Token Listrik PLN Rp150.000",
      category: "Listrik PLN",
      sourceWalletId: W.sariBills,
      destinationWalletId: W.ppob,
      metadata: {
        productCode: "PLN_150",
        customerNo: "54120987654",
        tokenNumber: "4819-3302-9918-7741-5520",
      },
      createdAt: daysAgo(2, 19),
      legs: [
        { walletId: W.sariBills, entryType: "DEBIT", amount: 152_500, description: "Beli Token PLN Rp150.000 + admin" },
        { walletId: W.ppob, entryType: "CREDIT", amount: 150_000, description: "Biller PLN Token" },
        { walletId: W.fee, entryType: "CREDIT", amount: 2_500, description: "Komisi PPOB PLN" },
      ],
    });

    // 9. Pak Budi Merchant Initial Main + QRIS Income
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.pakBudi,
      idempotencyKey: "seed-budi-topup",
      referenceNumber: "SK-SEED-BUDI01",
      transactionType: "TOPUP",
      amount: 1_150_000,
      title: "Top Up Modal Usaha BSI VA",
      category: "Top Up",
      sourceWalletId: W.escrow,
      destinationWalletId: W.budiMain,
      createdAt: daysAgo(4, 7),
      legs: [
        { walletId: W.escrow, entryType: "DEBIT", amount: 1_150_000, description: "Escrow BSI VA Pak Budi" },
        { walletId: W.budiMain, entryType: "CREDIT", amount: 1_150_000, description: "Saldo Utama Pak Budi" },
      ],
    });

    // 10. Tania (UNVERIFIED user near Rp2.000.000 limit: Rp1.850.000)
    await executeDoubleEntryInTx(client, {
      userId: SEED_IDS.tania,
      idempotencyKey: "seed-tania-topup",
      referenceNumber: "SK-SEED-TANIA01",
      transactionType: "TOPUP",
      amount: 1_850_000,
      title: "Top Up via BCA Virtual Account",
      category: "Top Up",
      sourceWalletId: W.escrow,
      destinationWalletId: W.taniaMain,
      createdAt: daysAgo(1, 13),
      legs: [
        { walletId: W.escrow, entryType: "DEBIT", amount: 1_850_000, description: "Escrow BCA VA Tania" },
        { walletId: W.taniaMain, entryType: "CREDIT", amount: 1_850_000, description: "Saldo Utama Tania" },
      ],
    });

    // 11. Seed an active Split Bill created by Dlan
    const splitBillId = "40000000-0000-4000-8000-000000000001";
    await client.query(
      `INSERT INTO split_bills (id, creator_user_id, title, split_mode, total_amount, items_json, status)
       VALUES ($1, $2, $3, 'EQUAL', 120000.00, $4, 'OPEN')`,
      [
        splitBillId,
        SEED_IDS.dlan,
        "Makan Siang Ayam Geprek Bersama",
        JSON.stringify([
          { name: "Paket Geprek Mozza x3", price: 105000 },
          { name: "Es Teh Manis x3", price: 15000 },
        ]),
      ]
    );
    await client.query(
      `INSERT INTO split_bill_participants (split_bill_id, user_id, display_name, phone_number, share_amount, status, paid_at)
       VALUES
         ($1, $2, 'Dlan Kusuma', '+6285211223344', 40000.00, 'PAID', NOW()),
         ($1, $3, 'Raka Pratama', '+6281234567890', 40000.00, 'PENDING', NULL),
         ($1, $4, 'Sari Wulandari', '+6281398765432', 40000.00, 'PENDING', NULL)`,
      [splitBillId, SEED_IDS.dlan, SEED_IDS.raka, SEED_IDS.sari]
    );

    // 12. Notifications
    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES
         ($1, 'IN_APP', 'Pembayaran QRIS Berhasil', 'Pembayaran Rp25.000 ke Kopi Kenangan Bengkulu dari kantong Uang Makan telah berhasil.'),
         ($1, 'IN_APP', 'Top Up BCA VA Masuk', 'Saldo Utama bertambah Rp500.000 melalui BCA Virtual Account.'),
         ($2, 'IN_APP', 'Tagihan Patungan Baru', 'Dlan Kusuma mengundang Anda patungan Rp40.000 untuk Makan Siang Ayam Geprek Bersama.')`,
      [SEED_IDS.dlan, SEED_IDS.raka]
    );
  });
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log("SakuKilat database seeded successfully.");
      return closePool();
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

