<?php

declare(strict_types=1);

use App\Http\Controllers\Web\SakuKilatWebController;
use App\Http\Middleware\AutoBootstrapDemoSession;
use Illuminate\Support\Facades\Route;

Route::get('/auth', [SakuKilatWebController::class, 'auth'])->name('auth');
Route::post('/demo-switch', [SakuKilatWebController::class, 'demoSwitch'])->name('demo.switch');
Route::post('/web-logout', [SakuKilatWebController::class, 'webLogout'])->name('web.logout');

Route::middleware([AutoBootstrapDemoSession::class, 'auth'])->group(function (): void {
    Route::get('/', [SakuKilatWebController::class, 'home'])->name('home');
    Route::get('/topup', [SakuKilatWebController::class, 'topup'])->name('topup');
    Route::get('/pockets', [SakuKilatWebController::class, 'pockets'])->name('pockets');
    Route::get('/qris', [SakuKilatWebController::class, 'qris'])->name('qris');
    Route::get('/transfer', [SakuKilatWebController::class, 'transfer'])->name('transfer');
    Route::get('/ppob', [SakuKilatWebController::class, 'ppob'])->name('ppob');
    Route::get('/split-bill', [SakuKilatWebController::class, 'splitBill'])->name('split-bill');
    Route::get('/riwayat', [SakuKilatWebController::class, 'riwayat'])->name('riwayat');
    Route::get('/riwayat/export.csv', [SakuKilatWebController::class, 'exportCsv'])->name('riwayat.csv');
    Route::get('/profil', [SakuKilatWebController::class, 'profil'])->name('profil');
    Route::get('/merchant', [SakuKilatWebController::class, 'merchant'])->name('merchant');
    Route::get('/admin', [SakuKilatWebController::class, 'admin'])->name('admin');
});
