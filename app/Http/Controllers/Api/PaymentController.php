<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Exceptions\DomainException;
use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Models\User;
use App\Services\IdempotencyService;
use App\Services\PaymentService;
use App\Services\QrisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;

final class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentService $payments,
        private readonly IdempotencyService $idempotency,
        private readonly QrisService $qris,
    ) {}

    public function qrisPresets(): JsonResponse
    {
        return response()->json([
            'data' => [
                'presets' => [
                    [
                        'id' => 'kenangan',
                        'label' => 'Kopi Kenangan Bengkulu (Statis)',
                        'badge' => 'QRIS Statis',
                        'payload' => $this->qris->buildQrisPayload('ID1026177100022', 'Kopi Kenangan Bengkulu', 'Kota Bengkulu', null, false),
                    ],
                    [
                        'id' => 'warung-budi',
                        'label' => 'Warung Kopi Pak Budi (Dinamis Rp 38.000)',
                        'badge' => 'Rp 38.000',
                        'payload' => $this->qris->buildQrisPayload('ID1026177100011', 'Warung Kopi Pak Budi', 'Kota Bengkulu', 38_000, true),
                    ],
                    [
                        'id' => 'tj',
                        'label' => 'TransJakarta Harmoni (Dinamis Rp 3.500)',
                        'badge' => 'Rp 3.500',
                        'payload' => $this->qris->buildQrisPayload('ID1026317100033', 'TransJakarta Harmoni', 'Jakarta Pusat', 3_500, true),
                    ],
                ],
            ],
        ]);
    }

    public function transferContacts(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $contacts = User::query()
            ->where('role', '!=', 'SYSTEM')
            ->where('id', '!=', $user->id)
            ->orderBy('created_at')
            ->limit(4)
            ->get(['full_name', 'phone_number']);

        return response()->json(['data' => ['contacts' => $contacts]]);
    }

    public function qrisDecode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'raw_qr_payload' => ['required', 'string', 'min:8'],
        ]);

        return response()->json([
            'data' => $this->payments->decodeQris($data['raw_qr_payload']),
        ]);
    }

    public function qrisExecute(Request $request): JsonResponse
    {
        $data = $request->validate([
            'inquiry_id' => ['nullable', 'string'],
            'raw_qr_payload' => ['nullable', 'string'],
            'source_wallet_id' => ['required', 'uuid'],
            'amount' => ['required', 'integer', 'min:1000', 'max:20000000'],
            'tx_auth_token' => ['required', 'string', 'min:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $res = $this->idempotency->run(
            $key,
            $user->id,
            '/api/v1/payments/qris/execute',
            $data,
            function () use ($user, $data, $key): array {
                $tx = $this->payments->executeQrisPayment($user, $data, (string) $key);

                return ['status' => 201, 'body' => ['data' => $tx->toArray()]];
            }
        );

        return response()->json($res['body'], $res['status']);
    }

    public function transferLookup(Request $request): JsonResponse
    {
        $phone = trim((string) $request->query('phone', ''));
        if ($phone === '') {
            throw new DomainException('PHONE_REQUIRED', 'Parameter phone wajib diisi.', 400);
        }

        return response()->json(['data' => $this->payments->lookupP2pRecipient($phone)]);
    }

    public function p2pTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'recipient_phone' => ['required', 'string', 'min:9', 'max:20'],
            'source_wallet_id' => ['required', 'uuid'],
            'amount' => ['required', 'integer', 'min:1000', 'max:20000000'],
            'notes' => ['nullable', 'string', 'max:120'],
            'tx_auth_token' => ['required', 'string', 'min:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $res = $this->idempotency->run(
            $key,
            $user->id,
            '/api/v1/transfers/p2p',
            $data,
            function () use ($user, $data, $key): array {
                $tx = $this->payments->executeP2pTransfer($user, $data, (string) $key);

                return ['status' => 201, 'body' => ['data' => $tx->toArray()]];
            }
        );

        return response()->json($res['body'], $res['status']);
    }

    public function bankTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bank_code' => ['required', 'in:BCA,MANDIRI,BNI,BRI,BSI,CIMB,JAGO,SEABANK'],
            'account_number' => ['required', 'regex:/^\d{8,20}$/'],
            'account_holder_name' => ['required', 'string', 'min:2', 'max:100'],
            'source_wallet_id' => ['required', 'uuid'],
            'amount' => ['required', 'integer', 'min:10000', 'max:20000000'],
            'notes' => ['nullable', 'string', 'max:120'],
            'tx_auth_token' => ['required', 'string', 'min:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $res = $this->idempotency->run(
            $key,
            $user->id,
            '/api/v1/transfers/bank',
            $data,
            function () use ($user, $data, $key): array {
                $out = $this->payments->executeBankTransfer($user, $data, (string) $key);

                return [
                    'status' => 201,
                    'body' => [
                        'data' => [
                            ...$out['transaction']->toArray(),
                            'bifast_quota_remaining_after' => $out['bifast_quota_remaining_after'],
                        ],
                    ],
                ];
            }
        );

        return response()->json($res['body'], $res['status']);
    }

    public function ppobCatalog(): JsonResponse
    {
        return response()->json(['data' => ['products' => PaymentService::PPOB_CATALOG]]);
    }

    public function ppobInquire(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_code' => ['required', 'string', 'min:2'],
            'customer_number' => ['required', 'string', 'min:6', 'max:24'],
        ]);

        return response()->json([
            'data' => $this->payments->inquirePpob($data['product_code'], $data['customer_number']),
        ]);
    }

    public function ppobExecute(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_code' => ['required', 'string', 'min:2'],
            'customer_number' => ['required', 'string', 'min:6', 'max:24'],
            'source_wallet_id' => ['required', 'uuid'],
            'tx_auth_token' => ['required', 'string', 'min:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $res = $this->idempotency->run(
            $key,
            $user->id,
            '/api/v1/ppob/execute',
            $data,
            function () use ($user, $data, $key): array {
                $tx = $this->payments->executePpob($user, $data, (string) $key);

                return ['status' => 201, 'body' => ['data' => $tx->toArray()]];
            }
        );

        return response()->json($res['body'], $res['status']);
    }

    public function transactions(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'transactions' => $this->payments->listTransactions($user, $request->query()),
            ],
        ]);
    }

    public function transactionDetail(Request $request, string $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $tx = Transaction::query()
            ->with(['ledgerEntries.wallet:id,name'])
            ->where('id', $id)
            ->where(fn ($q) => $q->where('user_id', $user->id)->orWhere('counterparty_user_id', $user->id))
            ->first();

        if (! $tx) {
            throw new DomainException('TRANSACTION_NOT_FOUND', 'Transaksi tidak ditemukan.', 404);
        }

        return response()->json(['data' => $tx]);
    }

    public function analyticsSummary(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $this->payments->getAnalyticsSummary($user)]);
    }

    public function exportCsv(Request $request): HttpResponse
    {
        /** @var User $user */
        $user = $request->user();
        $rows = $this->payments->listTransactions($user, [
            'direction' => (string) $request->query('direction', 'ALL'),
            'type' => (string) $request->query('type', 'ALL'),
            'q' => (string) $request->query('q', ''),
            'limit' => 100,
        ]);

        $lines = ['Referensi,Waktu,Judul,Kategori,Jenis,Status,Arah,Nominal,Admin,Total'];
        foreach ($rows as $r) {
            $title = str_replace('"', '""', $r['title']);
            $lines[] = implode(',', [
                $r['reference_number'],
                $r['created_at'],
                "\"{$title}\"",
                "\"{$r['category']}\"",
                $r['transaction_type'],
                $r['status'],
                $r['direction'],
                $r['amount'],
                $r['admin_fee'],
                $r['total_amount'],
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="mutasi-sakukilat-'.now()->format('Y-m-d').'.csv"',
        ]);
    }
}
