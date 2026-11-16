<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kyc_documents', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('nik_encrypted');
            $table->string('nik_hash', 64)->index();
            $table->string('full_name_ktp', 120);
            $table->text('ktp_image_url');
            $table->text('selfie_image_url');
            $table->decimal('liveness_score', 5, 2)->default(98.50);
            $table->string('status', 16)->default('PENDING')->index();
            $table->text('rejection_reason')->nullable();
            $table->timestampTz('verified_at')->nullable();
            $table->timestampsTz();
        });

        Schema::create('wallets', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('wallet_type', 32);
            $table->string('name', 80);
            $table->string('category_key', 32)->default('main');
            $table->decimal('balance', 15, 2)->default(0.00);
            $table->decimal('target_amount', 15, 2)->nullable();
            $table->decimal('daily_limit', 15, 2)->nullable();
            $table->string('currency', 3)->default('IDR');
            $table->boolean('is_locked')->default(false);
            $table->timestampsTz();

            $table->index(['user_id', 'wallet_type']);
        });

        Schema::create('merchants', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('owner_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('nmid', 32)->unique();
            $table->string('merchant_name', 120);
            $table->string('merchant_city', 80);
            $table->string('category', 48);
            $table->string('category_scale', 16)->default('UMI');
            $table->unsignedInteger('mdr_bps')->default(30);
            $table->foreignUuid('settlement_wallet_id')->constrained('wallets')->restrictOnDelete();
            $table->timestampsTz();
        });

        Schema::create('transactions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignUuid('counterparty_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('idempotency_key', 128)->unique();
            $table->string('reference_number', 64)->unique();
            $table->string('transaction_type', 24)->index();
            $table->string('status', 16)->default('SUCCESS');
            $table->decimal('amount', 15, 2);
            $table->decimal('admin_fee', 15, 2)->default(0.00);
            $table->decimal('total_amount', 15, 2);
            $table->string('title', 140);
            $table->string('category', 48)->default('Lainnya');
            $table->foreignUuid('source_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->foreignUuid('destination_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->json('metadata')->nullable();
            $table->timestampsTz();

            $table->index(['user_id', 'created_at']);
            $table->index(['counterparty_user_id', 'created_at']);
        });

        Schema::create('ledger_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('transaction_id')->constrained('transactions')->restrictOnDelete();
            $table->foreignUuid('wallet_id')->constrained('wallets')->restrictOnDelete();
            $table->string('entry_type', 8);
            $table->decimal('amount', 15, 2);
            $table->decimal('balance_before', 15, 2);
            $table->decimal('balance_after', 15, 2);
            $table->string('description', 180);
            $table->timestampsTz();

            $table->index(['wallet_id', 'created_at']);
        });

        Schema::create('idempotency_keys', function (Blueprint $table): void {
            $table->string('key', 128)->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('endpoint', 120);
            $table->string('request_hash', 64);
            $table->unsignedInteger('response_status');
            $table->json('response_body');
            $table->timestampsTz();
        });

        Schema::create('topup_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('channel', 32);
            $table->string('channel_label', 80);
            $table->string('va_number', 40);
            $table->decimal('amount', 15, 2);
            $table->decimal('admin_fee', 15, 2)->default(0.00);
            $table->string('status', 16)->default('PENDING');
            $table->string('external_ref', 64)->unique();
            $table->text('failure_reason')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampsTz();

            $table->index(['user_id', 'created_at']);
        });

        Schema::create('split_bills', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('creator_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title', 140);
            $table->string('split_mode', 16);
            $table->decimal('total_amount', 15, 2);
            $table->json('items_json')->nullable();
            $table->string('status', 16)->default('OPEN');
            $table->timestampsTz();
        });

        Schema::create('split_bill_participants', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('split_bill_id')->constrained('split_bills')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('display_name', 120);
            $table->string('phone_number', 24);
            $table->decimal('share_amount', 15, 2);
            $table->string('status', 16)->default('PENDING');
            $table->foreignUuid('paid_transaction_id')->nullable()->constrained('transactions')->nullOnDelete();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampsTz();
        });

        Schema::create('outbox_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('event_id');
            $table->string('topic', 64);
            $table->string('aggregate_type', 48);
            $table->uuid('aggregate_id');
            $table->json('payload');
            $table->string('status', 16)->default('PUBLISHED');
            $table->timestampsTz();
        });

        Schema::create('notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('channel', 24)->default('IN_APP');
            $table->string('title', 120);
            $table->text('body');
            $table->boolean('is_read')->default(false);
            $table->json('metadata')->nullable();
            $table->timestampsTz();

            $table->index(['user_id', 'created_at']);
        });

        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE wallets ADD CONSTRAINT chk_wallets_balance_nonneg CHECK (balance >= 0)');
            DB::statement("CREATE UNIQUE INDEX idx_wallets_single_main_per_user ON wallets (user_id) WHERE wallet_type = 'MAIN'");
            DB::statement("CREATE UNIQUE INDEX idx_kyc_verified_nik_hash ON kyc_documents (nik_hash) WHERE status = 'VERIFIED'");
            DB::statement("
                CREATE OR REPLACE FUNCTION prevent_ledger_entries_mutation()
                RETURNS TRIGGER AS \$\$
                BEGIN
                    RAISE EXCEPTION 'ledger_entries is strictly append-only; % is prohibited', TG_OP
                        USING ERRCODE = '42501';
                END;
                \$\$ LANGUAGE plpgsql;
            ");
            DB::statement('CREATE TRIGGER trg_prevent_ledger_update BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_mutation()');
            DB::statement('CREATE TRIGGER trg_prevent_ledger_delete BEFORE DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_mutation()');
        } elseif ($driver === 'sqlite') {
            DB::statement("
                CREATE TRIGGER trg_prevent_ledger_update BEFORE UPDATE ON ledger_entries
                BEGIN
                    SELECT RAISE(ABORT, 'ledger_entries is strictly append-only; UPDATE is prohibited');
                END;
            ");
            DB::statement("
                CREATE TRIGGER trg_prevent_ledger_delete BEFORE DELETE ON ledger_entries
                BEGIN
                    SELECT RAISE(ABORT, 'ledger_entries is strictly append-only; DELETE is prohibited');
                END;
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON ledger_entries');
            DB::statement('DROP TRIGGER IF EXISTS trg_prevent_ledger_delete ON ledger_entries');
            DB::statement('DROP FUNCTION IF EXISTS prevent_ledger_entries_mutation()');
        }

        Schema::dropIfExists('notifications');
        Schema::dropIfExists('outbox_events');
        Schema::dropIfExists('split_bill_participants');
        Schema::dropIfExists('split_bills');
        Schema::dropIfExists('topup_orders');
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('ledger_entries');
        Schema::dropIfExists('transactions');
        Schema::dropIfExists('merchants');
        Schema::dropIfExists('wallets');
        Schema::dropIfExists('kyc_documents');
    }
};
