import { getPool, withTransaction } from "@/db/pool";
import { DomainError, executeDoubleEntryInTx } from "@/lib/ledger";
import { consumeTxAuthToken } from "@/lib/auth";
import { normalizePhoneNumber } from "@/lib/crypto";
import { getUserBalanceLimitInfo } from "@/services/wallet.service";

export async function listSplitBills(userId: string) {
  const pool = getPool();
  const billsRes = await pool.query<{
    id: string;
    creator_user_id: string;
    creator_name: string;
    title: string;
    split_mode: "EQUAL" | "ITEMIZED";
    total_amount: string;
    items_json: unknown[];
    status: string;
    created_at: Date;
  }>(
    `SELECT DISTINCT sb.id, sb.creator_user_id, u.full_name AS creator_name, sb.title,
            sb.split_mode, sb.total_amount::text, sb.items_json, sb.status, sb.created_at
     FROM split_bills sb
     JOIN users u ON u.id = sb.creator_user_id
     LEFT JOIN split_bill_participants p ON p.split_bill_id = sb.id
     WHERE sb.creator_user_id = $1 OR p.user_id = $1
     ORDER BY sb.created_at DESC`,
    [userId]
  );

  const billIds = billsRes.rows.map((b) => b.id);
  if (billIds.length === 0) return [];

  const partRes = await pool.query<{
    id: string;
    split_bill_id: string;
    user_id: string;
    display_name: string;
    phone_number: string;
    share_amount: string;
    status: string;
    paid_at: Date | null;
  }>(
    `SELECT id, split_bill_id, user_id, display_name, phone_number, share_amount::text, status, paid_at
     FROM split_bill_participants
     WHERE split_bill_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [billIds]
  );

  return billsRes.rows.map((b) => {
    const participants = partRes.rows
      .filter((p) => p.split_bill_id === b.id)
      .map((p) => ({
        id: p.id,
        userId: p.user_id,
        displayName: p.display_name,
        phoneNumber: p.phone_number,
        shareAmount: parseFloat(p.share_amount),
        status: p.status,
        paidAt: p.paid_at ? p.paid_at.toISOString() : null,
      }));
    const collectedAmount = participants
      .filter((p) => p.status === "PAID")
      .reduce((acc, p) => acc + p.shareAmount, 0);

    return {
      id: b.id,
      creatorUserId: b.creator_user_id,
      creatorName: b.creator_name,
      title: b.title,
      splitMode: b.split_mode,
      totalAmount: parseFloat(b.total_amount),
      collectedAmount,
      items: b.items_json,
      status: b.status,
      createdAt: b.created_at.toISOString(),
      participants,
    };
  });
}

export async function createSplitBill(params: {
  creatorUserId: string;
  title: string;
  splitMode: "EQUAL" | "ITEMIZED";
  participantPhones: string[];
  totalAmount?: number;
  items?: Array<{ name: string; price: number; assigned_phones: string[] }>;
}) {
  return withTransaction(async (client) => {
    const creatorRes = await client.query<{
      id: string;
      full_name: string;
      phone_number: string;
    }>(`SELECT id, full_name, phone_number FROM users WHERE id = $1`, [
      params.creatorUserId,
    ]);
    if (creatorRes.rowCount === 0) {
      throw new DomainError("USER_NOT_FOUND", "Pembuat tagihan tidak ditemukan.", 404);
    }
    const creator = creatorRes.rows[0];

    const normalizedPeers = Array.from(
      new Set(params.participantPhones.map(normalizePhoneNumber))
    ).filter((ph) => ph !== creator.phone_number);

    if (normalizedPeers.length === 0) {
      throw new DomainError(
        "NO_PARTICIPANTS",
        "Pilih minimal 1 teman SakuKilat selain diri sendiri.",
        400
      );
    }

    const usersRes = await client.query<{
      id: string;
      full_name: string;
      phone_number: string;
    }>(
      `SELECT id, full_name, phone_number
       FROM users
       WHERE phone_number = ANY($1::varchar[]) AND account_status = 'ACTIVE' AND role <> 'SYSTEM'`,
      [normalizedPeers]
    );

    if (usersRes.rowCount !== normalizedPeers.length) {
      const found = new Set(usersRes.rows.map((u) => u.phone_number));
      const missing = normalizedPeers.filter((ph) => !found.has(ph));
      throw new DomainError(
        "PARTICIPANT_NOT_FOUND",
        `Nomor berikut belum terdaftar di SakuKilat: ${missing.join(", ")}`,
        404
      );
    }

    const allParticipants = [creator, ...usersRes.rows];
    const shares = new Map<string, number>();

    let computedTotal = 0;

    if (params.splitMode === "EQUAL") {
      if (!params.totalAmount || params.totalAmount <= 0) {
        throw new DomainError("INVALID_AMOUNT", "Nominal total tagihan wajib diisi.", 400);
      }
      computedTotal = Math.round(params.totalAmount);
      const count = allParticipants.length;
      const base = Math.floor(computedTotal / count);
      let remainder = computedTotal - base * count;

      for (const p of allParticipants) {
        const extra = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder -= 1;
        shares.set(p.phone_number, base + extra);
      }
    } else {
      const items = params.items || [];
      if (items.length === 0) {
        throw new DomainError(
          "NO_ITEMS",
          "Mode Per Item membutuhkan minimal 1 item tagihan.",
          400
        );
      }
      for (const p of allParticipants) shares.set(p.phone_number, 0);

      for (const item of items) {
        const assigned = Array.from(new Set(item.assigned_phones.map(normalizePhoneNumber)));
        for (const ph of assigned) {
          if (!shares.has(ph)) {
            throw new DomainError(
              "INVALID_ITEM_ASSIGNEE",
              `Peserta ${ph} pada item "${item.name}" tidak ada di daftar patungan.`,
              400
            );
          }
        }
        const price = Math.round(item.price);
        computedTotal += price;
        const perPerson = Math.floor(price / assigned.length);
        let rem = price - perPerson * assigned.length;
        for (const ph of assigned) {
          const extra = rem > 0 ? 1 : 0;
          if (rem > 0) rem -= 1;
          shares.set(ph, (shares.get(ph) || 0) + perPerson + extra);
        }
      }
    }

    const billInsert = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO split_bills (creator_user_id, title, split_mode, total_amount, items_json, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')
       RETURNING id, created_at`,
      [
        creator.id,
        params.title.trim(),
        params.splitMode,
        computedTotal.toFixed(2),
        JSON.stringify(params.items || []),
      ]
    );
    const billId = billInsert.rows[0].id;

    for (const p of allParticipants) {
      const share = shares.get(p.phone_number) || 0;
      if (share <= 0) continue;
      const isCreator = p.id === creator.id;
      await client.query(
        `INSERT INTO split_bill_participants (
           split_bill_id, user_id, display_name, phone_number, share_amount, status, paid_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          billId,
          p.id,
          p.full_name,
          p.phone_number,
          share.toFixed(2),
          isCreator ? "PAID" : "PENDING",
          isCreator ? new Date() : null,
        ]
      );

      if (!isCreator) {
        await client.query(
          `INSERT INTO notifications (user_id, channel, title, body)
           VALUES ($1, 'IN_APP', 'Tagihan Patungan Baru', $2)`,
          [
            p.id,
            `${creator.full_name} menagih patungan "${params.title}" sebesar Rp${share.toLocaleString("id-ID")}.`,
          ]
        );
      }
    }

    return {
      id: billId,
      title: params.title,
      splitMode: params.splitMode,
      totalAmount: computedTotal,
    };
  });
}

export async function paySplitBillShare(params: {
  payerUserId: string;
  splitBillId: string;
  sourceWalletId: string;
  txAuthToken: string;
  idempotencyKey: string;
}) {
  const authorized = await consumeTxAuthToken(params.txAuthToken, params.payerUserId);
  if (!authorized) {
    throw new DomainError(
      "TX_AUTH_INVALID",
      "Token otorisasi PIN tidak valid atau kedaluwarsa.",
      401
    );
  }

  return withTransaction(async (client) => {
    const billRes = await client.query<{
      id: string;
      creator_user_id: string;
      title: string;
      status: string;
    }>(
      `SELECT id, creator_user_id, title, status FROM split_bills WHERE id = $1 FOR UPDATE`,
      [params.splitBillId]
    );
    if (billRes.rowCount === 0) {
      throw new DomainError("SPLIT_BILL_NOT_FOUND", "Tagihan patungan tidak ditemukan.", 404);
    }
    const bill = billRes.rows[0];

    const partRes = await client.query<{
      id: string;
      share_amount: string;
      status: string;
      display_name: string;
    }>(
      `SELECT id, share_amount::text, status, display_name
       FROM split_bill_participants
       WHERE split_bill_id = $1 AND user_id = $2
       FOR UPDATE`,
      [bill.id, params.payerUserId]
    );
    if (partRes.rowCount === 0) {
      throw new DomainError(
        "NOT_A_PARTICIPANT",
        "Anda tidak terdaftar dalam patungan ini.",
        403
      );
    }
    const part = partRes.rows[0];
    if (part.status === "PAID") {
      throw new DomainError("ALREADY_PAID", "Bagian patungan Anda sudah lunas.", 409);
    }

    const srcRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets WHERE id = $1 AND user_id = $2`,
      [params.sourceWalletId, params.payerUserId]
    );
    if (srcRes.rowCount === 0) {
      throw new DomainError("WALLET_NOT_FOUND", "Dompet sumber dana tidak valid.", 403);
    }

    const creatorMainRes = await client.query<{ id: string }>(
      `SELECT id FROM wallets WHERE user_id = $1 AND wallet_type = 'MAIN'`,
      [bill.creator_user_id]
    );
    if (creatorMainRes.rowCount === 0) {
      throw new DomainError("CREATOR_WALLET_MISSING", "Dompet pembuat patungan tidak ada.", 500);
    }
    const creatorWalletId = creatorMainRes.rows[0].id;
    const shareAmount = parseFloat(part.share_amount);

    const creatorLimit = await getUserBalanceLimitInfo(client, bill.creator_user_id);
    if (creatorLimit.currentTotalBalance + shareAmount > creatorLimit.balanceLimit) {
      throw new DomainError(
        "RECIPIENT_LIMIT_EXCEEDED",
        "Saldo pembuat patungan akan melewati batas maksimal akunnya.",
        422
      );
    }

    const committed = await executeDoubleEntryInTx(client, {
      userId: params.payerUserId,
      counterpartyUserId: bill.creator_user_id,
      idempotencyKey: params.idempotencyKey,
      transactionType: "SPLIT_BILL",
      amount: shareAmount,
      adminFee: 0,
      title: `Bayar Patungan: ${bill.title}`,
      category: "Patungan",
      sourceWalletId: params.sourceWalletId,
      destinationWalletId: creatorWalletId,
      metadata: {
        splitBillId: bill.id,
        billTitle: bill.title,
        sourceWalletName: srcRes.rows[0].name,
      },
      legs: [
        {
          walletId: params.sourceWalletId,
          entryType: "DEBIT",
          amount: shareAmount,
          description: `Bayar patungan ${bill.title}`,
        },
        {
          walletId: creatorWalletId,
          entryType: "CREDIT",
          amount: shareAmount,
          description: `Terima patungan dari ${part.display_name}`,
        },
      ],
    });

    await client.query(
      `UPDATE split_bill_participants
       SET status = 'PAID', paid_transaction_id = $1, paid_at = NOW()
       WHERE id = $2`,
      [committed.id, part.id]
    );

    const remainingRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM split_bill_participants WHERE split_bill_id = $1 AND status = 'PENDING'`,
      [bill.id]
    );
    if (parseInt(remainingRes.rows[0].cnt, 10) === 0) {
      await client.query(
        `UPDATE split_bills SET status = 'SETTLED', updated_at = NOW() WHERE id = $1`,
        [bill.id]
      );
    }

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Pembayaran Patungan Diterima', $2)`,
      [
        bill.creator_user_id,
        `${part.display_name} telah melunasi bagian patungan "${bill.title}" sebesar Rp${shareAmount.toLocaleString("id-ID")}.`,
      ]
    );

    return committed;
  });
}

